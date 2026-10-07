import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { NextFunction, Request, Response } from 'express';

/**
 * Contexto de la request en curso, accesible desde cualquier punto del stack sin
 * pasarlo por parametro.
 *
 * El problema que resuelve: la auditoria necesita IP, user-agent, ruta y actor,
 * datos que solo existen en el `Request`. La alternativa era sumar un parametro
 * `contexto` a la firma de los ~15 services que escriben y a todos sus
 * llamadores (incluidos los jobs, que no tienen request). Con `AsyncLocalStorage`
 * el dato viaja solo y la firma de los services no cambia.
 *
 * Se guarda el `Request` entero y NO una copia de sus campos a proposito:
 * `req.usuario` lo escribe `requireAuth`, que corre DESPUES de este middleware.
 * Si copiaramos el actor al entrar, toda entrada de auditoria quedaria anonima.
 * Guardando la referencia, `actorDesdeContexto()` lo lee recien cuando se
 * registra la accion, con `req.usuario` ya poblado.
 */
export interface ContextoRequest {
  /** Ausente cuando el contexto lo abrio un job o un script, no una request. */
  req?: Request;
  /** Correlaciona todas las entradas de auditoria de una misma request. */
  requestId: string;
}

const almacen = new AsyncLocalStorage<ContextoRequest>();

/**
 * Abre el contexto para todo lo que cuelgue de esta request. Se monta lo mas
 * arriba posible en `app.ts`: cualquier cosa montada antes queda sin contexto y
 * sus acciones se auditarian como SISTEMA.
 */
export function contextoRequestMiddleware(req: Request, _res: Response, next: NextFunction): void {
  almacen.run({ req, requestId: randomUUID() }, () => {
    next();
  });
}

/** El contexto en curso, o `undefined` si corre fuera de una request (jobs, scripts). */
export function contextoActual(): ContextoRequest | undefined {
  return almacen.getStore();
}

/**
 * Corre `fn` con un contexto propio. Lo usan los jobs y los scripts de CLI para
 * que todas las entradas de una misma corrida compartan `requestId` y se puedan
 * agrupar en el panel.
 */
export function conContextoAislado<T>(fn: () => T): T {
  return almacen.run({ requestId: randomUUID() }, fn);
}
