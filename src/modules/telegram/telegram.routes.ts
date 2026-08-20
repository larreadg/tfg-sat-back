import { Router } from 'express';
import { webhook } from './telegram.controller';

/**
 * Ruta publica del webhook de Telegram. NO lleva `requireAuth` ni el CORS del
 * panel: se monta aparte en `app.ts`. La unica barrera es el secret header que
 * valida el controller.
 */
const router = Router();

router.post('/webhook', webhook);

export default router;
