import { Router } from 'express';
import * as encuestaController from './encuestas.controller';

const router = Router();

router.get('/activa', encuestaController.getEncuestaActiva);

export default router;
