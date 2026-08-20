import { Router } from 'express';
import userRoutes from './modules/users/users.routes';
import authRoutes from './modules/auth/auth.routes';
import ciudadanoAuthRoutes from './modules/citizen-auth/citizen-auth.routes';
import encuestaRoutes from './modules/encuestas/encuestas.routes';
import reporteCiudadanoRoutes from './modules/reportes/reportes.routes';

const router = Router();

router.use('/usuarios', userRoutes);
router.use('/auth', authRoutes);
router.use('/auth/ciudadano', ciudadanoAuthRoutes);
router.use('/encuestas', encuestaRoutes);
router.use('/reportes-ciudadanos', reporteCiudadanoRoutes);

export default router;
