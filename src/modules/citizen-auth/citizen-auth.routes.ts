import { Router } from 'express';
import * as ciudadanoAuthController from './citizen-auth.controller';
import { authLimiter } from '../../shared/middlewares/rate-limiters';
import { validate } from '../../shared/middlewares/validate';
import { citizenLoginSchema, citizenPreAuthSchema, citizenVerificarSchema } from './citizen-auth.validation';

const router = Router();

router.use(authLimiter);

router.post('/login', validate({ body: citizenLoginSchema }), ciudadanoAuthController.login);
router.post('/2fa-codigos', validate({ body: citizenPreAuthSchema }), ciudadanoAuthController.reenviarDobleFactor);
router.post(
  '/2fa-codigos/verificacion',
  validate({ body: citizenVerificarSchema }),
  ciudadanoAuthController.verificarDobleFactor,
);

export default router;
