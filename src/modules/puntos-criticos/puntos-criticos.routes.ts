import { Router } from 'express';
import * as puntosCriticosController from './puntos-criticos.controller';
import { requireAuth } from '../auth/auth.middleware';
import { requirePermiso } from '../../shared/middlewares/require-permiso';
import { validate } from '../../shared/middlewares/validate';
import { PERMISOS } from '../../shared/permissions';
import { listarPuntosCriticosQuerySchema } from './puntos-criticos.validation';

const router = Router();

// Lectura del panel: ADMIN y ORGANISMO tienen `punto_critico.ver`.
router.get(
  '/',
  requireAuth,
  requirePermiso(PERMISOS.PUNTOS_CRITICOS_VER),
  validate({ query: listarPuntosCriticosQuerySchema }),
  puntosCriticosController.listar,
);

export default router;
