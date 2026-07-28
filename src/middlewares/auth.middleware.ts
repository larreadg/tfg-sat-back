import { Request, Response, NextFunction } from 'express';
import * as authService from '../services/auth.service';
import { UnauthorizedError } from '../utils/errors';

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedError('Token de sesion no proporcionado.');
    }

    const token = authHeader.slice('Bearer '.length);
    req.usuario = authService.verificarAccessToken(token);

    next();
  } catch (err) {
    next(err);
  }
}
