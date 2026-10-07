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

// Consulta publica del estado de un reporte por su codigo (sin auth, sin
// telefono). ERS §8: GET /reportes/:codigoPublico/estado.
router.get('/:codigoPublico/estado', reporteCiudadanoController.obtenerEstadoPublico);

export default router;
