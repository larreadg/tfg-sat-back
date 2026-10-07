import { Request, Response as ExpressResponse, NextFunction } from 'express';
import * as encuestasAdminService from './encuestas-admin.service';
import { Response as ApiResponse } from '../../shared/utils/response';
import {
  ActualizarEncuestaBody,
  CrearVersionBody,
  ReemplazarContenidoBody,
  ActualizarPreguntaBody,
  CrearEncuestaBody,
  CrearPreguntaBody,
} from './encuestas-admin.validation';

export async function listar(_req: Request, res: ExpressResponse, next: NextFunction): Promise<void> {
  try {
    const encuestas = await encuestasAdminService.listarEncuestas();
    res.status(200).json(ApiResponse.success(200, encuestas, 'Encuestas obtenidas correctamente.'));
  } catch (err) {
    next(err);
  }
}

export async function detalleActiva(_req: Request, res: ExpressResponse, next: NextFunction): Promise<void> {
  try {
    const encuesta = await encuestasAdminService.obtenerEncuestaActiva();
    res.status(200).json(ApiResponse.success(200, encuesta, 'Encuesta activa obtenida correctamente.'));
  } catch (err) {
    next(err);
  }
}

export async function detalle(req: Request, res: ExpressResponse, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    const encuesta = await encuestasAdminService.obtenerEncuesta(id);
    res.status(200).json(ApiResponse.success(200, encuesta, 'Encuesta obtenida correctamente.'));
  } catch (err) {
    next(err);
  }
}

export async function crear(req: Request, res: ExpressResponse, next: NextFunction): Promise<void> {
  try {
    const input = req.body as CrearEncuestaBody;
    const encuesta = await encuestasAdminService.crearEncuesta(input, req.usuario!.usuarioId);
    res.status(201).json(ApiResponse.success(201, encuesta, 'Encuesta creada correctamente.'));
  } catch (err) {
    next(err);
  }
}

export async function crearVersion(req: Request, res: ExpressResponse, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    const encuesta = await encuestasAdminService.crearVersionDesde(
      id,
      req.body as CrearVersionBody,
      req.usuario!.usuarioId,
    );

    res.status(201).json(ApiResponse.success(201, encuesta, 'Version creada correctamente.'));
  } catch (err) {
    next(err);
  }
}

export async function reemplazarContenido(
  req: Request,
  res: ExpressResponse,
  next: NextFunction,
): Promise<void> {
  try {
    const id = Number(req.params.id);
    const encuesta = await encuestasAdminService.reemplazarContenido(
      id,
      req.body as ReemplazarContenidoBody,
      req.usuario!.usuarioId,
    );

    res.status(200).json(ApiResponse.success(200, encuesta, 'Version actualizada correctamente.'));
  } catch (err) {
    next(err);
  }
}

export async function eliminar(req: Request, res: ExpressResponse, next: NextFunction): Promise<void> {
  try {
    await encuestasAdminService.eliminarEncuesta(Number(req.params.id));
    res.status(200).json(ApiResponse.success(200, null, 'Version eliminada correctamente.'));
  } catch (err) {
    next(err);
  }
}

export async function actualizar(req: Request, res: ExpressResponse, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    const input = req.body as ActualizarEncuestaBody;
    const encuesta = await encuestasAdminService.actualizarEncuesta(id, input, req.usuario!.usuarioId);
    res.status(200).json(ApiResponse.success(200, encuesta, 'Encuesta actualizada correctamente.'));
  } catch (err) {
    next(err);
  }
}

export async function agregarPregunta(req: Request, res: ExpressResponse, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    const input = req.body as CrearPreguntaBody;
    const encuesta = await encuestasAdminService.agregarPregunta(id, input, req.usuario!.usuarioId);
    res.status(201).json(ApiResponse.success(201, encuesta, 'Pregunta agregada correctamente.'));
  } catch (err) {
    next(err);
  }
}

export async function actualizarPregunta(req: Request, res: ExpressResponse, next: NextFunction): Promise<void> {
  try {
    const preguntaId = Number(req.params.preguntaId);
    const input = req.body as ActualizarPreguntaBody;
    const pregunta = await encuestasAdminService.actualizarPregunta(preguntaId, input, req.usuario!.usuarioId);
    res.status(200).json(ApiResponse.success(200, pregunta, 'Pregunta actualizada correctamente.'));
  } catch (err) {
    next(err);
  }
}

export async function eliminarPregunta(req: Request, res: ExpressResponse, next: NextFunction): Promise<void> {
  try {
    const preguntaId = Number(req.params.preguntaId);
    await encuestasAdminService.eliminarPregunta(preguntaId);
    res.status(200).json(ApiResponse.success(200, null, 'Pregunta eliminada correctamente.'));
  } catch (err) {
    next(err);
  }
}
