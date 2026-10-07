import { Request, Response, NextFunction } from 'express';
import * as ciudadanoAuthService from './citizen-auth.service';
import { UnauthorizedError } from '../../shared/utils/errors';

export function requireCiudadanoSession(req: Request, _res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedError('Token de sesion no proporcionado.');
    }

    const token = authHeader.slice('Bearer '.length);
    req.ciudadano = ciudadanoAuthService.verificarTokenSesion(token);

    next();
  } catch (err) {
    next(err);
  }
}
