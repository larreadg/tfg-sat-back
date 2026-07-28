import { Request, Response, NextFunction } from 'express';
import * as ciudadanoAuthService from '../services/ciudadanoAuth.service';
import { UnauthorizedError } from '../utils/errors';

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
