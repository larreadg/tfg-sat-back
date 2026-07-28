import { Router } from 'express';
import * as reporteCiudadanoController from '../controllers/reporteCiudadano.controller';
import { requireCiudadanoSession } from '../middlewares/ciudadanoAuth.middleware';
import { manejarUploadFotos } from '../utils/upload';

const router = Router();

router.post('/', requireCiudadanoSession, manejarUploadFotos, reporteCiudadanoController.guardarRespuestas);

export default router;
