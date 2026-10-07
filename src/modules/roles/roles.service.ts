import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../shared/utils/errors';
import { ActualizarRolBody, CrearRolBody } from './roles.validation';
import { registrarAuditoria } from '../auditoria/auditoria.registro';

const ROL_ADMIN = 'ADMIN';

type RolConRelaciones = Prisma.RolGetPayload<{
  include: { rolPermisos: { include: { permiso: true } }; _count: { select: { usuarios: true } } };
}>;

function serializar(rol: RolConRelaciones) {
  return {
    id: rol.id,
    nombre: rol.nombre,
    descripcion: rol.descripcion,
    cantidadUsuarios: rol._count.usuarios,
    permisos: rol.rolPermisos
      .map((rp) => ({ id: rp.permiso.id, nombre: rp.permiso.nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre)),
  };
}

const INCLUDE_ROL = {
  rolPermisos: { include: { permiso: true } },
  _count: { select: { usuarios: true } },
} as const;

export async function listarPermisos() {
  const permisos = await prisma.permiso.findMany({ orderBy: { nombre: 'asc' } });
  return permisos.map((p) => ({ id: p.id, nombre: p.nombre, descripcion: p.descripcion }));
}

export async function listarRoles() {
  const roles = await prisma.rol.findMany({ orderBy: { nombre: 'asc' }, include: INCLUDE_ROL });
  return roles.map(serializar);
}

export async function obtenerRol(id: number) {
  const rol = await prisma.rol.findUnique({ where: { id }, include: INCLUDE_ROL });
  if (!rol) {
    throw new NotFoundError('No existe un rol con ese id.');
  }
  return serializar(rol);
}

async function validarPermisoIds(tx: Prisma.TransactionClient, permisoIds: number[]): Promise<void> {
  if (permisoIds.length === 0) {
    return;
  }
  const existentes = await tx.permiso.count({ where: { id: { in: permisoIds } } });
  if (existentes !== new Set(permisoIds).size) {
    throw new BadRequestError('Uno o mas permisos indicados no existen.');
  }
}

export async function crearRol(input: CrearRolBody, usuarioId: number) {
  const duplicado = await prisma.rol.findUnique({ where: { nombre: input.nombre } });
  if (duplicado) {
    throw new ConflictError(`Ya existe un rol con el nombre "${input.nombre}".`);
  }

  const rol = await prisma.$transaction(async (tx) => {
    await validarPermisoIds(tx, input.permisoIds);

    const creado = await tx.rol.create({
      data: {
        nombre: input.nombre,
        descripcion: input.descripcion ?? null,
        usuarioCreacionId: usuarioId,
        usuarioActualizacionId: usuarioId,
      },
    });

    if (input.permisoIds.length > 0) {
      await tx.rolPermiso.createMany({
        data: input.permisoIds.map((permisoId) => ({
          rolId: creado.id,
          permisoId,
          usuarioCreacionId: usuarioId,
          usuarioActualizacionId: usuarioId,
        })),
      });
    }

    return tx.rol.findUniqueOrThrow({ where: { id: creado.id }, include: INCLUDE_ROL });
  });

  const dto = serializar(rol);
  registrarAuditoria({
    accion: 'ROL_CREAR',
    entidadId: dto.id,
    descripcion: `Creo el rol "${dto.nombre}" con ${dto.permisos.length} permiso(s)`,
    datosNuevos: dto,
  });

  return dto;
}

export async function actualizarRol(id: number, input: ActualizarRolBody, usuarioId: number) {
  // Con `INCLUDE_ROL` y no pelado: es el "antes" que va a la auditoria, y los
  // permisos son justamente lo que interesa comparar en un cambio de rol.
  const rol = await prisma.rol.findUnique({ where: { id }, include: INCLUDE_ROL });
  if (!rol) {
    throw new NotFoundError('No existe un rol con ese id.');
  }

  if (input.nombre && input.nombre !== rol.nombre) {
    if (rol.nombre === ROL_ADMIN) {
      throw new ForbiddenError('No se puede renombrar el rol ADMIN.');
    }
    const duplicado = await prisma.rol.findUnique({ where: { nombre: input.nombre } });
    if (duplicado) {
      throw new ConflictError(`Ya existe un rol con el nombre "${input.nombre}".`);
    }
  }

  const actualizado = await prisma.$transaction(async (tx) => {
    await tx.rol.update({
      where: { id },
      data: {
        nombre: input.nombre ?? undefined,
        descripcion: input.descripcion === undefined ? undefined : input.descripcion,
        usuarioActualizacionId: usuarioId,
      },
    });

    if (input.permisoIds) {
      await validarPermisoIds(tx, input.permisoIds);
      await tx.rolPermiso.deleteMany({ where: { rolId: id } });
      if (input.permisoIds.length > 0) {
        await tx.rolPermiso.createMany({
          data: input.permisoIds.map((permisoId) => ({
            rolId: id,
            permisoId,
            usuarioCreacionId: usuarioId,
            usuarioActualizacionId: usuarioId,
          })),
        });
      }
    }

    return tx.rol.findUniqueOrThrow({ where: { id }, include: INCLUDE_ROL });
  });

  const previo = serializar(rol);
  const dto = serializar(actualizado);
  registrarAuditoria({
    accion: 'ROL_EDITAR',
    entidadId: id,
    descripcion: `Edito el rol "${dto.nombre}"`,
    datosPrevios: previo,
    datosNuevos: dto,
    // Cambiar los permisos de un rol cambia lo que pueden hacer todos sus
    // usuarios: se deja explicito para no tener que diffear los dos JSON a ojo.
    metadatos: {
      permisosAntes: previo.permisos.length,
      permisosDespues: dto.permisos.length,
      cambioPermisos: input.permisoIds !== undefined,
    },
  });

  return dto;
}

export async function eliminarRol(id: number): Promise<void> {
  const rol = await prisma.rol.findUnique({
    where: { id },
    include: { _count: { select: { usuarios: true } } },
  });
  if (!rol) {
    throw new NotFoundError('No existe un rol con ese id.');
  }
  if (rol.nombre === ROL_ADMIN) {
    throw new ForbiddenError('No se puede eliminar el rol ADMIN.');
  }
  if (rol._count.usuarios > 0) {
    throw new ConflictError('No se puede eliminar un rol con usuarios asignados.');
  }

  await prisma.rol.delete({ where: { id } });

  registrarAuditoria({
    accion: 'ROL_ELIMINAR',
    entidadId: id,
    descripcion: `Elimino el rol "${rol.nombre}"`,
    datosPrevios: { id: rol.id, nombre: rol.nombre, descripcion: rol.descripcion },
  });
}
