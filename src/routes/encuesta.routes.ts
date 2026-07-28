import { Router } from 'express';
import * as encuestaController from '../controllers/encuesta.controller';

const router = Router();

router.get('/activa', encuestaController.getEncuestaActiva);

export default router;
