import { Request, Response as ExpressResponse, NextFunction } from 'express';
import * as reporteCiudadanoService from './reportes.service';
import { Response as ApiResponse } from '../../shared/utils/response';
import { verificarTurnstile } from '../../shared/services/turnstile.service';
import { GuardarRespuestasBody } from './reportes.validation';

export async function guardarRespuestas(req: Request, res: ExpressResponse, next: NextFunction): Promise<void> {
  try {
    const input = req.body as GuardarRespuestasBody;
    const archivos = (req.files as Express.Multer.File[] | undefined) ?? [];

    // Va en el controller y no en el servicio a proposito: `guardarRespuestas`
    // lo comparten el canal WEB y los bots, y el bot no tiene Turnstile.
    const ip = req.ip ?? req.socket.remoteAddress ?? '';
    await verificarTurnstile(input.turnstileToken, ip);

    const reporte = await reporteCiudadanoService.guardarRespuestas(req.ciudadano!, input, archivos);

    res.status(201).json(ApiResponse.success(201, reporte, 'Reporte enviado correctamente.'));
  } catch (err) {
    next(err);
  }
}

export async function obtenerEstadoPublico(req: Request, res: ExpressResponse, next: NextFunction): Promise<void> {
  try {
    const { codigoPublico } = req.params;
    const estado = await reporteCiudadanoService.obtenerEstadoPublico(codigoPublico);

    res.status(200).json(ApiResponse.success(200, estado, 'Estado del reporte obtenido correctamente.'));
  } catch (err) {
    next(err);
  }
}
