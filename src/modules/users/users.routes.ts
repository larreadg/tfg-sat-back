import { Router } from 'express';
import * as userController from './users.controller';
import { requireAuth } from '../auth/auth.middleware';
import { requirePermiso } from '../../shared/middlewares/require-permiso';
import { validate } from '../../shared/middlewares/validate';
import { PERMISOS } from '../../shared/permissions';
import {
  createUserSchema,
  updateUserSchema,
  userIdParamsSchema,
  listUsersQuerySchema,
} from './users.validation';

const router = Router();

router.use(requireAuth);

router.get(
  '/',
  requirePermiso(PERMISOS.USUARIOS_VER),
  validate({ query: listUsersQuerySchema }),
  userController.getUsers,
);
router.get(
  '/:id',
  requirePermiso(PERMISOS.USUARIOS_VER),
  validate({ params: userIdParamsSchema }),
  userController.getUser,
);
router.post(
  '/',
  requirePermiso(PERMISOS.USUARIOS_CREAR),
  validate({ body: createUserSchema }),
  userController.createUser,
);
router.put(
  '/:id',
  requirePermiso(PERMISOS.USUARIOS_EDITAR),
  validate({ params: userIdParamsSchema, body: updateUserSchema }),
  userController.updateUser,
);
router.delete(
  '/:id',
  requirePermiso(PERMISOS.USUARIOS_ELIMINAR),
  validate({ params: userIdParamsSchema }),
  userController.deleteUser,
);

export default router;
