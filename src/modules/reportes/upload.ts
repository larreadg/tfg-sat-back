import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import sharp from 'sharp';
import { Request, Response, NextFunction } from 'express';
import { env } from '../../config/env';
import { BadRequestError } from '../../shared/utils/errors';

const MIME_EXTENSIONES: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

// Formatos reales admitidos (los que sharp reporta al decodificar el contenido).
// Es la barrera de "magic bytes": el mimetype de multer lo pone el cliente y se
// puede falsear; esto valida los bytes reales de la imagen (ERS §14).
const FORMATOS_REALES_PERMITIDOS = new Set(['jpeg', 'png', 'webp']);

const MAX_ARCHIVO_BYTES = 5 * 1024 * 1024;
/**
 * Tope DURO del middleware, no la regla de negocio: cuantas fotos se piden lo
 * define la version de la encuesta (`fotosMin`/`fotosMax`) y lo valida
 * `guardarRespuestas`. Multer necesita un numero fijo al construirse, asi que
 * aca va el techo absoluto que ninguna version puede superar.
 */
export const MAX_FOTOS = 10;
const MAX_FOTO_COMPRIMIDA_BYTES = 300 * 1024;
const CALIDADES_WEBP = [80, 65, 50, 40, 30, 20];
const ANCHOS_MAXIMOS = [2000, 1600, 1200, 900, 600];

function carpetaDestino(): string {
  const ahora = new Date();
  const anio = ahora.getFullYear().toString();
  const mes = (ahora.getMonth() + 1).toString().padStart(2, '0');
  return path.join(process.cwd(), env.uploadsDir, 'reporte-ciudadano', anio, mes);
}

const storage = multer.memoryStorage();

const uploadFotos = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    if (!MIME_EXTENSIONES[file.mimetype]) {
      cb(new BadRequestError('Solo se permiten imagenes JPEG, PNG o WEBP.'));
      return;
    }
    cb(null, true);
  },
  limits: { fileSize: MAX_ARCHIVO_BYTES, files: MAX_FOTOS },
}).array('fotos', MAX_FOTOS);

export function manejarUploadFotos(req: Request, _res: Response, next: NextFunction): void {
  uploadFotos(req, _res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        next(new BadRequestError('Cada foto debe pesar como maximo 5MB.'));
        return;
      }
      if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
        next(new BadRequestError(`Se permiten como maximo ${MAX_FOTOS} fotos por envio.`));
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

/**
 * Valida el formato REAL del archivo leyendo sus bytes con sharp, no el mimetype
 * declarado por el cliente. Rechaza cualquier cosa que no sea una imagen
 * JPEG/PNG/WebP decodificable (ERS §14).
 */
async function validarFormatoReal(buffer: Buffer): Promise<void> {
  let formato: string | undefined;
  try {
    formato = (await sharp(buffer).metadata()).format;
  } catch {
    throw new BadRequestError('El archivo no es una imagen valida.');
  }

  if (!formato || !FORMATOS_REALES_PERMITIDOS.has(formato)) {
    throw new BadRequestError('Solo se permiten imagenes JPEG, PNG o WEBP.');
  }
}

async function comprimirImagenWebp(buffer: Buffer): Promise<Buffer> {
  let ultimoResultado: Buffer | undefined;

  for (const ancho of ANCHOS_MAXIMOS) {
    for (const calidad of CALIDADES_WEBP) {
      const resultado = await sharp(buffer)
        .resize({ width: ancho, withoutEnlargement: true })
        .webp({ quality: calidad })
        .toBuffer();

      ultimoResultado = resultado;

      if (resultado.length <= MAX_FOTO_COMPRIMIDA_BYTES) {
        return resultado;
      }
    }
  }

  return ultimoResultado!;
}

async function comprimirYGuardarFoto(archivo: Express.Multer.File): Promise<string> {
  await validarFormatoReal(archivo.buffer);

  const carpeta = carpetaDestino();
  fs.mkdirSync(carpeta, { recursive: true });

  const buffer = await comprimirImagenWebp(archivo.buffer);
  const rutaCompleta = path.join(carpeta, `${crypto.randomUUID()}.webp`);
  fs.writeFileSync(rutaCompleta, buffer);

  const rutaRelativa = path.relative(path.join(process.cwd(), env.uploadsDir), rutaCompleta);
  const rutaUrl = rutaRelativa.split(path.sep).join('/');
  return `${env.uploadsBaseUrl}/${rutaUrl}`;
}

export function comprimirYGuardarFotos(archivos: Express.Multer.File[]): Promise<string[]> {
  return Promise.all(archivos.map((archivo) => comprimirYGuardarFoto(archivo)));
}
