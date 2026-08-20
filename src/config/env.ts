import dotenv from 'dotenv';

dotenv.config();

interface EnvConfig {
  port: number;
  host: string;
  useHttps: boolean;
  sslKeyPath: string;
  sslCertPath: string;
  databaseUrl: string;
  nodeEnv: string;
  corsOrigin: string;
  smsApiUrl: string;
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
  openaiApiKey: string;
  openaiModel: string;
  evaluacionIaCronExpr: string;
  evaluacionIaBatchSize: number;
  evaluacionIaMaxIntentos: number;
  telegramEnabled: boolean;
  telegramBotToken: string;
  telegramWebhookSecret: string;
  telegramWebhookPath: string;
  telegramSesionExpiracionHoras: number;
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

export const env: EnvConfig = {
  port: getEnvInt('PORT', 3000),
  host: process.env.HOST || '0.0.0.0',
  useHttps: process.env.USE_HTTPS === 'true',
  sslKeyPath: process.env.SSL_KEY_PATH || 'ssl/key.pem',
  sslCertPath: process.env.SSL_CERT_PATH || 'ssl/cert.pem',
  databaseUrl: getEnvVar('DATABASE_URL'),
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:4200',
  smsApiUrl: process.env.SMS_API_URL || 'http://casa.deu.im:9000/app/sms/s.xhtml',
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
  openaiApiKey: getEnvVar('OPENAI_API_KEY'),
  openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  evaluacionIaCronExpr: process.env.EVALUACION_IA_CRON || '*/2 * * * *',
  evaluacionIaBatchSize: getEnvInt('EVALUACION_IA_BATCH_SIZE', 5),
  evaluacionIaMaxIntentos: getEnvInt('EVALUACION_IA_MAX_INTENTOS', 3),
  telegramEnabled: TELEGRAM_ENABLED,
  telegramBotToken: getEnvVarCondicional('TELEGRAM_BOT_TOKEN', TELEGRAM_ENABLED),
  telegramWebhookSecret: getEnvVarCondicional('TELEGRAM_WEBHOOK_SECRET', TELEGRAM_ENABLED),
  telegramWebhookPath: process.env.TELEGRAM_WEBHOOK_PATH || '/api/v1/telegram/webhook',
  telegramSesionExpiracionHoras: getEnvInt('TELEGRAM_SESION_EXPIRACION_HORAS', 24),
};
