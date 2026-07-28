import dotenv from 'dotenv';

dotenv.config();

interface EnvConfig {
  port: number;
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
}

function getEnvVar(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
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

export const env: EnvConfig = {
  port: getEnvInt('PORT', 3000),
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
};
