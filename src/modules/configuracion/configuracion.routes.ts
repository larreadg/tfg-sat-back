import { Router } from 'express';
import * as configuracionController from './configuracion.controller';
import { requireAuth } from '../auth/auth.middleware';
import { requirePermiso } from '../../shared/middlewares/require-permiso';
import { validate } from '../../shared/middlewares/validate';
import { pruebaCorreoLimiter } from '../../shared/middlewares/rate-limiters';
import { PERMISOS } from '../../shared/permissions';
import {
  actualizarConfiguracionSchema,
  actualizarNotificacionSchema,
  probarNotificacionSchema,
  versionIdParamSchema,
  versionesQuerySchema,
} from './configuracion.validation';

const router = Router();

router.get('/', requireAuth, requirePermiso(PERMISOS.CONFIGURACION_VER), configuracionController.obtener);

router.put(
  '/',
  requireAuth,
  requirePermiso(PERMISOS.CONFIGURACION_EDITAR),
  validate({ body: actualizarConfiguracionSchema }),
  configuracionController.actualizar,
);

// Historial de versiones (solo lectura). El panel usa una version vieja como
// plantilla para crear la siguiente; no existe endpoint para reactivarla, porque
// `DesgloseFactores.configId` asume que el historial avanza siempre hacia adelante.
router.get(
  '/versiones',
  requireAuth,
  requirePermiso(PERMISOS.CONFIGURACION_VER),
  validate({ query: versionesQuerySchema }),
  configuracionController.listarVersiones,
);

router.get(
  '/versiones/:id',
  requireAuth,
  requirePermiso(PERMISOS.CONFIGURACION_VER),
  validate({ params: versionIdParamSchema }),
  configuracionController.obtenerVersion,
);

// Estado operativo del sistema (canales, IA, encuesta activa). Sin secretos.
router.get(
  '/sistema',
  requireAuth,
  requirePermiso(PERMISOS.CONFIGURACION_SISTEMA_VER),
  configuracionController.obtenerSistema,
);

// --- Canales de salida: correo (SMTP) ---------------------------------------
// Fila unica, no versionada: el PUT sobrescribe. La contrasena SMTP entra por aca
// y no sale por ningun endpoint (ver `ConfiguracionNotificacionDTO`).
router.get(
  '/notificaciones',
  requireAuth,
  requirePermiso(PERMISOS.CONFIGURACION_SISTEMA_VER),
  configuracionController.obtenerNotificaciones,
);

router.put(
  '/notificaciones',
  requireAuth,
  requirePermiso(PERMISOS.CONFIGURACION_SISTEMA_EDITAR),
  validate({ body: actualizarNotificacionSchema }),
  configuracionController.actualizarNotificaciones,
);

/**
 * Prueba de envio. Es una ACCION, no un recurso que se guarde, pero se expone como
 * sub-coleccion (`/pruebas` + POST) para no meter un verbo en la URL. No persiste
 * nada: devuelve 200 si el correo salio, o 502 con el error del servidor SMTP.
 * Exige `.editar` porque elige el destinatario y dispara trafico saliente.
 */
router.post(
  '/notificaciones/pruebas',
  requireAuth,
  requirePermiso(PERMISOS.CONFIGURACION_SISTEMA_EDITAR),
  pruebaCorreoLimiter,
  validate({ body: probarNotificacionSchema }),
  configuracionController.probarNotificaciones,
);

export default router;
