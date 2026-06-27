import { Request, Response as ExpressResponse, NextFunction } from 'express';
import { AppError } from '../utils/errors';
import { Response as ApiResponse } from '../utils/response';

export function errorHandler(
  err: Error,
  _req: Request,
  res: ExpressResponse,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json(ApiResponse.error(err.statusCode, err.message));
    return;
  }

  console.error(err);
  res.status(500).json(ApiResponse.error(500, 'Internal server error'));
}
