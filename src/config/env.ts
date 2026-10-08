import dotenv from 'dotenv';

dotenv.config();

interface EnvConfig {
  port: number;
  host: string;
  trustProxy: string | number;
  useHttps: boolean;
  sslKeyPath: string;
  sslCertPath: string;
  databaseUrl: string;
  nodeEnv: string;
  corsOrigin: string;
  smsApiUrl: string;
  turnstileSecret: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  jwtPreAuthExpiresIn: string;
  jwtRefreshSecret: string;
  jwtRefreshExpiresIn: string;
  jwtCiudadanoSecret: string;
  jwtCiudadanoPreAuthExpiresIn: string;
  jwtCiudadanoSessionExpiresIn: string;
  uploadsDir: string;
  uploadsBaseUrl: string;
  adjuntosDir: string;
  openaiApiKey: string;
  openaiModel: string;
  evaluacionIaCronExpr: string;
  evaluacionIaBatchSize: number;
  evaluacionIaMaxIntentos: number;
  telegramEnabled: boolean;
  telegramBotToken: string;
  telegramWebhookSecret: string;
  telegramWebhookPath: string;
  telegramWebhookUrl: string;
  telegramSesionExpiracionHoras: number;
  geocodingEnabled: boolean;
  geocodingUrl: string;
  geocodingUserAgent: string;
  geocodingIdioma: string;
  geocodingTimeoutMs: number;
  configEncryptionKey: string;
  webhooksPermitirRedPrivada: boolean;
}

function getEnvVar(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

/**
 * Igual que getEnvVar pero solo exige la variable cuando `requerida` es true.
 * Se usa para la config de Telegram: si `TELEGRAM_ENABLED` no esta activo, el
 * token/secret son opcionales y la app arranca igual. Nunca se loguea el valor.
 */
function getEnvVarCondicional(key: string, requerida: boolean): string {
  const value = process.env[key];
  if (!value) {
    if (requerida) {
      throw new Error(`Missing required environment variable: ${key} (requerida cuando TELEGRAM_ENABLED=true)`);
    }
    return '';
  }
  return value;
}

/**
 * URL publica completa del webhook de Telegram. Opcional: si esta, el servidor
 * la registra al arrancar (ver telegram.bootstrap.ts). Telegram solo acepta
 * HTTPS, asi que se valida aca y no recien cuando Telegram la rechace.
 */
function getTelegramWebhookUrl(): string {
  const url = (process.env.TELEGRAM_WEBHOOK_URL || '').trim();
  if (url && !url.startsWith('https://')) {
    throw new Error('TELEGRAM_WEBHOOK_URL tiene que empezar con https:// (Telegram no acepta otra cosa).');
  }
  return url;
}

function getEnvInt(key: string, defaultValue: number): number {
  const raw = process.env[key];
  if (raw === undefined) {
    return defaultValue;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) {
    throw new Error(`Invalid environment variable ${key}: expected an integer, got "${raw}"`);
  }
  return parsed;
}

const TELEGRAM_ENABLED = process.env.TELEGRAM_ENABLED === 'true';

/**
 * Valor de `trust proxy` de Express: un numero de saltos (`1`) o lo que acepta
 * Express como texto (`loopback`, `uniquelocal`, IPs/subredes separadas por
 * coma). `true` se rechaza a proposito: confia en cualquier X-Forwarded-For y
 * cualquiera falsifica su IP para evadir el rate-limit.
 */
function getTrustProxy(): string | number {
  const raw = (process.env.TRUST_PROXY || 'loopback').trim();
  if (raw === 'true') {
    throw new Error('TRUST_PROXY=true no esta permitido: usar un numero de saltos, "loopback", "uniquelocal" o subredes.');
  }
  return /^\d+$/.test(raw) ? Number(raw) : raw;
}

export const env: EnvConfig = {
  port: getEnvInt('PORT', 3000),
  host: process.env.HOST || '0.0.0.0',
  trustProxy: getTrustProxy(),
  useHttps: process.env.USE_HTTPS === 'true',
  sslKeyPath: process.env.SSL_KEY_PATH || 'ssl/key.pem',
  sslCertPath: process.env.SSL_CERT_PATH || 'ssl/cert.pem',
  databaseUrl: getEnvVar('DATABASE_URL'),
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:4200',
  smsApiUrl: process.env.SMS_API_URL || 'http://casa.deu.im:9000/app/sms/s.xhtml',
  // OBLIGATORIO: Turnstile es el unico gate anti-bot de los flujos publicos
  // (login, validacion de telefono y envio de reporte). Sin secret no hay
  // verificacion posible, asi que la app no arranca. En desarrollo se usa la
  // clave de prueba de Cloudflare (ver .env.example).
  turnstileSecret: getEnvVar('TURNSTILE_SECRET'),
  jwtSecret: getEnvVar('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '15m',
  jwtPreAuthExpiresIn: process.env.JWT_PRE_AUTH_EXPIRES_IN || '5m',
  jwtRefreshSecret: getEnvVar('JWT_REFRESH_SECRET'),
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  jwtCiudadanoSecret: getEnvVar('JWT_CIUDADANO_SECRET'),
  jwtCiudadanoPreAuthExpiresIn: process.env.JWT_CIUDADANO_PRE_AUTH_EXPIRES_IN || '5m',
  jwtCiudadanoSessionExpiresIn: process.env.JWT_CIUDADANO_SESSION_EXPIRES_IN || '30m',
  uploadsDir: process.env.UPLOADS_DIR || 'uploads',
  uploadsBaseUrl: process.env.UPLOADS_BASE_URL || '/uploads',
  // Raiz de los adjuntos de seguimiento de alertas. HERMANA de `uploadsDir`,
  // nunca dentro: todo lo que cuelga de `uploads/` lo publica `express.static`
  // SIN autenticacion (ver app.ts), y un acta de inspeccion es interna. Estos
  // archivos se entregan solo por GET /admin/adjuntos-alerta/:id/contenido.
  adjuntosDir: process.env.ADJUNTOS_DIR || 'adjuntos-seguimiento',
  openaiApiKey: getEnvVar('OPENAI_API_KEY'),
  openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  evaluacionIaCronExpr: process.env.EVALUACION_IA_CRON || '*/2 * * * *',
  evaluacionIaBatchSize: getEnvInt('EVALUACION_IA_BATCH_SIZE', 5),
  evaluacionIaMaxIntentos: getEnvInt('EVALUACION_IA_MAX_INTENTOS', 3),
  telegramEnabled: TELEGRAM_ENABLED,
  telegramBotToken: getEnvVarCondicional('TELEGRAM_BOT_TOKEN', TELEGRAM_ENABLED),
  telegramWebhookSecret: getEnvVarCondicional('TELEGRAM_WEBHOOK_SECRET', TELEGRAM_ENABLED),
  telegramWebhookPath: process.env.TELEGRAM_WEBHOOK_PATH || '/api/v1/telegram/webhook',
  // Solo en el servidor. En local la registra start-https.bat con la URL del tunel.
  telegramWebhookUrl: getTelegramWebhookUrl(),
  telegramSesionExpiracionHoras: getEnvInt('TELEGRAM_SESION_EXPIRACION_HORAS', 24),
  // Geocodificacion inversa (lat/lon -> departamento/ciudad/barrio/calle). No es
  // critica: si falla, el reporte queda solo con coordenadas, por eso ninguna de
  // estas variables es obligatoria. Por defecto usa Nominatim publico, que exige
  // un User-Agent identificable y limita a 1 req/s (mitigado con cache en DB).
  geocodingEnabled: process.env.GEOCODING_ENABLED !== 'false',
  geocodingUrl: process.env.GEOCODING_URL || 'https://nominatim.openstreetmap.org/reverse',
  geocodingUserAgent: process.env.GEOCODING_USER_AGENT || 'AGUARD-TFG/1.0 (sistema de alerta temprana de agua)',
  geocodingIdioma: process.env.GEOCODING_IDIOMA || 'es',
  geocodingTimeoutMs: getEnvInt('GEOCODING_TIMEOUT_MS', 5000),
  // Clave maestra con la que `shared/utils/crypto.ts` cifra los secretos que el
  // ADMIN configura desde el panel (hoy: la contrasena SMTP). NO es obligatoria
  // para arrancar, a proposito: sin ella la app levanta igual y solo falla, con
  // mensaje claro, al intentar guardar o usar uno de esos secretos. Si se pierde
  // o se rota, lo ya guardado no se puede descifrar y hay que volver a cargarlo.
  configEncryptionKey: process.env.CONFIG_ENCRYPTION_KEY || '',
  // Un usuario con `webhook.editar` elige una URL que el SERVIDOR visita, asi que
  // por defecto se bloquean los destinos en rango privado/loopback (SSRF: metadatos
  // de la nube, servicios internos). Poner en `true` SOLO en desarrollo, para poder
  // probar reglas contra un receptor local. Ver `webhooks.despachador.ts`.
  webhooksPermitirRedPrivada: process.env.WEBHOOKS_PERMITIR_RED_PRIVADA === 'true',
};
