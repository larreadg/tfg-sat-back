import { Router } from 'express';
import * as alertasController from './alertas.controller';
import * as seguimientoController from './alertas.seguimiento.controller';
import { requireAuth } from '../auth/auth.middleware';
import { requirePermiso } from '../../shared/middlewares/require-permiso';
import { validate } from '../../shared/middlewares/validate';
import {
  descargaAdjuntosLimiter,
  subidaAdjuntosLimiter,
} from '../../shared/middlewares/rate-limiters';
import { PERMISOS } from '../../shared/permissions';
import {
  alertaIdParamSchema,
  cambiarEstadoBodySchema,
  listarAlertasQuerySchema,
} from './alertas.validation';
import {
  actualizarTareaBodySchema,
  adjuntoIdParamSchema,
  contenidoAdjuntoQuerySchema,
  crearComentarioBodySchema,
  crearTareaBodySchema,
  listarComentariosQuerySchema,
  tareaIdParamSchema,
} from './alertas.seguimiento.validation';
import { manejarUploadAdjuntos } from './alertas.adjuntos';

const router = Router();

// Lectura del panel: ADMIN y ORGANISMO tienen `alerta.ver`.
router.get(
  '/',
  requireAuth,
  requirePermiso(PERMISOS.ALERTAS_VER),
  validate({ query: listarAlertasQuerySchema }),
  alertasController.listar,
);

// Detalle con los reportes que componen la alerta (para el mapa del panel).
router.get(
  '/:id',
  requireAuth,
  requirePermiso(PERMISOS.ALERTAS_VER),
  validate({ params: alertaIdParamSchema }),
  alertasController.detalle,
);

// Operar la alerta (maquina de estados): solo ADMIN (`alerta.editar`).
router.patch(
  '/:id/estado',
  requireAuth,
  requirePermiso(PERMISOS.ALERTAS_EDITAR),
  validate({ params: alertaIdParamSchema, body: cambiarEstadoBodySchema }),
  alertasController.cambiarEstado,
);

/* --------------------------------------------------------------------------
 * Seguimiento de una alerta: comentarios, archivos y checklist de tareas.
 *
 * Viven en este mismo router (y no en uno montado aparte) porque cualquier ruta
 * literal de primer nivel —`/responsables`, por ejemplo— caeria en el
 * `GET /:id` de arriba, cuyo param es numerico: daria 400 en vez de 200. Por eso
 * todo cuelga de `/:id/...`.
 *
 * LEER el seguimiento alcanza con `alerta.ver`. ESCRIBIR pide
 * `alerta.seguimiento`, que tienen ADMIN y ORGANISMO: el organismo documenta su
 * inspeccion sin poder mover la alerta de estado.
 * ------------------------------------------------------------------------- */

router.get(
  '/:id/comentarios',
  requireAuth,
  requirePermiso(PERMISOS.ALERTAS_VER),
  validate({ params: alertaIdParamSchema, query: listarComentariosQuerySchema }),
  seguimientoController.listarComentarios,
);

// `manejarUploadAdjuntos` (multer) va ANTES de `validate`: es el que parsea los
// campos de texto del multipart, asi que sin el `req.body.cuerpo` llega vacio.
router.post(
  '/:id/comentarios',
  requireAuth,
  requirePermiso(PERMISOS.ALERTAS_SEGUIMIENTO),
  subidaAdjuntosLimiter,
  manejarUploadAdjuntos,
  validate({ params: alertaIdParamSchema, body: crearComentarioBodySchema }),
  seguimientoController.crearComentario,
);

router.get(
  '/:id/adjuntos',
  requireAuth,
  requirePermiso(PERMISOS.ALERTAS_VER),
  validate({ params: alertaIdParamSchema }),
  seguimientoController.listarAdjuntos,
);

router.post(
  '/:id/adjuntos',
  requireAuth,
  requirePermiso(PERMISOS.ALERTAS_SEGUIMIENTO),
  subidaAdjuntosLimiter,
  manejarUploadAdjuntos,
  validate({ params: alertaIdParamSchema }),
  seguimientoController.subirAdjuntos,
);

router.get(
  '/:id/tareas',
  requireAuth,
  requirePermiso(PERMISOS.ALERTAS_VER),
  validate({ params: alertaIdParamSchema }),
  seguimientoController.listarTareas,
);

router.post(
  '/:id/tareas',
  requireAuth,
  requirePermiso(PERMISOS.ALERTAS_SEGUIMIENTO),
  validate({ params: alertaIdParamSchema, body: crearTareaBodySchema }),
  seguimientoController.crearTarea,
);

// A quien se le puede asignar una tarea. Pide `alerta.seguimiento` y no
// `usuario.ver` (que ORGANISMO no tiene) porque no es el padron de usuarios: es
// un catalogo acotado a id + nombre, como `/admin/webhooks/eventos`.
router.get(
  '/:id/responsables',
  requireAuth,
  requirePermiso(PERMISOS.ALERTAS_SEGUIMIENTO),
  validate({ params: alertaIdParamSchema }),
  seguimientoController.listarResponsables,
);

export default router;

/* --------------------------------------------------------------------------
 * Routers hermanos: operan un hijo por su PROPIO id, sin repetir el de la
 * alerta. Es el patron de `encuestas-admin.routes.ts` (`preguntasAdminRouter`) y
 * evita un tercer nivel de anidacion en la URL.
 * ------------------------------------------------------------------------- */

/** Montado en `/admin/adjuntos-alerta`. */
export const adjuntosAlertaRouter = Router();

// Unica puerta a estos archivos: viven fuera de `uploads/` justamente para no
// quedar publicos. Excluido del apiLimiter global (ver app.ts) y con su propio
// tope, porque cada miniatura de la pestaña Archivos es una request.
adjuntosAlertaRouter.get(
  '/:adjuntoId/contenido',
  requireAuth,
  requirePermiso(PERMISOS.ALERTAS_VER),
  descargaAdjuntosLimiter,
  validate({ params: adjuntoIdParamSchema, query: contenidoAdjuntoQuerySchema }),
  seguimientoController.descargarAdjunto,
);

adjuntosAlertaRouter.delete(
  '/:adjuntoId',
  requireAuth,
  requirePermiso(PERMISOS.ALERTAS_SEGUIMIENTO),
  validate({ params: adjuntoIdParamSchema }),
  seguimientoController.eliminarAdjunto,
);

/** Montado en `/admin/tareas-alerta`. */
export const tareasAlertaRouter = Router();

tareasAlertaRouter.patch(
  '/:tareaId',
  requireAuth,
  requirePermiso(PERMISOS.ALERTAS_SEGUIMIENTO),
  validate({ params: tareaIdParamSchema, body: actualizarTareaBodySchema }),
  seguimientoController.actualizarTarea,
);

tareasAlertaRouter.delete(
  '/:tareaId',
  requireAuth,
  requirePermiso(PERMISOS.ALERTAS_SEGUIMIENTO),
  validate({ params: tareaIdParamSchema }),
  seguimientoController.eliminarTarea,
);
