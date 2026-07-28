import { Router } from 'express';
import * as ciudadanoAuthController from '../controllers/ciudadanoAuth.controller';
import { authLimiter } from '../middlewares/rateLimiters';

const router = Router();

router.use(authLimiter);

router.post('/login', ciudadanoAuthController.login);
router.post('/2fa-codigos', ciudadanoAuthController.reenviarDobleFactor);
router.post('/2fa-codigos/verificacion', ciudadanoAuthController.verificarDobleFactor);

export default router;
