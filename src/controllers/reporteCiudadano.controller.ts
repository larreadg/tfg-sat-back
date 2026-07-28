import { Request, Response as ExpressResponse, NextFunction } from 'express';
import * as reporteCiudadanoService from '../services/reporteCiudadano.service';
import { Response as ApiResponse } from '../utils/response';
import { BadRequestError } from '../utils/errors';
import { GuardarRespuestasInput } from '../models/reporteCiudadano.model';

export async function guardarRespuestas(req: Request, res: ExpressResponse, next: NextFunction): Promise<void> {
  try {
    const input = parseInput(req.body.respuestas, req.body.encuestaId, req.body.latitud, req.body.longitud);
    const archivos = (req.files as Express.Multer.File[] | undefined) ?? [];

    const reporte = await reporteCiudadanoService.guardarRespuestas(req.ciudadano!, input, archivos);

    res.status(201).json(ApiResponse.success(201, reporte, 'Reporte enviado correctamente.'));
  } catch (err) {
    next(err);
  }
}

function parseInput(
  respuestasRaw: unknown,
  encuestaIdRaw: unknown,
  latitudRaw: unknown,
  longitudRaw: unknown,
): GuardarRespuestasInput {
  if (typeof respuestasRaw !== 'string') {
    throw new BadRequestError('El campo "respuestas" es obligatorio y debe ser un JSON valido.');
  }

  let respuestas: unknown;
  try {
    respuestas = JSON.parse(respuestasRaw);
  } catch {
    throw new BadRequestError('El campo "respuestas" no es un JSON valido.');
  }

  if (!Array.isArray(respuestas)) {
    throw new BadRequestError('El campo "respuestas" debe ser un arreglo.');
  }

  const encuestaId = encuestaIdRaw !== undefined ? Number(encuestaIdRaw) : undefined;
  const { latitud, longitud } = parseUbicacion(latitudRaw, longitudRaw);

  return { encuestaId, respuestas, latitud, longitud };
}

function parseUbicacion(latitudRaw: unknown, longitudRaw: unknown): { latitud: number; longitud: number } {
  if (latitudRaw === undefined || longitudRaw === undefined) {
    throw new BadRequestError('La ubicacion es obligatoria para enviar el reporte.');
  }

  const latitud = Number(latitudRaw);
  const longitud = Number(longitudRaw);

  if (Number.isNaN(latitud) || latitud < -90 || latitud > 90) {
    throw new BadRequestError('La latitud enviada no es valida.');
  }

  if (Number.isNaN(longitud) || longitud < -180 || longitud > 180) {
    throw new BadRequestError('La longitud enviada no es valida.');
  }

  return { latitud, longitud };
}
