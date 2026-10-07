import fs from 'fs';
import { Request, Response as ExpressResponse, NextFunction } from 'express';
import * as seguimientoService from './alertas.seguimiento.service';
import { Response as ApiResponse } from '../../shared/utils/response';
import { AlertaIdParam } from './alertas.validation';
import {
  ActualizarTareaBody,
  AdjuntoIdParam,
  ContenidoAdjuntoQuery,
  CrearComentarioBody,
  CrearTareaBody,
  ListarComentariosQuery,
  TareaIdParam,
} from './alertas.seguimiento.validation';

/** Los archivos de un `multipart` siempre llegan en `req.files` (multer). */
function archivosDe(req: Request): Express.Multer.File[] {
  return Array.isArray(req.files) ? req.files : [];
}

// ---------------------------------------------------------------------------
// Comentarios
// ---------------------------------------------------------------------------

export async function listarComentarios(
  req: Request,
  res: ExpressResponse,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params as unknown as AlertaIdParam;
    const filtros = req.query as unknown as ListarComentariosQuery;
    const { items, page, pageSize, total, totalPages } = await seguimientoService.listarComentarios(
      id,
      filtros,
    );

    res.status(200).json(
      ApiResponse.success(200, items, 'Comentarios de la alerta obtenidos correctamente.', {
        page,
        limit: pageSize,
        total,
        totalPages,
      }),
    );
  } catch (err) {
    next(err);
  }
}

export async function crearComentario(
  req: Request,
  res: ExpressResponse,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params as unknown as AlertaIdParam;
    const { cuerpo } = req.body as CrearComentarioBody;

    const comentario = await seguimientoService.crearComentario(
      id,
      req.usuario!.usuarioId,
      cuerpo,
      archivosDe(req),
    );

    res.status(201).json(ApiResponse.success(201, comentario, 'Comentario agregado correctamente.'));
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Adjuntos
// ---------------------------------------------------------------------------

export async function listarAdjuntos(
  req: Request,
  res: ExpressResponse,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params as unknown as AlertaIdParam;
    const adjuntos = await seguimientoService.listarAdjuntos(id);

    res
      .status(200)
      .json(ApiResponse.success(200, adjuntos, 'Archivos de la alerta obtenidos correctamente.'));
  } catch (err) {
    next(err);
  }
}

export async function subirAdjuntos(
  req: Request,
  res: ExpressResponse,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params as unknown as AlertaIdParam;
    const adjuntos = await seguimientoService.subirAdjuntos(
      id,
      req.usuario!.usuarioId,
      archivosDe(req),
    );

    res.status(201).json(ApiResponse.success(201, adjuntos, 'Archivos adjuntados correctamente.'));
  } catch (err) {
    next(err);
  }
}

/**
 * Tipos que esta API acepta servir. No se devuelve `adjunto.tipoMime` tal cual:
 * si algun dia entrara algo raro a la tabla, se entrega como binario opaco en
 * lugar de como algo que el navegador pueda interpretar.
 */
const TIPOS_SERVIBLES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

/** Solo imagen y PDF se muestran embebidos; Office siempre se descarga. */
const TIPOS_INLINE = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);

/**
 * `filename` ASCII saneado + `filename*` RFC 5987 para los acentos. Sanear no
 * es cosmetico: un `\r\n` o una comilla en el nombre del archivo es inyeccion
 * de cabecera.
 */
function contentDisposition(nombre: string, comoAdjunto: boolean): string {
  const ascii = nombre.replace(/[^\w.\- ]/g, '_').slice(0, 150) || 'archivo';
  const tipo = comoAdjunto ? 'attachment' : 'inline';
  return `${tipo}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nombre)}`;
}

/**
 * Entrega el archivo de un adjunto. Es la unica puerta a estos archivos: viven
 * fuera de `uploads/` justamente para no quedar publicos.
 *
 * El orden importa: el service resuelve y verifica TODO (fila, ruta, stat)
 * antes de que aca se escriba una sola cabecera, porque el `errorHandler` no
 * mira `res.headersSent`. Y una vez abierto el stream, un error se resuelve
 * destruyendo la respuesta: ya no hay forma de mandar un JSON.
 */
export async function descargarAdjunto(
  req: Request,
  res: ExpressResponse,
  next: NextFunction,
): Promise<void> {
  try {
    const { adjuntoId } = req.params as unknown as AdjuntoIdParam;
    const { descargar } = req.query as unknown as ContenidoAdjuntoQuery;
    const adjunto = await seguimientoService.obtenerContenidoAdjunto(adjuntoId);

    const tipo = TIPOS_SERVIBLES.has(adjunto.tipoMime)
      ? adjunto.tipoMime
      : 'application/octet-stream';
    const comoAdjunto = descargar === true || !TIPOS_INLINE.has(tipo);

    res.setHeader('Content-Type', tipo);
    res.setHeader('Content-Length', adjunto.tamanoBytes);
    res.setHeader('Content-Disposition', contentDisposition(adjunto.nombreOriginal, comoAdjunto));
    // Mata el sniffing: sin esto, un archivo con bytes de HTML podria ejecutarse
    // como HTML en el origen de la API.
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Si algo llegara a renderizarse igual, que no pueda cargar nada ni llamar
    // a ningun lado. Sobrescribe la CSP global de helmet, que es mas laxa.
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; object-src 'none'; sandbox");
    // Lo OPUESTO a /uploads (que usa cross-origin porque el panel embebe esas
    // fotos con <img>): estos archivos los pide el front por fetch con CORS, asi
    // que no hace falta relajar CORP. Son documentos internos.
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'private, no-store');

    const stream = fs.createReadStream(adjunto.rutaAbsoluta);
    stream.on('error', () => {
      res.destroy();
    });
    stream.pipe(res);
  } catch (err) {
    next(err);
  }
}

export async function eliminarAdjunto(
  req: Request,
  res: ExpressResponse,
  next: NextFunction,
): Promise<void> {
  try {
    const { adjuntoId } = req.params as unknown as AdjuntoIdParam;
    await seguimientoService.eliminarAdjunto(
      adjuntoId,
      req.usuario!.usuarioId,
      req.usuario!.permisos,
    );

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Tareas
// ---------------------------------------------------------------------------

export async function listarTareas(
  req: Request,
  res: ExpressResponse,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params as unknown as AlertaIdParam;
    const tareas = await seguimientoService.listarTareas(id);

    res
      .status(200)
      .json(ApiResponse.success(200, tareas, 'Tareas de la alerta obtenidas correctamente.'));
  } catch (err) {
    next(err);
  }
}

export async function crearTarea(
  req: Request,
  res: ExpressResponse,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params as unknown as AlertaIdParam;
    const tarea = await seguimientoService.crearTarea(
      id,
      req.usuario!.usuarioId,
      req.body as CrearTareaBody,
    );

    res.status(201).json(ApiResponse.success(201, tarea, 'Tarea creada correctamente.'));
  } catch (err) {
    next(err);
  }
}

export async function actualizarTarea(
  req: Request,
  res: ExpressResponse,
  next: NextFunction,
): Promise<void> {
  try {
    const { tareaId } = req.params as unknown as TareaIdParam;
    const tarea = await seguimientoService.actualizarTarea(
      tareaId,
      req.usuario!.usuarioId,
      req.body as ActualizarTareaBody,
    );

    res.status(200).json(ApiResponse.success(200, tarea, 'Tarea actualizada correctamente.'));
  } catch (err) {
    next(err);
  }
}

export async function eliminarTarea(
  req: Request,
  res: ExpressResponse,
  next: NextFunction,
): Promise<void> {
  try {
    const { tareaId } = req.params as unknown as TareaIdParam;
    await seguimientoService.eliminarTarea(tareaId);

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Responsables
// ---------------------------------------------------------------------------

export async function listarResponsables(
  req: Request,
  res: ExpressResponse,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params as unknown as AlertaIdParam;
    const responsables = await seguimientoService.listarResponsables(id);

    res
      .status(200)
      .json(ApiResponse.success(200, responsables, 'Responsables obtenidos correctamente.'));
  } catch (err) {
    next(err);
  }
}
