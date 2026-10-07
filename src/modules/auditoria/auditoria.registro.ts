import { ActorAuditoria, Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { contextoActual } from './auditoria.contexto';
import { ClaveAccion, definicionAccion } from './auditoria.acciones';
import { enmascararTelefono, saneadoParaJson } from './auditoria.sanear';

/**
 * Escritor de la bitacora de auditoria. Es el punto de entrada que usan los
 * services de dominio: "paso esto, anotalo".
 *
 * ## Dos reglas, iguales a las de `emitir()` de webhooks
 * 1. **Nunca tira.** Se la llama despues de haber escrito el dato de dominio; si
 *    el INSERT de auditoria fallara y propagara, un alta de usuario que YA ocurrio
 *    terminaria en un 500 y el panel diria que no se creo. El fallo se reporta por
 *    `console.error` y se sigue.
 * 2. **Nunca se espera.** Devuelve `void`, no una promesa: no hay nada que
 *    aguardar y por eso no se puede olvidar un `await`. Es un INSERT suelto,
 *    deliberadamente fuera de la transaccion del dominio: si participara, un lock
 *    sobre la tabla de auditoria podria frenar el flujo del ciudadano, y un
 *    rollback del dominio se llevaria tambien la evidencia del intento.
 *
 * El precio de (1) y (2) es que, si la base se cae justo entre la escritura del
 * dato y la del log, esa entrada se pierde. Es la contrapartida aceptada: una
 * auditoria que puede tumbar la operacion que audita es peor que una con un hueco.
 *
 * ## El contexto se lee SINCRONICAMENTE
 * `registrarAuditoria` resuelve el actor y la IP antes de devolver, y recien
 * despues lanza el INSERT. Si leyera el `AsyncLocalStorage` dentro de la promesa,
 * una llamada hecha en el borde de la request podria encontrarse el contexto ya
 * cerrado y anotar la accion como anonima.
 */

/** Actor explicito, para cuando el contexto de la request no alcanza. */
export type ActorExplicito =
  /** Un job o un script: no hay nadie pidiendo nada. `etiqueta` nombra al proceso. */
  | { tipo: 'SISTEMA'; etiqueta: string }
  /**
   * Nadie identificado: un login rechazado contra un correo inexistente. Lo unico
   * que queda es la IP, que la fila guarda de todos modos desde el contexto.
   */
  | { tipo: 'ANONIMO' }
  /** El ciudadano, en los flujos donde todavia no hay sesion (pedido de OTP). */
  | { tipo: 'CIUDADANO'; telefono: string | null }
  /** Un usuario del panel cuando el service ya lo tiene a mano y no hay request. */
  | { tipo: 'USUARIO'; usuarioId: number };

export interface EntradaAuditoria {
  /** Clave del catalogo de `auditoria.acciones.ts`. Un typo no compila. */
  accion: ClaveAccion;
  /** Id del registro afectado. Se guarda como texto (acepta claves compuestas). */
  entidadId?: number | string | null;
  /** Frase corta para el panel, ya redactada. Sin jerga tecnica. */
  descripcion: string;
  /** `false` si la accion se intento y fallo (login rechazado, OTP invalido). */
  exito?: boolean;
  datosPrevios?: unknown;
  datosNuevos?: unknown;
  metadatos?: Record<string, unknown>;
  /** Solo si el actor NO se puede deducir del contexto de la request. */
  actor?: ActorExplicito;
}

interface ActorResuelto {
  actorTipo: ActorAuditoria;
  usuarioId: number | null;
  usuarioCorreo: string | null;
  usuarioNombre: string | null;
  actorEtiqueta: string | null;
}

const ACTOR_DESCONOCIDO: ActorResuelto = {
  actorTipo: 'SISTEMA',
  usuarioId: null,
  usuarioCorreo: null,
  usuarioNombre: null,
  actorEtiqueta: 'proceso-interno',
};

function resolverActor(explicito?: ActorExplicito): ActorResuelto {
  if (explicito) {
    switch (explicito.tipo) {
      case 'SISTEMA':
        return { ...ACTOR_DESCONOCIDO, actorEtiqueta: explicito.etiqueta };
      case 'ANONIMO':
        return { ...ACTOR_DESCONOCIDO, actorTipo: 'ANONIMO', actorEtiqueta: null };
      case 'CIUDADANO':
        return {
          actorTipo: 'CIUDADANO',
          usuarioId: null,
          usuarioCorreo: null,
          usuarioNombre: null,
          actorEtiqueta: enmascararTelefono(explicito.telefono),
        };
      case 'USUARIO':
        return {
          actorTipo: 'USUARIO',
          usuarioId: explicito.usuarioId,
          usuarioCorreo: null,
          usuarioNombre: null,
          actorEtiqueta: null,
        };
    }
  }

  const req = contextoActual()?.req;

  // Usuario del panel. El correo y el nombre salen del JWT, no de la base: se
  // guardan desnormalizados para que la fila siga diciendo quien fue incluso si
  // manana se borra el usuario (la FK es `onDelete: SetNull`).
  if (req?.usuario) {
    return {
      actorTipo: 'USUARIO',
      usuarioId: req.usuario.usuarioId,
      usuarioCorreo: req.usuario.correoElectronico,
      usuarioNombre: `${req.usuario.nombres} ${req.usuario.apellidos}`.trim(),
      actorEtiqueta: null,
    };
  }

  if (req?.ciudadano) {
    return {
      actorTipo: 'CIUDADANO',
      usuarioId: null,
      usuarioCorreo: null,
      usuarioNombre: null,
      actorEtiqueta: enmascararTelefono(req.ciudadano.telefono),
    };
  }

  return ACTOR_DESCONOCIDO;
}

/** Recorta un texto para que una cabecera larguisima no infle la fila. */
function recortar(valor: string | undefined, largo: number): string | null {
  if (!valor) {
    return null;
  }
  return valor.length > largo ? valor.slice(0, largo) : valor;
}

/**
 * Anota una accion en la bitacora. No tira, no devuelve promesa y no hay nada
 * que esperar: se la llama y se sigue.
 *
 * ```ts
 * registrarAuditoria({
 *   accion: 'USUARIO_EDITAR',
 *   entidadId: id,
 *   descripcion: `Edito el usuario ${usuario.correoElectronico}`,
 *   datosPrevios: previo,
 *   datosNuevos: actualizado,
 * });
 * ```
 */
export function registrarAuditoria(entrada: EntradaAuditoria): void {
  // Todo lo que dependa del contexto se resuelve ACA, sincronicamente (ver el
  // comentario de cabecera): despues del primer `await` el contexto puede no estar.
  const definicion = definicionAccion(entrada.accion);
  const actor = resolverActor(entrada.actor);
  const contexto = contextoActual();
  const req = contexto?.req;

  const datos: Prisma.AuditoriaLogUncheckedCreateInput = {
    accion: definicion.accion,
    operacion: definicion.operacion,
    entidad: definicion.entidad,
    entidadId: entrada.entidadId == null ? null : String(entrada.entidadId),
    descripcion: entrada.descripcion,
    exito: entrada.exito ?? true,
    ...actor,
    ip: req?.ip ?? req?.socket.remoteAddress ?? null,
    userAgent: recortar(req?.get('user-agent'), 500),
    metodoHttp: req?.method ?? null,
    // `originalUrl` y no `path`: `path` dentro de un router viene relativo al
    // punto de montaje ("/5" en vez de "/api/v1/admin/alertas/5").
    ruta: recortar(req?.originalUrl, 500),
    requestId: contexto?.requestId ?? null,
    // El saneador es un modulo puro y devuelve `unknown` para no depender de
    // Prisma; el cast vive aca, que es el unico punto que habla con la base.
    datosPrevios: saneadoParaJson(entrada.datosPrevios) as Prisma.InputJsonValue | undefined,
    datosNuevos: saneadoParaJson(entrada.datosNuevos) as Prisma.InputJsonValue | undefined,
    metadatos: saneadoParaJson(entrada.metadatos) as Prisma.InputJsonValue | undefined,
  };

  void prisma.auditoriaLog.create({ data: datos }).catch((err: unknown) => {
    console.error(`[auditoria] No se pudo registrar ${definicion.accion}`, err);
  });
}
