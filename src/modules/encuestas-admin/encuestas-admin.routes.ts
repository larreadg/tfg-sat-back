import { Router } from 'express';
import * as encuestasAdminController from './encuestas-admin.controller';
import { requireAuth } from '../auth/auth.middleware';
import { requirePermiso } from '../../shared/middlewares/require-permiso';
import { validate } from '../../shared/middlewares/validate';
import { PERMISOS } from '../../shared/permissions';
import {
  actualizarEncuestaSchema,
  actualizarPreguntaSchema,
  crearEncuestaSchema,
  crearVersionSchema,
  crearPreguntaSchema,
  encuestaIdParamSchema,
  preguntaIdParamSchema,
  reemplazarContenidoSchema,
} from './encuestas-admin.validation';

/** Router de encuestas admin, montado en /admin/encuestas. */
export const encuestasAdminRouter = Router();

encuestasAdminRouter.get('/', requireAuth, requirePermiso(PERMISOS.ENCUESTAS_VER), encuestasAdminController.listar);

// La version ACTIVA, con sus preguntas, opciones y `codigo`s. La usa el editor del
// motor de criticidad para armar las reglas sobre preguntas reales en vez de que el
// analista tipee codigos a mano.
//
// Va ANTES de `/:id` a proposito: montada despues, Express probaria primero `/:id`
// y "activa" caeria en la validacion numerica del parametro.
encuestasAdminRouter.get(
  '/activa',
  requireAuth,
  requirePermiso(PERMISOS.ENCUESTAS_VER),
  encuestasAdminController.detalleActiva,
);

encuestasAdminRouter.get(
  '/:id',
  requireAuth,
  requirePermiso(PERMISOS.ENCUESTAS_VER),
  validate({ params: encuestaIdParamSchema }),
  encuestasAdminController.detalle,
);

encuestasAdminRouter.post(
  '/',
  requireAuth,
  requirePermiso(PERMISOS.ENCUESTAS_CREAR),
  validate({ body: crearEncuestaSchema }),
  encuestasAdminController.crear,
);

// Nueva version a partir de otra: clona preguntas y opciones en un borrador.
encuestasAdminRouter.post(
  '/:id/versiones',
  requireAuth,
  requirePermiso(PERMISOS.ENCUESTAS_CREAR),
  validate({ params: encuestaIdParamSchema, body: crearVersionSchema }),
  encuestasAdminController.crearVersion,
);

encuestasAdminRouter.put(
  '/:id',
  requireAuth,
  requirePermiso(PERMISOS.ENCUESTAS_EDITAR),
  validate({ params: encuestaIdParamSchema, body: actualizarEncuestaSchema }),
  encuestasAdminController.actualizar,
);

// Guardado completo del borrador (el editor del panel confirma todo junto).
encuestasAdminRouter.put(
  '/:id/contenido',
  requireAuth,
  requirePermiso(PERMISOS.ENCUESTAS_EDITAR),
  validate({ params: encuestaIdParamSchema, body: reemplazarContenidoSchema }),
  encuestasAdminController.reemplazarContenido,
);

encuestasAdminRouter.delete(
  '/:id',
  requireAuth,
  requirePermiso(PERMISOS.ENCUESTAS_ELIMINAR),
  validate({ params: encuestaIdParamSchema }),
  encuestasAdminController.eliminar,
);

encuestasAdminRouter.post(
  '/:id/preguntas',
  requireAuth,
  requirePermiso(PERMISOS.PREGUNTAS_CREAR),
  validate({ params: encuestaIdParamSchema, body: crearPreguntaSchema }),
  encuestasAdminController.agregarPregunta,
);

/** Router de preguntas admin, montado en /admin/preguntas. */
export const preguntasAdminRouter = Router();

preguntasAdminRouter.put(
  '/:preguntaId',
  requireAuth,
  requirePermiso(PERMISOS.PREGUNTAS_EDITAR),
  validate({ params: preguntaIdParamSchema, body: actualizarPreguntaSchema }),
  encuestasAdminController.actualizarPregunta,
);

preguntasAdminRouter.delete(
  '/:preguntaId',
  requireAuth,
  requirePermiso(PERMISOS.PREGUNTAS_ELIMINAR),
  validate({ params: preguntaIdParamSchema }),
  encuestasAdminController.eliminarPregunta,
);
