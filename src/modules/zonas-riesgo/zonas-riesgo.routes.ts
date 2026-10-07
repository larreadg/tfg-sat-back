import { Router } from 'express';
import * as zonasRiesgoController from './zonas-riesgo.controller';
import { requireAuth } from '../auth/auth.middleware';
import { requirePermiso } from '../../shared/middlewares/require-permiso';
import { validate } from '../../shared/middlewares/validate';
import { PERMISOS } from '../../shared/permissions';
import {
  actualizarZonaRiesgoSchema,
  crearZonaRiesgoSchema,
  listarZonasRiesgoQuerySchema,
  zonaRiesgoIdParamSchema,
} from './zonas-riesgo.validation';

const router = Router();

router.get(
  '/',
  requireAuth,
  requirePermiso(PERMISOS.ZONAS_RIESGO_VER),
  validate({ query: listarZonasRiesgoQuerySchema }),
  zonasRiesgoController.listar,
);

router.get(
  '/:id',
  requireAuth,
  requirePermiso(PERMISOS.ZONAS_RIESGO_VER),
  validate({ params: zonaRiesgoIdParamSchema }),
  zonasRiesgoController.obtener,
);

router.post(
  '/',
  requireAuth,
  requirePermiso(PERMISOS.ZONAS_RIESGO_CREAR),
  validate({ body: crearZonaRiesgoSchema }),
  zonasRiesgoController.crear,
);

router.patch(
  '/:id',
  requireAuth,
  requirePermiso(PERMISOS.ZONAS_RIESGO_EDITAR),
  validate({ params: zonaRiesgoIdParamSchema, body: actualizarZonaRiesgoSchema }),
  zonasRiesgoController.actualizar,
);

router.delete(
  '/:id',
  requireAuth,
  requirePermiso(PERMISOS.ZONAS_RIESGO_ELIMINAR),
  validate({ params: zonaRiesgoIdParamSchema }),
  zonasRiesgoController.eliminar,
);

export default router;
