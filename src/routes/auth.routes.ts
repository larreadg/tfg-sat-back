import { Router } from 'express';
import * as authController from '../controllers/auth.controller';
import { authLimiter } from '../middlewares/rateLimiters';

const router = Router();

router.use(authLimiter);

router.get('/captcha', authController.getCaptcha);
router.post('/login', authController.login);
router.post('/2fa-codigos', authController.reenviarDobleFactor);
router.post('/2fa-codigos/verificacion', authController.verificarDobleFactor);
router.post('/refresh', authController.refrescarToken);
router.post('/logout', authController.logout);

export default router;
