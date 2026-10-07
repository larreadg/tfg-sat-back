import { AuditoriaLog, Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { NotFoundError } from '../../shared/utils/errors';
import { ACCIONES, ENTIDADES_AUDITABLES, GRUPOS_ACCION } from './auditoria.acciones';
import {
  AuditoriaDetalleDTO,
  AuditoriaListItemDTO,
  AuditoriaListadoDTO,
  CatalogoAuditoriaDTO,
} from './auditoria.types';
import { ListarAuditoriaQuery } from './auditoria.validation';

/**
 * Consultas de la bitacora. **Solo lectura, a proposito**: no hay `crear`,
 * `actualizar` ni `eliminar` en este service. Escribir en el log es exclusivo de
 * `auditoria.registro.ts`, al que llaman los services de dominio; la API HTTP
 * nunca escribe. Si alguna vez aparece aca un `update`, la bitacora deja de
 * servir como evidencia.
 */

/** Etiqueta legible de una accion. Si la fila es de una accion que ya se saco del
 * catalogo, se devuelve el nombre crudo: una entrada vieja no se oculta. */
const ETIQUETA_POR_ACCION = new Map<string, string>(
  Object.values(ACCIONES).map((definicion) => [definicion.accion, definicion.etiqueta]),
);

function etiquetaAccion(accion: string): string {
  return ETIQUETA_POR_ACCION.get(accion) ?? accion;
}

/** Nombre a mostrar del actor, resuelto de los tres campos posibles. */
function nombreActor(fila: AuditoriaLog): string {
  if (fila.actorTipo === 'USUARIO') {
    return fila.usuarioNombre || fila.usuarioCorreo || `Usuario #${fila.usuarioId ?? '?'}`;
  }
  if (fila.actorTipo === 'CIUDADANO') {
    return fila.actorEtiqueta ?? 'Ciudadano';
  }
  if (fila.actorTipo === 'ANONIMO') {
    // No hay a quien nombrar: lo unico que identifica al visitante es su IP, que
    // el listado ya muestra en su propia columna.
    return fila.ip ? `Sin identificar (${fila.ip})` : 'Sin identificar';
  }
  return fila.actorEtiqueta ?? 'Sistema';
}

function aListItem(fila: AuditoriaLog): AuditoriaListItemDTO {
  return {
    id: fila.id,
    fecha: fila.fecha,
    accion: fila.accion,
    accionEtiqueta: etiquetaAccion(fila.accion),
    operacion: fila.operacion,
    entidad: fila.entidad,
    entidadId: fila.entidadId,
    descripcion: fila.descripcion,
    exito: fila.exito,
    actorTipo: fila.actorTipo,
    actor: nombreActor(fila),
    usuarioId: fila.usuarioId,
    usuarioCorreo: fila.usuarioCorreo,
    ip: fila.ip,
    tieneDetalle: fila.datosPrevios !== null || fila.datosNuevos !== null || fila.metadatos !== null,
  };
}

function construirWhere(filtros: ListarAuditoriaQuery): Prisma.AuditoriaLogWhereInput {
  const where: Prisma.AuditoriaLogWhereInput = {};

  if (filtros.desde || filtros.hasta) {
    where.fecha = { gte: filtros.desde, lte: filtros.hasta };
  }
  if (filtros.accion) {
    where.accion = filtros.accion;
  }
  if (filtros.operacion) {
    where.operacion = filtros.operacion;
  }
  if (filtros.entidad) {
    where.entidad = filtros.entidad;
  }
  if (filtros.entidadId) {
    where.entidadId = filtros.entidadId;
  }
  if (filtros.usuarioId !== undefined) {
    where.usuarioId = filtros.usuarioId;
  }
  if (filtros.actorTipo) {
    where.actorTipo = filtros.actorTipo;
  }
  if (filtros.ip) {
    where.ip = { contains: filtros.ip };
  }
  if (filtros.exito !== undefined) {
    where.exito = filtros.exito;
  }
  if (filtros.q) {
    where.OR = [
      { descripcion: { contains: filtros.q, mode: 'insensitive' } },
      { usuarioNombre: { contains: filtros.q, mode: 'insensitive' } },
      { usuarioCorreo: { contains: filtros.q, mode: 'insensitive' } },
      { entidadId: { contains: filtros.q, mode: 'insensitive' } },
    ];
  }

  return where;
}

export async function listarAuditoria(filtros: ListarAuditoriaQuery): Promise<AuditoriaListadoDTO> {
  const where = construirWhere(filtros);
  const { page, pageSize } = filtros;

  const [total, filas] = await prisma.$transaction([
    prisma.auditoriaLog.count({ where }),
    prisma.auditoriaLog.findMany({
      where,
      // Por fecha e id: dos entradas de la misma request comparten el milisegundo,
      // y sin el desempate la paginacion puede repetir o saltear filas.
      orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return {
    items: filas.map(aListItem),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function obtenerEntrada(id: number): Promise<AuditoriaDetalleDTO> {
  const fila = await prisma.auditoriaLog.findUnique({ where: { id } });

  if (!fila) {
    throw new NotFoundError('No existe una entrada de auditoria con ese id.');
  }

  return {
    ...aListItem(fila),
    userAgent: fila.userAgent,
    metodoHttp: fila.metodoHttp,
    ruta: fila.ruta,
    requestId: fila.requestId,
    datosPrevios: fila.datosPrevios,
    datosNuevos: fila.datosNuevos,
    metadatos: fila.metadatos,
  };
}

/**
 * Catalogo para armar los filtros del panel. El front no hardcodea ninguna de
 * estas listas (mismo criterio que `GET /admin/webhooks/eventos`): agregar una
 * accion al catalogo la hace filtrable sin tocar el front.
 *
 * `usuarios` sale de un `groupBy` sobre la propia bitacora y no de la tabla
 * `Usuario`: asi el filtro por usuario no exige `usuario.ver`, y solo lista a
 * quienes efectivamente hicieron algo.
 */
export async function obtenerCatalogo(): Promise<CatalogoAuditoriaDTO> {
  const grupos = await prisma.auditoriaLog.groupBy({
    by: ['usuarioId', 'usuarioNombre', 'usuarioCorreo'],
    where: { actorTipo: 'USUARIO', usuarioId: { not: null } },
    _max: { fecha: true },
    orderBy: { _max: { fecha: 'desc' } },
    take: 200,
  });

  // Un mismo usuario puede aparecer en varios grupos si cambio de correo o de
  // nombre entre dos acciones (el snapshot es el del momento). Se queda el mas
  // reciente, que es el primero por el orderBy.
  const usuarios = [];
  const vistos = new Set<number>();
  for (const grupo of grupos) {
    if (grupo.usuarioId == null || vistos.has(grupo.usuarioId)) {
      continue;
    }
    vistos.add(grupo.usuarioId);
    usuarios.push({
      usuarioId: grupo.usuarioId,
      nombre: grupo.usuarioNombre || grupo.usuarioCorreo || `Usuario #${grupo.usuarioId}`,
      correo: grupo.usuarioCorreo,
    });
  }

  return {
    acciones: Object.values(ACCIONES).map((definicion) => ({
      accion: definicion.accion,
      etiqueta: definicion.etiqueta,
      operacion: definicion.operacion,
      entidad: definicion.entidad,
      grupo: definicion.grupo,
    })),
    grupos: [...GRUPOS_ACCION],
    entidades: ENTIDADES_AUDITABLES,
    operaciones: ['CREAR', 'ACTUALIZAR', 'ELIMINAR', 'ACCESO'],
    actoresTipo: ['USUARIO', 'CIUDADANO', 'SISTEMA', 'ANONIMO'],
    usuarios,
  };
}
