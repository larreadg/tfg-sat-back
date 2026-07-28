import { Router } from 'express';
import userRoutes from './user.routes';
import authRoutes from './auth.routes';
import ciudadanoAuthRoutes from './ciudadanoAuth.routes';
import encuestaRoutes from './encuesta.routes';
import reporteCiudadanoRoutes from './reporteCiudadano.routes';

const router = Router();

router.use('/usuarios', userRoutes);
router.use('/auth', authRoutes);
router.use('/auth/ciudadano', ciudadanoAuthRoutes);
router.use('/encuestas', encuestaRoutes);
router.use('/reportes-ciudadanos', reporteCiudadanoRoutes);

export default router;
