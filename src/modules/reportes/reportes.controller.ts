import { Request, Response as ExpressResponse, NextFunction } from 'express';
import * as reporteCiudadanoService from './reportes.service';
import { Response as ApiResponse } from '../../shared/utils/response';
import { GuardarRespuestasBody } from './reportes.validation';

export async function guardarRespuestas(req: Request, res: ExpressResponse, next: NextFunction): Promise<void> {
  try {
    const input = req.body as GuardarRespuestasBody;
    const archivos = (req.files as Express.Multer.File[] | undefined) ?? [];

    const reporte = await reporteCiudadanoService.guardarRespuestas(req.ciudadano!, input, archivos);

    res.status(201).json(ApiResponse.success(201, reporte, 'Reporte enviado correctamente.'));
  } catch (err) {
    next(err);
  }
}
