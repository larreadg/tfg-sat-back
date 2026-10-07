import { Router } from 'express';
import userRoutes from './modules/users/users.routes';
import authRoutes from './modules/auth/auth.routes';
import ciudadanoAuthRoutes from './modules/citizen-auth/citizen-auth.routes';
import encuestaRoutes from './modules/encuestas/encuestas.routes';
import reporteCiudadanoRoutes from './modules/reportes/reportes.routes';
import reportesAdminRoutes from './modules/reportes-admin/reportes-admin.routes';
import configuracionRoutes from './modules/configuracion/configuracion.routes';
import webhooksRoutes from './modules/webhooks/webhooks.routes';
import alertasRoutes, {
  adjuntosAlertaRouter,
  tareasAlertaRouter,
} from './modules/alertas/alertas.routes';
import puntosCriticosRoutes from './modules/puntos-criticos/puntos-criticos.routes';
import mapaRoutes from './modules/mapa/mapa.routes';
import zonasRiesgoRoutes from './modules/zonas-riesgo/zonas-riesgo.routes';
import analisisRoutes from './modules/analisis/analisis.routes';
import auditoriaRoutes from './modules/auditoria/auditoria.routes';
import { rolesRouter, permisosRouter } from './modules/roles/roles.routes';
import { encuestasAdminRouter, preguntasAdminRouter } from './modules/encuestas-admin/encuestas-admin.routes';

const router = Router();

router.use('/usuarios', userRoutes);
router.use('/auth', authRoutes);
router.use('/auth/ciudadano', ciudadanoAuthRoutes);
router.use('/encuestas', encuestaRoutes);
router.use('/reportes-ciudadanos', reporteCiudadanoRoutes);
router.use('/admin/reportes', reportesAdminRoutes);
router.use('/admin/configuracion', configuracionRoutes);
router.use('/admin/webhooks', webhooksRoutes);
router.use('/admin/alertas', alertasRoutes);
// Hijos del seguimiento de una alerta que se operan por su propio id (patron de
// `preguntasAdminRouter`): asi la URL no llega a tres niveles de anidacion.
router.use('/admin/adjuntos-alerta', adjuntosAlertaRouter);
router.use('/admin/tareas-alerta', tareasAlertaRouter);
router.use('/admin/puntos-criticos', puntosCriticosRoutes);
router.use('/admin/mapa', mapaRoutes);
router.use('/admin/zonas-riesgo', zonasRiesgoRoutes);
router.use('/admin/analisis', analisisRoutes);
router.use('/admin/auditoria', auditoriaRoutes);
router.use('/admin/roles', rolesRouter);
router.use('/admin/permisos', permisosRouter);
router.use('/admin/encuestas', encuestasAdminRouter);
router.use('/admin/preguntas', preguntasAdminRouter);

export default router;
