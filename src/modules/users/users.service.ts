import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import {
  GetUsersParams,
  PaginatedResult,
  UserDTO,
  USER_DTO_SELECT,
  USER_SORT_FIELDS,
  UserSortField,
  UsuarioSeleccionado,
} from './users.types';
import { CreateUserBody, UpdateUserBody } from './users.validation';
import { NotFoundError, ConflictError, BadRequestError } from '../../shared/utils/errors';
import { hashPassword } from '../../shared/utils/password';
import { registrarAuditoria } from '../auditoria/auditoria.registro';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/** Aplana `roles` (viene anidado en la tabla puente `UsuarioRol`). */
function serializar(usuario: UsuarioSeleccionado): UserDTO {
  return {
    ...usuario,
    roles: usuario.roles.map(({ rol }) => rol),
  };
}

function construirWhere(params: GetUsersParams): Prisma.UsuarioWhereInput | undefined {
  const condiciones: Prisma.UsuarioWhereInput[] = [];

  if (params.activo !== undefined) {
    condiciones.push({ activo: params.activo });
  }

  if (params.q) {
    condiciones.push({
      OR: [
        { correoElectronico: { contains: params.q, mode: 'insensitive' } },
        { persona: { nombres: { contains: params.q, mode: 'insensitive' } } },
        { persona: { apellidos: { contains: params.q, mode: 'insensitive' } } },
        { persona: { documento: { contains: params.q, mode: 'insensitive' } } },
      ],
    });
  }

  return condiciones.length > 0 ? { AND: condiciones } : undefined;
}

export async function getAllUsers(params: GetUsersParams): Promise<PaginatedResult<UserDTO>> {
  const page = params.page && params.page > 0 ? Math.floor(params.page) : 1;
  const limit = params.limit && params.limit > 0 ? Math.min(Math.floor(params.limit), MAX_LIMIT) : DEFAULT_LIMIT;
  const where = construirWhere(params);
  const orderBy = parseSort(params.sort);

  const [data, total] = await prisma.$transaction([
    prisma.usuario.findMany({ where, orderBy, skip: (page - 1) * limit, take: limit, select: USER_DTO_SELECT }),
    prisma.usuario.count({ where }),
  ]);

  return {
    data: data.map(serializar),
    meta: { page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) },
  };
}

function parseSort(sort?: string): Prisma.UsuarioOrderByWithRelationInput {
  if (!sort) {
    return { fechaCreacion: 'desc' };
  }

  const direccion = sort.startsWith('-') ? 'desc' : 'asc';
  const campo = sort.replace(/^-/, '');

  if (!USER_SORT_FIELDS.includes(campo as UserSortField)) {
    throw new BadRequestError(
      `Campo de orden invalido: "${campo}". Valores permitidos: ${USER_SORT_FIELDS.join(', ')}.`,
    );
  }

  return { [campo]: direccion };
}

export async function getUserById(id: number): Promise<UserDTO> {
  const user = await prisma.usuario.findUnique({ where: { id }, select: USER_DTO_SELECT });

  if (!user) {
    throw new NotFoundError(`Usuario con id ${id} no encontrado`);
  }

  return serializar(user);
}

/**
 * Crea, en una unica transaccion, la `Persona`, el `Usuario` (con la contrasena
 * hasheada) y sus vinculos `UsuarioRol`. `actorId` es el usuario autenticado que
 * realiza la accion, usado para los campos de auditoria.
 */
export async function createUser(actorId: number, data: CreateUserBody): Promise<UserDTO> {
  await asegurarCorreoDisponible(data.correoElectronico);
  await asegurarDocumentoDisponible(data.persona.documento);
  await asegurarRolesExisten(data.rolIds);

  const creado = await prisma.$transaction(async (tx) => {
    const persona = await tx.persona.create({
      data: {
        nombres: data.persona.nombres,
        apellidos: data.persona.apellidos,
        documento: data.persona.documento,
        usuarioCreacionId: actorId,
        usuarioActualizacionId: actorId,
      },
    });

    const usuario = await tx.usuario.create({
      data: {
        correoElectronico: data.correoElectronico,
        telefono: data.telefono,
        hashContrasena: hashPassword(data.contrasena),
        activo: data.activo ?? true,
        personaId: persona.id,
        usuarioCreacionId: actorId,
        usuarioActualizacionId: actorId,
      },
      select: { id: true },
    });

    await asignarRoles(tx, usuario.id, data.rolIds, actorId);

    // Se relee DESPUES de asignar los roles: `USER_DTO_SELECT` los incluye y el
    // objeto del create sale con `roles: []`.
    const creado = await tx.usuario.findUniqueOrThrow({ where: { id: usuario.id }, select: USER_DTO_SELECT });

    return serializar(creado);
  });

  // Despues de la transaccion y no adentro: la auditoria no participa del rollback
  // a proposito (ver `auditoria.registro.ts`), asi que registrar aca garantiza que
  // la entrada solo describa lo que realmente quedo escrito. `UserDTO` no incluye
  // `hashContrasena`, asi que no hay nada sensible que omitir.
  registrarAuditoria({
    accion: 'USUARIO_CREAR',
    entidadId: creado.id,
    descripcion: `Dio de alta al usuario ${creado.correoElectronico}`,
    datosNuevos: creado,
  });

  return creado;
}

export async function updateUser(actorId: number, id: number, data: UpdateUserBody): Promise<UserDTO> {
  // `getUserById` ya se llamaba para validar que existe; su resultado ahora
  // tambien es el "antes" de la auditoria, sin sumar una consulta extra.
  const previo = await getUserById(id);

  if (data.correoElectronico) {
    await asegurarCorreoDisponible(data.correoElectronico, id);
  }
  await asegurarRolesExisten(data.rolIds);

  const actualizado = await prisma.$transaction(async (tx) => {
    await tx.usuario.update({
      where: { id },
      data: {
        correoElectronico: data.correoElectronico,
        telefono: data.telefono,
        activo: data.activo,
        ...(data.contrasena ? { hashContrasena: hashPassword(data.contrasena) } : {}),
        usuarioActualizacionId: actorId,
      },
      select: { id: true },
    });

    if (data.rolIds) {
      await tx.usuarioRol.deleteMany({ where: { usuarioId: id } });
      await asignarRoles(tx, id, data.rolIds, actorId);
    }

    // Igual que en `createUser`: se relee al final para que `roles` refleje la
    // reasignacion recien hecha.
    const actualizado = await tx.usuario.findUniqueOrThrow({ where: { id }, select: USER_DTO_SELECT });

    return serializar(actualizado);
  });

  registrarAuditoria({
    accion: 'USUARIO_EDITAR',
    entidadId: id,
    descripcion: `Edito al usuario ${actualizado.correoElectronico}`,
    datosPrevios: previo,
    datosNuevos: actualizado,
    // Que se haya cambiado la contrasena es un dato de auditoria; el valor, no.
    metadatos: { cambioContrasena: data.contrasena !== undefined },
  });

  return actualizado;
}

export async function deleteUser(id: number): Promise<void> {
  const previo = await getUserById(id);

  await prisma.usuario.delete({ where: { id } });

  registrarAuditoria({
    accion: 'USUARIO_ELIMINAR',
    entidadId: id,
    descripcion: `Dio de baja al usuario ${previo.correoElectronico}`,
    datosPrevios: previo,
  });
}

async function asegurarCorreoDisponible(correoElectronico: string, idExcluido?: number): Promise<void> {
  const existente = await prisma.usuario.findUnique({ where: { correoElectronico } });

  if (existente && existente.id !== idExcluido) {
    throw new ConflictError(`Ya existe un usuario con correo ${correoElectronico}`);
  }
}

async function asegurarDocumentoDisponible(documento: string): Promise<void> {
  const existente = await prisma.persona.findUnique({ where: { documento } });

  if (existente) {
    throw new ConflictError(`Ya existe una persona con documento ${documento}`);
  }
}

async function asegurarRolesExisten(rolIds?: number[]): Promise<void> {
  if (!rolIds || rolIds.length === 0) {
    return;
  }

  const idsUnicos = [...new Set(rolIds)];
  const encontrados = await prisma.rol.count({ where: { id: { in: idsUnicos } } });

  if (encontrados !== idsUnicos.length) {
    throw new BadRequestError('Uno o mas roles indicados no existen.');
  }
}

async function asignarRoles(
  tx: Prisma.TransactionClient,
  usuarioId: number,
  rolIds: number[] | undefined,
  actorId: number,
): Promise<void> {
  if (!rolIds || rolIds.length === 0) {
    return;
  }

  await tx.usuarioRol.createMany({
    data: [...new Set(rolIds)].map((rolId) => ({
      usuarioId,
      rolId,
      usuarioCreacionId: actorId,
      usuarioActualizacionId: actorId,
    })),
  });
}
