import { Request, Response as ExpressResponse, NextFunction } from 'express';
import * as mapaService from './mapa.service';
import { Response as ApiResponse } from '../../shared/utils/response';
import { MapaQuery } from './mapa.validation';

export async function obtener(req: Request, res: ExpressResponse, next: NextFunction): Promise<void> {
  try {
    const filtros = req.query as unknown as MapaQuery;
    const geojson = await mapaService.obtenerMapa(filtros);

    res.status(200).json(ApiResponse.success(200, geojson, 'Mapa obtenido correctamente.'));
  } catch (err) {
    next(err);
  }
}
