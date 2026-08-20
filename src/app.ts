import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';
import { env } from './config/env';
import routes from './routes';
import { errorHandler } from './shared/middlewares/error-handler';
import { notFoundHandler } from './shared/middlewares/not-found-handler';

/**
 * Construye la instancia de Express con toda su cadena de middlewares y rutas.
 * Se separa del arranque del servidor (`server.ts`) para poder instanciar la
 * app en tests sin abrir un puerto.
 */
export function crearApp(): Express {
  const app = express();

  const uploadsPath = path.join(process.cwd(), env.uploadsDir);
  fs.mkdirSync(uploadsPath, { recursive: true });

  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use(helmet());
  app.use(cors({ origin: env.corsOrigin }));
  app.use(express.json());
  app.use(env.uploadsBaseUrl, express.static(uploadsPath));

  app.use('/api/v1', apiLimiter, routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
