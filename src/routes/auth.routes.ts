import { Router } from 'express';
import * as authController from '../controllers/auth.controller';

const router = Router();

router.get('/captcha', authController.getCaptcha);
router.post('/login', authController.login);
router.post('/2fa/reenviar', authController.reenviarDobleFactor);
router.post('/2fa/verificar', authController.verificarDobleFactor);

export default router;
