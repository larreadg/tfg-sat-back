import { NextFunction, Request, Response } from 'express';
import { ForbiddenError, UnauthorizedError } from '../utils/errors';

/**
 * Exige que el usuario autenticado (poblado por `requireAuth`) tenga TODOS los
 * permisos indicados. Debe montarse siempre despues de `requireAuth`.
 *
 * A diferencia del guard de permisos del front (que solo condiciona la UI),
 * esta verificacion es la barrera de autorizacion real del servidor.
 */
export function requirePermiso(...permisosRequeridos: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const usuario = req.usuario;

    if (!usuario) {
      next(new UnauthorizedError('Token de sesion no proporcionado.'));
      return;
    }

    const permisosUsuario = new Set(usuario.permisos);
    const faltante = permisosRequeridos.find((permiso) => !permisosUsuario.has(permiso));

    if (faltante) {
      next(new ForbiddenError(`No tenes permiso para realizar esta accion (${faltante}).`));
      return;
    }

    next();
  };
}
