import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import sharp from 'sharp';
import { Request, Response, NextFunction } from 'express';
import { env } from '../../config/env';
import { BadRequestError, NotFoundError } from '../../shared/utils/errors';
import {
  familiaDeclarada,
  formatoImagenCoincide,
  detectarOoxml,
  esPdf,
  FORMATOS_IMAGEN_PERMITIDOS,
  MIME_EXTENSIONES,
} from './alertas.adjuntos.magic';

/**
 * Subida y lectura de los adjuntos de seguimiento de una alerta.
 *
 * Es el hermano interno de `modules/reportes/upload.ts`, y es una COPIA
 * deliberada en vez de un import: las reglas son distintas a proposito.
 *   - Destino: carpeta privada (`env.adjuntosDir`), no `uploads/`, que se sirve
 *     sin autenticacion.
 *   - Formatos: imagen + PDF + Office, no solo imagen.
 *   - Tamaño: 10 MB, no 5.
 *   - NO se recomprime nada. Un adjunto interno es un escaneo de laboratorio o
 *     la foto de un medidor: la legibilidad ES el contenido, y aplastarlo a
 *     300 KB como se hace con la foto del ciudadano destruiria el motivo de
 *     haberlo adjuntado. `sharp` se usa solo para VALIDAR, nunca para
 *     re-encodear.
 */

const MAX_ARCHIVO_BYTES = 10 * 1024 * 1024;

/** Tope por envio: 5 archivos, tanto en un comentario como en la pestaña Archivos. */
export const MAX_ADJUNTOS = 5;

const FORMATOS_LEGIBLES = 'imagenes (JPG, PNG, WEBP), PDF, DOCX o XLSX';

/**
 * Tipos genericos que se dejan pasar el filtro para que los decidan los bytes.
 *
 * Hace falta porque el mimetype de un docx/xlsx llega mal seguido: un Windows
 * sin Office instalado, varios clientes HTTP y curl mandan
 * `application/octet-stream` para un .xlsx perfectamente valido. Rechazarlo en
 * el filtro seria rechazar archivos buenos; aceptarlo no afloja nada, porque el
 * tipo final lo decide `detectarTipoReal` leyendo el contenido.
 */
const MIMES_GENERICOS = new Set([
  'application/octet-stream',
  'application/zip',
  'application/x-zip-compressed',
]);

const uploadAdjuntos = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, cb) => {
    // Primera compuerta, barata. La que manda es `detectarTipoReal`, que mira
    // los bytes: lo que el cliente declara es una pista, no una verdad.
    if (!familiaDeclarada(file.mimetype) && !MIMES_GENERICOS.has(file.mimetype)) {
      cb(new BadRequestError(`Formato no permitido. Se aceptan ${FORMATOS_LEGIBLES}.`));
      return;
    }
    cb(null, true);
  },
  limits: { fileSize: MAX_ARCHIVO_BYTES, files: MAX_ADJUNTOS },
}).array('archivos', MAX_ADJUNTOS);

/**
 * Middleware de subida. Va DESPUES de `requirePermiso` y ANTES de `validate`,
 * porque multer es el que parsea los campos de texto del `multipart`.
 */
export function manejarUploadAdjuntos(req: Request, _res: Response, next: NextFunction): void {
  uploadAdjuntos(req, _res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        next(new BadRequestError('Cada archivo debe pesar como maximo 10MB.'));
        return;
      }
      if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
        next(new BadRequestError(`Se permiten como maximo ${MAX_ADJUNTOS} archivos por envio.`));
        return;
      }
      next(new BadRequestError(err.message));
      return;
    }

    if (err) {
      next(err);
      return;
    }

    next();
  });
}

/** Lo que queda de un archivo ya validado y escrito, listo para la fila en DB. */
export interface AdjuntoGuardado {
  nombreOriginal: string;
  rutaRelativa: string;
  tipoMime: string;
  tamanoBytes: number;
  esImagen: boolean;
}

function raizAdjuntos(): string {
  return path.resolve(process.cwd(), env.adjuntosDir);
}

/**
 * `<raiz>/alerta-<id>/<anio>/<mes>/`. El `alerta-<id>` hace trivial inspeccionar
 * o limpiar a mano lo de una alerta; el anio/mes mantiene los directorios chicos
 * (mismo criterio que `carpetaDestino()` de reportes).
 */
function carpetaDestino(alertaId: number): string {
  const ahora = new Date();
  const anio = ahora.getFullYear().toString();
  const mes = (ahora.getMonth() + 1).toString().padStart(2, '0');
  return path.join(raizAdjuntos(), `alerta-${alertaId}`, anio, mes);
}

/**
 * Decide el tipo del archivo leyendo su CONTENIDO, y devuelve el MIME canonico
 * que se guarda en DB y se usa al servirlo. Lo que el cliente declara no se
 * guarda nunca: es una pista para elegir el chequeo, no la respuesta.
 *
 * Dos cosas caen con esto:
 *   - "subo un HTML o un .exe con nombre .png": ningun chequeo lo reconoce.
 *   - el desacuerdo entre lo declarado y lo real (un JPEG declarado PNG), que se
 *     rechaza aunque el archivo sea una imagen valida: no hay motivo honesto
 *     para ese caso.
 */
async function detectarTipoReal(
  archivo: Express.Multer.File,
): Promise<{ tipoMime: string; esImagen: boolean }> {
  if (archivo.size === 0 || archivo.buffer.length === 0) {
    throw new BadRequestError(`El archivo "${archivo.originalname}" esta vacio.`);
  }

  const declarada = familiaDeclarada(archivo.mimetype);
  const desacuerdo = new BadRequestError(
    `El contenido de "${archivo.originalname}" no coincide con su formato declarado.`,
  );

  // Imagen: lo decide sharp decodificando, que es mas fuerte que mirar una firma.
  let formatoImagen: string | undefined;
  try {
    formatoImagen = (await sharp(archivo.buffer).metadata()).format;
  } catch {
    formatoImagen = undefined;
  }

  if (formatoImagen && FORMATOS_IMAGEN_PERMITIDOS.has(formatoImagen)) {
    if (declarada === 'imagen' && !formatoImagenCoincide(archivo.mimetype, formatoImagen)) {
      throw desacuerdo;
    }
    return { tipoMime: `image/${formatoImagen}`, esImagen: true };
  }

  // El cliente dijo "imagen" y el contenido no lo es: no sigas probando.
  if (declarada === 'imagen') {
    throw new BadRequestError(`"${archivo.originalname}" no es una imagen valida.`);
  }

  if (esPdf(archivo.buffer)) {
    if (declarada && declarada !== 'pdf') {
      throw desacuerdo;
    }
    return { tipoMime: 'application/pdf', esImagen: false };
  }

  const ooxml = detectarOoxml(archivo.buffer);
  if (ooxml) {
    if (declarada && declarada !== ooxml) {
      throw desacuerdo;
    }
    return { tipoMime: TIPO_OOXML[ooxml], esImagen: false };
  }

  throw new BadRequestError(
    `"${archivo.originalname}" no es un archivo valido. Se aceptan ${FORMATOS_LEGIBLES}.`,
  );
}

const TIPO_OOXML: Record<'docx' | 'xlsx', string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

/**
 * Valida TODOS los archivos y recien despues escribe. Es todo o nada: si uno
 * falla, no queda ninguno en disco y el envio se rechaza con 400. "3 de 5
 * subidos" seria peor que el error.
 *
 * El nombre en disco es un UUID + la extension del mapa server-side:
 * `originalname` NUNCA participa de la ruta (ahi viven el path traversal y el
 * null byte). El nombre humano vive solo en la columna `nombreOriginal`.
 */
export async function guardarAdjuntos(
  alertaId: number,
  archivos: Express.Multer.File[],
): Promise<AdjuntoGuardado[]> {
  // Primero se validan TODOS (nada escrito todavia), despues se escribe.
  const tipos = [];
  for (const archivo of archivos) {
    tipos.push(await detectarTipoReal(archivo));
  }

  const carpeta = carpetaDestino(alertaId);
  await fs.promises.mkdir(carpeta, { recursive: true });

  const escritos: AdjuntoGuardado[] = [];
  try {
    for (const [indice, archivo] of archivos.entries()) {
      const tipo = tipos[indice]!;
      // La extension sale del tipo REAL y del mapa server-side, no del nombre
      // que subio la persona.
      const extension = MIME_EXTENSIONES[tipo.tipoMime] ?? '';
      const rutaCompleta = path.join(carpeta, `${crypto.randomUUID()}${extension}`);
      await fs.promises.writeFile(rutaCompleta, archivo.buffer);

      escritos.push({
        nombreOriginal: archivo.originalname,
        rutaRelativa: path
          .relative(raizAdjuntos(), rutaCompleta)
          .split(path.sep)
          .join('/'),
        tipoMime: tipo.tipoMime,
        tamanoBytes: archivo.buffer.length,
        esImagen: tipo.esImagen,
      });
    }
  } catch (err) {
    await eliminarArchivos(escritos.map((a) => a.rutaRelativa));
    throw err;
  }

  return escritos;
}

/**
 * Borra archivos del disco sin hacer ruido. La fila en DB es la fuente de
 * verdad: un archivo que ya no esta no es un error que valga abortar nada.
 */
export async function eliminarArchivos(rutasRelativas: string[]): Promise<void> {
  await Promise.all(
    rutasRelativas.map(async (relativa) => {
      try {
        const absoluta = resolverRutaAbsoluta(relativa);
        await fs.promises.unlink(absoluta);
      } catch {
        // Ya no estaba, o la ruta era invalida. Nada que hacer.
      }
    }),
  );
}

/**
 * Resuelve la ruta en disco de un adjunto y verifica que no se escape de la
 * raiz. `rutaRelativa` la genera el servidor, pero una fila de DB sigue siendo
 * input: la comprobacion es defensa en profundidad contra `../../`.
 */
export function resolverRutaAbsoluta(rutaRelativa: string): string {
  const raiz = raizAdjuntos();
  const absoluta = path.resolve(raiz, rutaRelativa);
  if (absoluta !== raiz && !absoluta.startsWith(raiz + path.sep)) {
    throw new NotFoundError('El archivo adjunto no existe.');
  }
  return absoluta;
}
