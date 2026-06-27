import dotenv from 'dotenv';

dotenv.config();

interface EnvConfig {
  port: number;
  databaseUrl: string;
  nodeEnv: string;
  smsApiUrl: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  jwtPreAuthExpiresIn: string;
}

function getEnvVar(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const env: EnvConfig = {
  port: Number(process.env.PORT) || 3000,
  databaseUrl: getEnvVar('DATABASE_URL'),
  nodeEnv: process.env.NODE_ENV || 'development',
  smsApiUrl: process.env.SMS_API_URL || 'http://casa.deu.im:9000/app/sms/s.xhtml',
  jwtSecret: getEnvVar('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  jwtPreAuthExpiresIn: process.env.JWT_PRE_AUTH_EXPIRES_IN || '5m',
};
