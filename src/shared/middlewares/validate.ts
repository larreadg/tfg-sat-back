import { NextFunction, Request, Response } from 'express';
import { ZodError, ZodType } from 'zod';
import { BadRequestError } from '../utils/errors';

interface ValidationSchemas {
  body?: ZodType;
  params?: ZodType;
  query?: ZodType;
}

function formatearError(error: ZodError): string {
  return error.issues
    .map((issue) => {
      const ruta = issue.path.join('.');
      return ruta ? `${ruta}: ${issue.message}` : issue.message;
    })
    .join('; ');
}

/**
 * Middleware factory que valida (y coacciona) `body`, `params` y `query` contra
 * los schemas zod provistos. Reemplaza cada sección de la request por su versión
 * parseada, de modo que los controllers reciben datos ya tipados y saneados.
 * Ante un error de validación responde 400 vía `BadRequestError`.
 */
export function validate(schemas: ValidationSchemas) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }
      if (schemas.params) {
        req.params = schemas.params.parse(req.params) as unknown as Request['params'];
      }
      if (schemas.query) {
        req.query = schemas.query.parse(req.query) as unknown as Request['query'];
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        next(new BadRequestError(formatearError(error)));
        return;
      }
      next(error);
    }
  };
}
