import { Request, Response as ExpressResponse, NextFunction } from 'express';
import * as encuestaService from '../services/encuesta.service';
import { Response as ApiResponse } from '../utils/response';

export async function getEncuestaActiva(req: Request, res: ExpressResponse, next: NextFunction): Promise<void> {
  try {
    const encuesta = await encuestaService.obtenerEncuestaActiva();
    res.status(200).json(ApiResponse.success(200, encuesta, 'Encuesta obtenida correctamente.'));
  } catch (err) {
    next(err);
  }
}
