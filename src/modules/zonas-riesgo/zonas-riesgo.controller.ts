import { Request, Response as ExpressResponse, NextFunction } from 'express';
import * as zonasRiesgoService from './zonas-riesgo.service';
import { Response as ApiResponse } from '../../shared/utils/response';
import {
  ActualizarZonaRiesgoBody,
  CrearZonaRiesgoBody,
  ListarZonasRiesgoQuery,
} from './zonas-riesgo.validation';

export async function listar(req: Request, res: ExpressResponse, next: NextFunction): Promise<void> {
  try {
    const filtros = req.query as unknown as ListarZonasRiesgoQuery;
    const zonas = await zonasRiesgoService.listarZonas(filtros);
    res.status(200).json(ApiResponse.success(200, zonas, 'Zonas de riesgo obtenidas correctamente.'));
  } catch (err) {
    next(err);
  }
}

export async function obtener(req: Request, res: ExpressResponse, next: NextFunction): Promise<void> {
  try {
    const zona = await zonasRiesgoService.obtenerZona(Number(req.params.id));
    res.status(200).json(ApiResponse.success(200, zona, 'Zona de riesgo obtenida correctamente.'));
  } catch (err) {
    next(err);
  }
}

export async function crear(req: Request, res: ExpressResponse, next: NextFunction): Promise<void> {
  try {
    const zona = await zonasRiesgoService.crearZona(req.body as CrearZonaRiesgoBody, req.usuario!.usuarioId);
    res.status(201).json(ApiResponse.success(201, zona, 'Zona de riesgo creada correctamente.'));
  } catch (err) {
    next(err);
  }
}

export async function actualizar(req: Request, res: ExpressResponse, next: NextFunction): Promise<void> {
  try {
    const zona = await zonasRiesgoService.actualizarZona(
      Number(req.params.id),
      req.body as ActualizarZonaRiesgoBody,
      req.usuario!.usuarioId,
    );
    res.status(200).json(ApiResponse.success(200, zona, 'Zona de riesgo actualizada correctamente.'));
  } catch (err) {
    next(err);
  }
}

export async function eliminar(req: Request, res: ExpressResponse, next: NextFunction): Promise<void> {
  try {
    await zonasRiesgoService.eliminarZona(Number(req.params.id));
    res.status(200).json(ApiResponse.success(200, null, 'Zona de riesgo eliminada correctamente.'));
  } catch (err) {
    next(err);
  }
}
