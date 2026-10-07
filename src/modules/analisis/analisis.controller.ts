import { Request, Response as ExpressResponse, NextFunction } from 'express';
import * as analisisService from './analisis.service';
import { Response as ApiResponse } from '../../shared/utils/response';
import { ResumenQuery } from './analisis.validation';

export async function resumen(req: Request, res: ExpressResponse, next: NextFunction): Promise<void> {
  try {
    const filtros = req.query as unknown as ResumenQuery;
    const datos = await analisisService.obtenerResumen(filtros);

    res.status(200).json(ApiResponse.success(200, datos, 'Resumen de analisis obtenido correctamente.'));
  } catch (err) {
    next(err);
  }
}
