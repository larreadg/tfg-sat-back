import { Router } from 'express';
import * as webhooksController from './webhooks.controller';
import { requireAuth } from '../auth/auth.middleware';
import { requirePermiso } from '../../shared/middlewares/require-permiso';
import { validate } from '../../shared/middlewares/validate';
import { pruebaWebhookLimiter } from '../../shared/middlewares/rate-limiters';
import { PERMISOS } from '../../shared/permissions';
import {
  actualizarReglaSchema,
  actualizarRemitenteSchema,
  crearReglaSchema,
  listarEntregasQuerySchema,
  listarReglasQuerySchema,
  reglaIdParamSchema,
} from './webhooks.validation';

const router = Router();

// Catalogo de eventos/acciones/condiciones. Va primero y en su propia ruta para que
// nunca compita con `/reglas/:id`.
router.get(
  '/eventos',
  requireAuth,
  requirePermiso(PERMISOS.WEBHOOKS_VER),
  webhooksController.obtenerCatalogo,
);

// Identidad del remitente de los correos. Escribe solo las columnas `remitente*` de
// `ConfiguracionNotificacion`; el transporte SMTP es del modulo de configuracion.
router.get(
  '/remitente',
  requireAuth,
  requirePermiso(PERMISOS.WEBHOOKS_VER),
  webhooksController.obtenerRemitente,
);

router.put(
  '/remitente',
  requireAuth,
  requirePermiso(PERMISOS.WEBHOOKS_EDITAR),
  validate({ body: actualizarRemitenteSchema }),
  webhooksController.actualizarRemitente,
);

// --- Reglas (CRUD) ---
router.get(
  '/reglas',
  requireAuth,
  requirePermiso(PERMISOS.WEBHOOKS_VER),
  validate({ query: listarReglasQuerySchema }),
  webhooksController.listarReglas,
);

router.post(
  '/reglas',
  requireAuth,
  requirePermiso(PERMISOS.WEBHOOKS_CREAR),
  validate({ body: crearReglaSchema }),
  webhooksController.crearRegla,
);

router.get(
  '/reglas/:id',
  requireAuth,
  requirePermiso(PERMISOS.WEBHOOKS_VER),
  validate({ params: reglaIdParamSchema }),
  webhooksController.obtenerRegla,
);

router.put(
  '/reglas/:id',
  requireAuth,
  requirePermiso(PERMISOS.WEBHOOKS_EDITAR),
  validate({ params: reglaIdParamSchema, body: actualizarReglaSchema }),
  webhooksController.actualizarRegla,
);

router.delete(
  '/reglas/:id',
  requireAuth,
  requirePermiso(PERMISOS.WEBHOOKS_ELIMINAR),
  validate({ params: reglaIdParamSchema }),
  webhooksController.eliminarRegla,
);

/**
 * Prueba de una regla. POST sobre una sub-coleccion (`/pruebas`) para no meter un
 * verbo en la URL, igual que el envio de prueba del SMTP. Limitado: dispara trafico
 * saliente (correo o HTTP) hacia un destino que elige el cliente.
 */
router.post(
  '/reglas/:id/pruebas',
  requireAuth,
  requirePermiso(PERMISOS.WEBHOOKS_EDITAR),
  pruebaWebhookLimiter,
  validate({ params: reglaIdParamSchema }),
  webhooksController.probarRegla,
);

// Bitacora de entregas de una regla.
router.get(
  '/reglas/:id/entregas',
  requireAuth,
  requirePermiso(PERMISOS.WEBHOOKS_VER),
  validate({ params: reglaIdParamSchema, query: listarEntregasQuerySchema }),
  webhooksController.listarEntregas,
);

export default router;
