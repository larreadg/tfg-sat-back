import { Router } from 'express';
import * as mapaController from './mapa.controller';
import { requireAuth } from '../auth/auth.middleware';
import { requirePermiso } from '../../shared/middlewares/require-permiso';
import { validate } from '../../shared/middlewares/validate';
import { PERMISOS } from '../../shared/permissions';
import { mapaQuerySchema } from './mapa.validation';

const router = Router();

// Lectura del panel: ADMIN y ORGANISMO tienen `reporte.ver`.
router.get(
  '/',
  requireAuth,
  requirePermiso(PERMISOS.REPORTES_VER),
  validate({ query: mapaQuerySchema }),
  mapaController.obtener,
);

export default router;
