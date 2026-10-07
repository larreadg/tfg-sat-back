import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';
import { env } from './config/env';
import routes from './routes';
import telegramRoutes from './modules/telegram/telegram.routes';
import { errorHandler } from './shared/middlewares/error-handler';
import { notFoundHandler } from './shared/middlewares/not-found-handler';
import { contextoRequestMiddleware } from './modules/auditoria/auditoria.contexto';

/**
 * Construye la instancia de Express con toda su cadena de middlewares y rutas.
 * Se separa del arranque del servidor (`server.ts`) para poder instanciar la
 * app en tests sin abrir un puerto.
 */
export function crearApp(): Express {
  const app = express();

  // App corre detras de un proxy local (HTTPS de dev via start-https.bat; en
  // prod, nginx/reverse-proxy). Sin esto, express-rate-limit ve X-Forwarded-For
  // con trust proxy=false y tira ERR_ERL_UNEXPECTED_X_FORWARDED_FOR. Confiamos
  // SOLO en el primer hop (loopback), no en `true`: con `true` cualquiera
  // falsifica XFF y evade el rate-limit.
  app.set('trust proxy', 'loopback');

  const uploadsPath = path.join(process.cwd(), env.uploadsDir);
  fs.mkdirSync(uploadsPath, { recursive: true });

  // Adjuntos de seguimiento de alertas. Se crea la carpeta y NADA MAS: aca no va
  // un `express.static`, a proposito. Son documentos internos del organismo y la
  // unica puerta es GET /admin/adjuntos-alerta/:adjuntoId/contenido, que exige
  // token y permiso `alerta.ver`. Si algun dia aparece un static sobre esto, los
  // adjuntos quedan publicos para cualquiera que adivine la URL.
  fs.mkdirSync(path.join(process.cwd(), env.adjuntosDir), { recursive: true });

  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false,
    // La descarga de adjuntos de alerta queda afuera: una sola pestaña de
    // archivos con 20 miniaturas son 20 requests, asi que con el tope general el
    // panel se autobloquearia. Tiene su propio limiter, mas alto
    // (`descargaAdjuntosLimiter`), montado en esa ruta.
    skip: (req) => req.path.endsWith('/contenido'),
  });

  app.use(helmet());

  // Contexto de la request para la auditoria (actor, IP, user-agent, ruta,
  // requestId). Va lo mas arriba posible y ANTES de las rutas: lo que se monte
  // mas arriba que esto queda sin contexto y sus escrituras se auditarian como
  // SISTEMA. No lee nada del body ni del token: guarda la referencia al `req` y
  // el actor se resuelve recien cuando un service registra algo (ver
  // `auditoria.contexto.ts`).
  app.use(contextoRequestMiddleware);

  // Healthcheck publico y liviano. Lo usa start-https.bat para esperar a que el
  // backend este arriba antes de registrar el webhook de Telegram.
  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  // Webhook de Telegram: se monta ANTES del CORS del panel y del rate limiter de
  // `/api/v1`. Es una ruta server-to-server (no la consume el navegador del
  // panel) con su propio parser JSON; su unica barrera es el secret header.
  if (env.telegramEnabled) {
    app.use('/api/v1/telegram', express.json(), telegramRoutes);
  }

  app.use(cors({ origin: env.corsOrigin }));
  app.use(express.json());

  // El panel/institucional embebe las fotos (<img>) desde otro origen (dev: ng
  // serve; prod: subdominio distinto al de la API). Helmet fija por defecto
  // Cross-Origin-Resource-Policy: same-origin, que hace que el navegador BLOQUEE
  // esas imagenes cross-origin. Se habilita CORP=cross-origin solo para los
  // estaticos de /uploads (siguen sin exponer PII; son archivos ya publicos).
  app.use(
    env.uploadsBaseUrl,
    (_req, res, next) => {
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      next();
    },
    express.static(uploadsPath),
  );

  app.use('/api/v1', apiLimiter, routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
