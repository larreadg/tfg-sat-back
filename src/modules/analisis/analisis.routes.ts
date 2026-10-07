import { Router } from 'express';
import * as analisisController from './analisis.controller';
import { requireAuth } from '../auth/auth.middleware';
import { requirePermiso } from '../../shared/middlewares/require-permiso';
import { validate } from '../../shared/middlewares/validate';
import { PERMISOS } from '../../shared/permissions';
import { resumenQuerySchema } from './analisis.validation';

const router = Router();

// Metricas agregadas del panel. Mismo permiso que el listado de reportes
// (`reporte.ver`, ADMIN y ORGANISMO): son los mismos datos, agregados y sin PII.
router.get(
  '/resumen',
  requireAuth,
  requirePermiso(PERMISOS.REPORTES_VER),
  validate({ query: resumenQuerySchema }),
  analisisController.resumen,
);

export default router;
