import fs from 'fs';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { registrarAuditoria } from '../auditoria/auditoria.registro';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../shared/utils/errors';
import { PERMISOS } from '../../shared/permissions';
import {
  AdjuntoAlertaDTO,
  AdjuntoContenido,
  AutorDTO,
  ComentarioAlertaDTO,
  ComentariosListadoDTO,
  ResponsableDTO,
  ResumenTareasDTO,
  SeguimientoResumenDTO,
  TareaAlertaDTO,
  TareasAlertaDTO,
} from './alertas.seguimiento.types';
import { ActualizarTareaBody, CrearTareaBody, ListarComentariosQuery } from './alertas.seguimiento.validation';
import { eliminarArchivos, guardarAdjuntos, resolverRutaAbsoluta } from './alertas.adjuntos';

/**
 * Seguimiento de una alerta: comentarios, adjuntos y checklist de tareas.
 *
 * Division de responsabilidades con `alertas.service.ts`: ahi vive el ciclo de
 * vida de la alerta (creacion, deduplicacion, maquina de estados); aca, el
 * trabajo humano que se registra sobre ella. Se separo en otro archivo porque
 * el service de alertas ya pasa las 500 lineas.
 *
 * Quien escribe necesita `alerta.seguimiento` (ADMIN y ORGANISMO); quien lee,
 * `alerta.ver`. Eso lo resuelven las rutas: aca se asume ya autorizado, salvo
 * las reglas de autoria, que son de dominio y viven en este archivo.
 */

/** `select` del autor, repetido en todo el repo: nombre visible sin PII extra. */
const SELECT_AUTOR = {
  id: true,
  persona: { select: { nombres: true, apellidos: true } },
} as const;

type UsuarioConPersona = { id: number; persona: { nombres: string; apellidos: string } };

function autorDTO(usuario: UsuarioConPersona): AutorDTO {
  return {
    id: usuario.id,
    nombreCompleto: `${usuario.persona.nombres} ${usuario.persona.apellidos}`.trim(),
  };
}

/** 404 si la alerta no existe: todo el seguimiento cuelga de una alerta real. */
async function asegurarAlerta(alertaId: number): Promise<void> {
  const alerta = await prisma.alerta.findUnique({ where: { id: alertaId }, select: { id: true } });
  if (!alerta) {
    throw new NotFoundError('La alerta no existe.');
  }
}

// ---------------------------------------------------------------------------
// Comentarios
// ---------------------------------------------------------------------------

const INCLUDE_COMENTARIO = {
  usuario: { select: SELECT_AUTOR },
  adjuntos: {
    orderBy: { id: 'asc' },
    include: { usuario: { select: SELECT_AUTOR } },
  },
} satisfies Prisma.ComentarioAlertaInclude;

const INCLUDE_ADJUNTO = {
  usuario: { select: SELECT_AUTOR },
} satisfies Prisma.AdjuntoAlertaInclude;

type ComentarioConRelaciones = Prisma.ComentarioAlertaGetPayload<{
  include: typeof INCLUDE_COMENTARIO;
}>;

type AdjuntoConAutor = Prisma.AdjuntoAlertaGetPayload<{ include: typeof INCLUDE_ADJUNTO }>;

function adjuntoDTO(adjunto: AdjuntoConAutor): AdjuntoAlertaDTO {
  return {
    id: adjunto.id,
    comentarioId: adjunto.comentarioId,
    nombreOriginal: adjunto.nombreOriginal,
    tipoMime: adjunto.tipoMime,
    tamanoBytes: adjunto.tamanoBytes,
    esImagen: adjunto.esImagen,
    fechaCreacion: adjunto.fechaCreacion,
    autor: autorDTO(adjunto.usuario),
  };
}

function comentarioDTO(comentario: ComentarioConRelaciones): ComentarioAlertaDTO {
  return {
    id: comentario.id,
    cuerpo: comentario.cuerpo,
    fechaCreacion: comentario.fechaCreacion,
    autor: autorDTO(comentario.usuario),
    adjuntos: comentario.adjuntos.map(adjuntoDTO),
  };
}

/**
 * Hilo paginado, de lo mas nuevo a lo mas viejo. El front invierte cada pagina
 * para pintar el chat en orden cronologico; paginar "hacia atras" es la unica
 * forma de que "cargar mas" funcione en un hilo que sigue creciendo.
 */
export async function listarComentarios(
  alertaId: number,
  filtros: ListarComentariosQuery,
): Promise<ComentariosListadoDTO> {
  await asegurarAlerta(alertaId);

  const { page, pageSize } = filtros;
  const [total, comentarios] = await prisma.$transaction([
    prisma.comentarioAlerta.count({ where: { alertaId } }),
    prisma.comentarioAlerta.findMany({
      where: { alertaId },
      orderBy: { fechaCreacion: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: INCLUDE_COMENTARIO,
    }),
  ]);

  return {
    items: comentarios.map(comentarioDTO),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/**
 * Crea un comentario con sus adjuntos (0..5). Los archivos se validan y se
 * escriben ANTES de abrir la transaccion —hablar con el disco adentro de una
 * transaccion la mantiene abierta de gusto— y si la transaccion falla se
 * limpian los archivos ya escritos: ninguna fila sin archivo, ningun archivo
 * sin fila.
 */
export async function crearComentario(
  alertaId: number,
  usuarioId: number,
  cuerpo: string,
  archivos: Express.Multer.File[],
): Promise<ComentarioAlertaDTO> {
  await asegurarAlerta(alertaId);

  const guardados = await guardarAdjuntos(alertaId, archivos);

  try {
    const comentario = await prisma.comentarioAlerta.create({
      data: {
        alertaId,
        usuarioId,
        cuerpo,
        adjuntos: {
          create: guardados.map((adjunto) => ({
            alertaId,
            usuarioId,
            nombreOriginal: adjunto.nombreOriginal,
            rutaRelativa: adjunto.rutaRelativa,
            tipoMime: adjunto.tipoMime,
            tamanoBytes: adjunto.tamanoBytes,
            esImagen: adjunto.esImagen,
          })),
        },
      },
      include: INCLUDE_COMENTARIO,
    });

    const dto = comentarioDTO(comentario);
    registrarAuditoria({
      accion: 'ALERTA_COMENTARIO_CREAR',
      entidadId: dto.id,
      descripcion: `Comento en la alerta #${alertaId}`,
      // El cuerpo del comentario NO se copia a la bitacora: el hilo ya es su propia
      // evidencia (`ComentarioAlerta` es inmutable). Duplicar texto libre del
      // analista en dos tablas solo multiplica los lugares donde habria que ir a
      // buscarlo si alguna vez se cuela un dato personal.
      metadatos: { alertaId, largoCuerpo: cuerpo.length, adjuntos: guardados.length },
    });

    return dto;
  } catch (err) {
    await eliminarArchivos(guardados.map((a) => a.rutaRelativa));
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Adjuntos
// ---------------------------------------------------------------------------

/**
 * Todos los archivos de la alerta, vengan de un comentario o no: es lo que
 * alimenta la pestaña Archivos. Que el adjunto de un comentario aparezca aca
 * tambien es el objetivo del modelo unico con `comentarioId` opcional.
 */
export async function listarAdjuntos(alertaId: number): Promise<AdjuntoAlertaDTO[]> {
  await asegurarAlerta(alertaId);

  const adjuntos = await prisma.adjuntoAlerta.findMany({
    where: { alertaId },
    orderBy: { fechaCreacion: 'desc' },
    include: INCLUDE_ADJUNTO,
  });

  return adjuntos.map(adjuntoDTO);
}

/** Adjuntos sueltos: sin `comentarioId`, se ven solo en la pestaña Archivos. */
export async function subirAdjuntos(
  alertaId: number,
  usuarioId: number,
  archivos: Express.Multer.File[],
): Promise<AdjuntoAlertaDTO[]> {
  await asegurarAlerta(alertaId);

  if (archivos.length === 0) {
    throw new BadRequestError('Adjuntá al menos un archivo.');
  }

  const guardados = await guardarAdjuntos(alertaId, archivos);

  try {
    const creados = await prisma.$transaction((tx) =>
      Promise.all(
        guardados.map((adjunto) =>
          tx.adjuntoAlerta.create({
            data: {
              alertaId,
              usuarioId,
              nombreOriginal: adjunto.nombreOriginal,
              rutaRelativa: adjunto.rutaRelativa,
              tipoMime: adjunto.tipoMime,
              tamanoBytes: adjunto.tamanoBytes,
              esImagen: adjunto.esImagen,
            },
            include: INCLUDE_ADJUNTO,
          }),
        ),
      ),
    );

    const dtos = creados.map(adjuntoDTO);
    registrarAuditoria({
      accion: 'ALERTA_ADJUNTO_SUBIR',
      entidadId: alertaId,
      descripcion:
        dtos.length === 1
          ? `Subio el archivo "${dtos[0].nombreOriginal}" a la alerta #${alertaId}`
          : `Subio ${dtos.length} archivos a la alerta #${alertaId}`,
      datosNuevos: dtos.map((adjunto) => ({
        id: adjunto.id,
        nombreOriginal: adjunto.nombreOriginal,
        tipoMime: adjunto.tipoMime,
        tamanoBytes: adjunto.tamanoBytes,
      })),
      metadatos: { alertaId, cantidad: dtos.length },
    });

    return dtos;
  } catch (err) {
    await eliminarArchivos(guardados.map((a) => a.rutaRelativa));
    throw err;
  }
}

/**
 * Resuelve el archivo en disco para que el controller lo entregue. Hace TODO lo
 * que puede fallar (buscar la fila, validar la ruta, `stat`) antes de que el
 * controller toque `res`: el `errorHandler` del proyecto no mira
 * `res.headersSent`, asi que un error despues del primer byte reventaria con
 * ERR_HTTP_HEADERS_SENT en vez de devolver un JSON.
 */
export async function obtenerContenidoAdjunto(adjuntoId: number): Promise<AdjuntoContenido> {
  const adjunto = await prisma.adjuntoAlerta.findUnique({
    where: { id: adjuntoId },
    select: {
      alertaId: true,
      rutaRelativa: true,
      nombreOriginal: true,
      tipoMime: true,
      esImagen: true,
    },
  });

  if (!adjunto) {
    throw new NotFoundError('El archivo adjunto no existe.');
  }

  const rutaAbsoluta = resolverRutaAbsoluta(adjunto.rutaRelativa);

  let stat: fs.Stats;
  try {
    stat = await fs.promises.stat(rutaAbsoluta);
  } catch {
    // La fila existe pero el archivo no esta en disco (borrado a mano, volumen
    // no montado). Para quien consume es lo mismo que no existir.
    throw new NotFoundError('El archivo adjunto no esta disponible.');
  }

  // Una LECTURA que se audita. Estos archivos no estan en `uploads/` ni los sirve
  // un static: son documentos internos del organismo (un acta de inspeccion) y la
  // unica puerta es este endpoint. Quien se llevo cual no queda registrado en
  // ningun otro lado, y es justo lo que un auditor viene a preguntar.
  registrarAuditoria({
    accion: 'ALERTA_ADJUNTO_DESCARGAR',
    entidadId: adjuntoId,
    descripcion: `Descargo el archivo "${adjunto.nombreOriginal}" de la alerta #${adjunto.alertaId}`,
    metadatos: {
      alertaId: adjunto.alertaId,
      nombreOriginal: adjunto.nombreOriginal,
      tipoMime: adjunto.tipoMime,
      tamanoBytes: stat.size,
    },
  });

  return {
    rutaAbsoluta,
    nombreOriginal: adjunto.nombreOriginal,
    tipoMime: adjunto.tipoMime,
    tamanoBytes: stat.size,
    esImagen: adjunto.esImagen,
  };
}

/**
 * Borra un adjunto suelto. Reglas de dominio:
 *   - El que lo subio lo puede borrar; con `alerta.editar` se puede moderar lo
 *     de cualquiera (es el ADMIN).
 *   - Un adjunto que vino DENTRO de un comentario no se borra: el comentario es
 *     bitacora inmutable y quedaria hablando de un archivo fantasma.
 */
export async function eliminarAdjunto(
  adjuntoId: number,
  usuarioId: number,
  permisos: string[],
): Promise<void> {
  const adjunto = await prisma.adjuntoAlerta.findUnique({
    where: { id: adjuntoId },
    select: {
      id: true,
      alertaId: true,
      usuarioId: true,
      comentarioId: true,
      rutaRelativa: true,
      nombreOriginal: true,
      tipoMime: true,
      tamanoBytes: true,
    },
  });

  if (!adjunto) {
    throw new NotFoundError('El archivo adjunto no existe.');
  }

  if (adjunto.comentarioId !== null) {
    throw new ConflictError(
      'Este archivo es parte de un comentario y no se puede eliminar: el hilo de seguimiento es inmutable.',
    );
  }

  if (adjunto.usuarioId !== usuarioId && !permisos.includes(PERMISOS.ALERTAS_EDITAR)) {
    throw new ForbiddenError('Solo quien subió el archivo puede eliminarlo.');
  }

  await prisma.adjuntoAlerta.delete({ where: { id: adjuntoId } });
  await eliminarArchivos([adjunto.rutaRelativa]);

  registrarAuditoria({
    accion: 'ALERTA_ADJUNTO_ELIMINAR',
    entidadId: adjuntoId,
    descripcion: `Elimino el archivo "${adjunto.nombreOriginal}" de la alerta #${adjunto.alertaId}`,
    datosPrevios: {
      id: adjunto.id,
      nombreOriginal: adjunto.nombreOriginal,
      tipoMime: adjunto.tipoMime,
      tamanoBytes: adjunto.tamanoBytes,
    },
    metadatos: {
      alertaId: adjunto.alertaId,
      // Moderacion: que un ADMIN borre el archivo de otra persona no es lo mismo
      // que alguien borrando el suyo.
      moderacion: adjunto.usuarioId !== usuarioId,
    },
  });
}

// ---------------------------------------------------------------------------
// Tareas
// ---------------------------------------------------------------------------

const INCLUDE_TAREA = {
  responsable: { select: SELECT_AUTOR },
  usuarioCompletado: { select: SELECT_AUTOR },
  usuarioCreacion: { select: SELECT_AUTOR },
} satisfies Prisma.TareaAlertaInclude;

type TareaConRelaciones = Prisma.TareaAlertaGetPayload<{ include: typeof INCLUDE_TAREA }>;

/** Medianoche de hoy en UTC, para comparar contra una columna `DATE`. */
function hoyUtc(): Date {
  const ahora = new Date();
  return new Date(Date.UTC(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()));
}

/** 'YYYY-MM-DD' desde una columna `DATE` (que Prisma trae a medianoche UTC). */
function fechaCalendarioTexto(fecha: Date | null): string | null {
  return fecha ? fecha.toISOString().slice(0, 10) : null;
}

function fechaCalendarioDesdeTexto(texto: string): Date {
  return new Date(`${texto}T00:00:00Z`);
}

/**
 * Criterio UNICO de "vencida", usado tanto en el DTO de cada tarea como en el
 * resumen. Si estuviera escrito dos veces, el contador y los tags rojos se
 * contradecirian en cuanto uno cambiara.
 */
function estaVencida(tarea: { completada: boolean; fechaVencimiento: Date | null }): boolean {
  if (tarea.completada || !tarea.fechaVencimiento) {
    return false;
  }
  return tarea.fechaVencimiento.getTime() < hoyUtc().getTime();
}

function tareaDTO(tarea: TareaConRelaciones): TareaAlertaDTO {
  return {
    id: tarea.id,
    titulo: tarea.titulo,
    completada: tarea.completada,
    orden: tarea.orden,
    fechaVencimiento: fechaCalendarioTexto(tarea.fechaVencimiento),
    vencida: estaVencida(tarea),
    responsable: tarea.responsable ? autorDTO(tarea.responsable) : null,
    completadaPor: tarea.usuarioCompletado ? autorDTO(tarea.usuarioCompletado) : null,
    fechaCompletada: tarea.fechaCompletada,
    creadaPor: autorDTO(tarea.usuarioCreacion),
    fechaCreacion: tarea.fechaCreacion,
  };
}

function resumirTareas(items: TareaAlertaDTO[]): ResumenTareasDTO {
  const total = items.length;
  const completadas = items.filter((t) => t.completada).length;
  return {
    total,
    completadas,
    vencidas: items.filter((t) => t.vencida).length,
    // Entero: el progressbar no tiene que dividir ni redondear nada.
    porcentaje: total === 0 ? 0 : Math.round((completadas / total) * 100),
  };
}

export async function listarTareas(alertaId: number): Promise<TareasAlertaDTO> {
  await asegurarAlerta(alertaId);

  const tareas = await prisma.tareaAlerta.findMany({
    where: { alertaId },
    orderBy: [{ orden: 'asc' }, { id: 'asc' }],
    include: INCLUDE_TAREA,
  });

  const items = tareas.map(tareaDTO);
  return { items, resumen: resumirTareas(items) };
}

/** 404 si el responsable no puede ni ver la alerta: asignarsela seria un bug. */
async function asegurarResponsableAsignable(responsableId: number): Promise<void> {
  const usuario = await prisma.usuario.findFirst({
    where: { id: responsableId, activo: true, ...FILTRO_PUEDE_VER_ALERTAS },
    select: { id: true },
  });
  if (!usuario) {
    throw new BadRequestError('El responsable elegido no puede acceder a las alertas.');
  }
}

export async function crearTarea(
  alertaId: number,
  usuarioId: number,
  body: CrearTareaBody,
): Promise<TareaAlertaDTO> {
  await asegurarAlerta(alertaId);

  if (body.responsableId) {
    await asegurarResponsableAsignable(body.responsableId);
  }

  // Al final de la lista. El orden explicito deja la puerta abierta a reordenar
  // sin depender del id.
  const ultima = await prisma.tareaAlerta.findFirst({
    where: { alertaId },
    orderBy: { orden: 'desc' },
    select: { orden: true },
  });

  const tarea = await prisma.tareaAlerta.create({
    data: {
      alertaId,
      titulo: body.titulo,
      orden: (ultima?.orden ?? -1) + 1,
      responsableId: body.responsableId ?? null,
      fechaVencimiento: body.fechaVencimiento
        ? fechaCalendarioDesdeTexto(body.fechaVencimiento)
        : null,
      usuarioCreacionId: usuarioId,
    },
    include: INCLUDE_TAREA,
  });

  const dto = tareaDTO(tarea);
  registrarAuditoria({
    accion: 'ALERTA_TAREA_CREAR',
    entidadId: dto.id,
    descripcion: `Agrego la tarea "${dto.titulo}" a la alerta #${alertaId}`,
    datosNuevos: {
      id: dto.id,
      titulo: dto.titulo,
      responsable: dto.responsable?.nombreCompleto ?? null,
      fechaVencimiento: dto.fechaVencimiento,
    },
    metadatos: { alertaId },
  });

  return dto;
}

/**
 * Actualizacion parcial con contrato de tres estados por campo: lo que no viene
 * no se toca, `null` quita y un valor reemplaza. De ahi el `in body` en vez de
 * `!== undefined`: hay que distinguir "no vino" de "vino null".
 *
 * Tildar `completada` tiene efecto lateral: sella fecha y usuario, y los limpia
 * al destildar. No son campos del body a proposito —quien completo la tarea lo
 * decide el token, no el cliente.
 */
export async function actualizarTarea(
  tareaId: number,
  usuarioId: number,
  body: ActualizarTareaBody,
): Promise<TareaAlertaDTO> {
  const actual = await prisma.tareaAlerta.findUnique({
    where: { id: tareaId },
    // Mas campos de los dos que necesita la logica: son el "antes" de la auditoria
    // y vienen en la misma consulta, sin costo extra.
    select: {
      id: true,
      completada: true,
      alertaId: true,
      titulo: true,
      orden: true,
      responsableId: true,
      fechaVencimiento: true,
    },
  });

  if (!actual) {
    throw new NotFoundError('La tarea no existe.');
  }

  const data: Prisma.TareaAlertaUpdateInput = {};

  if (body.titulo !== undefined) {
    data.titulo = body.titulo;
  }
  if (body.orden !== undefined) {
    data.orden = body.orden;
  }
  if ('responsableId' in body) {
    if (body.responsableId) {
      await asegurarResponsableAsignable(body.responsableId);
      data.responsable = { connect: { id: body.responsableId } };
    } else {
      data.responsable = { disconnect: true };
    }
  }
  if ('fechaVencimiento' in body) {
    data.fechaVencimiento = body.fechaVencimiento
      ? fechaCalendarioDesdeTexto(body.fechaVencimiento)
      : null;
  }
  if (body.completada !== undefined && body.completada !== actual.completada) {
    data.completada = body.completada;
    data.fechaCompletada = body.completada ? new Date() : null;
    data.usuarioCompletado = body.completada
      ? { connect: { id: usuarioId } }
      : { disconnect: true };
  }

  const tarea = await prisma.tareaAlerta.update({
    where: { id: tareaId },
    data,
    include: INCLUDE_TAREA,
  });

  const cambioCompletada = body.completada !== undefined && body.completada !== actual.completada;
  const dto = tareaDTO(tarea);
  registrarAuditoria({
    accion: 'ALERTA_TAREA_EDITAR',
    entidadId: tareaId,
    descripcion: cambioCompletada
      ? body.completada
        ? `Completo la tarea "${dto.titulo}" de la alerta #${actual.alertaId}`
        : `Reabrio la tarea "${dto.titulo}" de la alerta #${actual.alertaId}`
      : `Edito la tarea "${dto.titulo}" de la alerta #${actual.alertaId}`,
    datosPrevios: {
      titulo: actual.titulo,
      completada: actual.completada,
      responsableId: actual.responsableId,
      fechaVencimiento: fechaCalendarioTexto(actual.fechaVencimiento),
      orden: actual.orden,
    },
    datosNuevos: {
      titulo: dto.titulo,
      completada: dto.completada,
      responsableId: dto.responsable?.id ?? null,
      fechaVencimiento: dto.fechaVencimiento,
      orden: dto.orden,
    },
    metadatos: { alertaId: actual.alertaId },
  });

  return dto;
}

export async function eliminarTarea(tareaId: number): Promise<void> {
  const tarea = await prisma.tareaAlerta.findUnique({
    where: { id: tareaId },
    select: { id: true, alertaId: true, titulo: true, completada: true },
  });

  if (!tarea) {
    throw new NotFoundError('La tarea no existe.');
  }

  await prisma.tareaAlerta.delete({ where: { id: tareaId } });

  registrarAuditoria({
    accion: 'ALERTA_TAREA_ELIMINAR',
    entidadId: tareaId,
    descripcion: `Elimino la tarea "${tarea.titulo}" de la alerta #${tarea.alertaId}`,
    datosPrevios: { id: tarea.id, titulo: tarea.titulo, completada: tarea.completada },
    metadatos: { alertaId: tarea.alertaId },
  });
}

// ---------------------------------------------------------------------------
// Responsables y resumen
// ---------------------------------------------------------------------------

/** Usuarios cuyo rol incluye `alerta.ver`. */
const FILTRO_PUEDE_VER_ALERTAS = {
  roles: {
    some: { rol: { rolPermisos: { some: { permiso: { nombre: PERMISOS.ALERTAS_VER } } } } },
  },
} as const;

/**
 * A quien se le puede asignar una tarea de esta alerta.
 *
 * El filtro es "quien puede VER la alerta", no "todos los usuarios": asignarle
 * un pendiente a alguien que no puede abrirla es un bug de producto. Y el DTO es
 * a proposito minimo (id + nombre, sin correo, documento ni telefono) porque la
 * ruta pide `alerta.seguimiento`, no `usuario.ver`: no es una puerta de atras
 * para enumerar el padron de usuarios.
 */
export async function listarResponsables(alertaId: number): Promise<ResponsableDTO[]> {
  await asegurarAlerta(alertaId);

  const usuarios = await prisma.usuario.findMany({
    where: { activo: true, ...FILTRO_PUEDE_VER_ALERTAS },
    select: SELECT_AUTOR,
    orderBy: [{ persona: { apellidos: 'asc' } }, { persona: { nombres: 'asc' } }],
    take: 200,
  });

  return usuarios.map(autorDTO);
}

/**
 * Contadores para las etiquetas de las pestañas del modal. Los calcula el mismo
 * GET del detalle, asi que abrir una alerta sigue siendo una sola request.
 */
export async function resumirSeguimiento(alertaId: number): Promise<SeguimientoResumenDTO> {
  const [comentarios, adjuntos, tareas] = await prisma.$transaction([
    prisma.comentarioAlerta.count({ where: { alertaId } }),
    prisma.adjuntoAlerta.count({ where: { alertaId } }),
    prisma.tareaAlerta.findMany({
      where: { alertaId },
      select: { completada: true, fechaVencimiento: true },
    }),
  ]);

  return {
    comentarios,
    adjuntos,
    tareas: {
      total: tareas.length,
      completadas: tareas.filter((t) => t.completada).length,
      vencidas: tareas.filter(estaVencida).length,
    },
  };
}
