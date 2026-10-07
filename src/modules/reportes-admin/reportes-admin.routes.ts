import { Router } from 'express';
import * as reportesAdminController from './reportes-admin.controller';
import { requireAuth } from '../auth/auth.middleware';
import { requirePermiso } from '../../shared/middlewares/require-permiso';
import { validate } from '../../shared/middlewares/validate';
import { PERMISOS } from '../../shared/permissions';
import { listarReportesQuerySchema, reporteIdParamSchema } from './reportes-admin.validation';

const router = Router();

// Lectura del panel: ADMIN y ORGANISMO tienen `reporte.ver`.
router.get(
  '/',
  requireAuth,
  requirePermiso(PERMISOS.REPORTES_VER),
  validate({ query: listarReportesQuerySchema }),
  reportesAdminController.listar,
);

router.get(
  '/:id',
  requireAuth,
  requirePermiso(PERMISOS.REPORTES_VER),
  validate({ params: reporteIdParamSchema }),
  reportesAdminController.detalle,
);

export default router;
