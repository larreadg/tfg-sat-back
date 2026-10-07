import { Router } from 'express';
import * as auditoriaController from './auditoria.controller';
import { requireAuth } from '../auth/auth.middleware';
import { requirePermiso } from '../../shared/middlewares/require-permiso';
import { validate } from '../../shared/middlewares/validate';
import { PERMISOS } from '../../shared/permissions';
import { auditoriaIdParamSchema, listarAuditoriaQuerySchema } from './auditoria.validation';

/**
 * Bitacora de auditoria: **solo GET**. No hay POST, PUT ni DELETE y no es un
 * olvido — el log se escribe desde los services (`registrarAuditoria`) y nadie,
 * ni el ADMIN, puede editarlo ni borrarlo desde la aplicacion. Mismo criterio que
 * `CambioEstadoAlerta` y `ComentarioAlerta`.
 *
 * Un unico permiso (`auditoria.ver`) para las tres rutas: el catalogo y el
 * detalle no son mas sensibles que el listado.
 */
const router = Router();

// Catalogo de acciones/entidades/actores para armar los filtros del panel. Va
// primero y en su propia ruta para que nunca compita con `/:id`.
router.get(
  '/acciones',
  requireAuth,
  requirePermiso(PERMISOS.AUDITORIA_VER),
  auditoriaController.obtenerCatalogo,
);

router.get(
  '/',
  requireAuth,
  requirePermiso(PERMISOS.AUDITORIA_VER),
  validate({ query: listarAuditoriaQuerySchema }),
  auditoriaController.listar,
);

router.get(
  '/:id',
  requireAuth,
  requirePermiso(PERMISOS.AUDITORIA_VER),
  validate({ params: auditoriaIdParamSchema }),
  auditoriaController.detalle,
);

export default router;
