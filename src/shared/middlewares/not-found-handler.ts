import { Request, Response } from 'express';
import { Response as ApiResponse } from '../utils/response';

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json(ApiResponse.error(404, `Recurso no encontrado: ${req.method} ${req.originalUrl}`));
}
