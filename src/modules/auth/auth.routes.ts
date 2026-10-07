import { Router } from 'express';
import * as authController from './auth.controller';
import { authLimiter } from '../../shared/middlewares/rate-limiters';
import { validate } from '../../shared/middlewares/validate';
import {
  loginSchema,
  preAuthSchema,
  verificarDobleFactorSchema,
  refreshSchema,
  logoutSchema,
} from './auth.validation';

const router = Router();

router.use(authLimiter);

router.post('/login', validate({ body: loginSchema }), authController.login);
router.post('/2fa-codigos', validate({ body: preAuthSchema }), authController.reenviarDobleFactor);
router.post(
  '/2fa-codigos/verificacion',
  validate({ body: verificarDobleFactorSchema }),
  authController.verificarDobleFactor,
);
router.post('/refresh', validate({ body: refreshSchema }), authController.refrescarToken);
router.post('/logout', validate({ body: logoutSchema }), authController.logout);

export default router;
