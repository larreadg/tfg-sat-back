import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import {
  GetUsersParams,
  PaginatedResult,
  UserDTO,
  USER_DTO_SELECT,
  USER_SORT_FIELDS,
  UserSortField,
} from './users.types';
import { CreateUserBody, UpdateUserBody } from './users.validation';
import { NotFoundError, ConflictError, BadRequestError } from '../../shared/utils/errors';
import { hashPassword } from '../../shared/utils/password';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export async function getAllUsers(params: GetUsersParams): Promise<PaginatedResult<UserDTO>> {
  const page = params.page && params.page > 0 ? Math.floor(params.page) : 1;
  const limit = params.limit && params.limit > 0 ? Math.min(Math.floor(params.limit), MAX_LIMIT) : DEFAULT_LIMIT;
  const where: Prisma.UsuarioWhereInput | undefined =
    params.activo !== undefined ? { activo: params.activo } : undefined;
  const orderBy = parseSort(params.sort);

  const [data, total] = await prisma.$transaction([
    prisma.usuario.findMany({ where, orderBy, skip: (page - 1) * limit, take: limit, select: USER_DTO_SELECT }),
    prisma.usuario.count({ where }),
  ]);

  return {
    data,
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

  return user;
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

  return prisma.$transaction(async (tx) => {
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
      select: USER_DTO_SELECT,
    });

    await asignarRoles(tx, usuario.id, data.rolIds, actorId);

    return usuario;
  });
}

export async function updateUser(actorId: number, id: number, data: UpdateUserBody): Promise<UserDTO> {
  await getUserById(id);

  if (data.correoElectronico) {
    await asegurarCorreoDisponible(data.correoElectronico, id);
  }
  await asegurarRolesExisten(data.rolIds);

  return prisma.$transaction(async (tx) => {
    const usuario = await tx.usuario.update({
      where: { id },
      data: {
        correoElectronico: data.correoElectronico,
        telefono: data.telefono,
        activo: data.activo,
        ...(data.contrasena ? { hashContrasena: hashPassword(data.contrasena) } : {}),
        usuarioActualizacionId: actorId,
      },
      select: USER_DTO_SELECT,
    });

    if (data.rolIds) {
      await tx.usuarioRol.deleteMany({ where: { usuarioId: id } });
      await asignarRoles(tx, id, data.rolIds, actorId);
    }

    return usuario;
  });
}

export async function deleteUser(id: number): Promise<void> {
  await getUserById(id);

  await prisma.usuario.delete({ where: { id } });
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
