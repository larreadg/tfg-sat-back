import { Router } from 'express';
import * as rolesController from './roles.controller';
import { requireAuth } from '../auth/auth.middleware';
import { requirePermiso } from '../../shared/middlewares/require-permiso';
import { validate } from '../../shared/middlewares/validate';
import { PERMISOS } from '../../shared/permissions';
import { actualizarRolSchema, crearRolSchema, rolIdParamSchema } from './roles.validation';

/** Router de roles, montado en /admin/roles. */
export const rolesRouter = Router();

rolesRouter.get('/', requireAuth, requirePermiso(PERMISOS.ROLES_VER), rolesController.listar);

rolesRouter.get(
  '/:id',
  requireAuth,
  requirePermiso(PERMISOS.ROLES_VER),
  validate({ params: rolIdParamSchema }),
  rolesController.detalle,
);

rolesRouter.post(
  '/',
  requireAuth,
  requirePermiso(PERMISOS.ROLES_CREAR),
  validate({ body: crearRolSchema }),
  rolesController.crear,
);

rolesRouter.put(
  '/:id',
  requireAuth,
  requirePermiso(PERMISOS.ROLES_EDITAR),
  validate({ params: rolIdParamSchema, body: actualizarRolSchema }),
  rolesController.actualizar,
);

rolesRouter.delete(
  '/:id',
  requireAuth,
  requirePermiso(PERMISOS.ROLES_ELIMINAR),
  validate({ params: rolIdParamSchema }),
  rolesController.eliminar,
);

/** Router del catalogo de permisos, montado en /admin/permisos. */
export const permisosRouter = Router();

permisosRouter.get('/', requireAuth, requirePermiso(PERMISOS.PERMISOS_VER), rolesController.listarPermisos);
