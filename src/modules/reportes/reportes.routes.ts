import { Router } from 'express';
import * as reporteCiudadanoController from './reportes.controller';
import { requireCiudadanoSession } from '../citizen-auth/citizen-auth.middleware';
import { manejarUploadFotos } from './upload';
import { validate } from '../../shared/middlewares/validate';
import { guardarRespuestasSchema } from './reportes.validation';

const router = Router();

router.post(
  '/',
  requireCiudadanoSession,
  manejarUploadFotos,
  validate({ body: guardarRespuestasSchema }),
  reporteCiudadanoController.guardarRespuestas,
);

export default router;
