import rateLimit from 'express-rate-limit';
import { Response as ApiResponse } from '../utils/response';

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json(ApiResponse.error(429, 'Demasiados intentos. Intenta nuevamente mas tarde.'));
  },
});

/**
 * Envio de correo de prueba (`POST /admin/configuracion/notificaciones/pruebas`).
 * Es el unico endpoint del panel que dispara trafico saliente a un tercero y
 * acepta el destinatario en el body, asi que sin tope un admin podria usarlo para
 * mandar correos en loop a cualquier direccion. 5 por cuarto de hora alcanza de
 * sobra para configurar un servidor SMTP.
 */
export const pruebaCorreoLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res
      .status(429)
      .json(ApiResponse.error(429, 'Demasiadas pruebas de correo seguidas. Espera unos minutos y volve a intentar.'));
  },
});

/**
 * Prueba de una regla de webhook (`POST /admin/webhooks/reglas/:id/pruebas`).
 * Dispara trafico saliente hacia un destino que define el cliente (correo o URL),
 * asi que tiene el mismo tope que la prueba de SMTP. Un poco mas generoso porque
 * configurar varias reglas en una sesion es normal.
 */
export const pruebaWebhookLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res
      .status(429)
      .json(ApiResponse.error(429, 'Demasiadas pruebas de webhook seguidas. Espera unos minutos y volve a intentar.'));
  },
});

/**
 * Subida de adjuntos de seguimiento (`POST /admin/alertas/:id/comentarios` y
 * `/adjuntos`). Cada request puede traer 5 archivos de 10MB: sin tope, cualquiera
 * con `alerta.seguimiento` puede llenar el disco del servidor. 60 envios por
 * cuarto de hora es mucho mas de lo que da la mano de un analista documentando
 * una inspeccion.
 */
export const subidaAdjuntosLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res
      .status(429)
      .json(ApiResponse.error(429, 'Demasiados archivos subidos seguidos. Espera unos minutos y volve a intentar.'));
  },
});

/**
 * Descarga de un adjunto (`GET /admin/adjuntos-alerta/:id/contenido`).
 *
 * Tiene limiter PROPIO y generoso, y queda excluido del `apiLimiter` global de
 * `app.ts`, porque aca el patron de uso es distinto: cada miniatura de la
 * pestaña Archivos es una request, asi que abrir dos o tres alertas con fotos
 * agotaria los 300/15min del tope general y el panel mostraria imagenes rotas
 * sin ninguna pista de por que.
 */
export const descargaAdjuntosLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res
      .status(429)
      .json(ApiResponse.error(429, 'Demasiadas descargas seguidas. Espera unos minutos y volve a intentar.'));
  },
});
