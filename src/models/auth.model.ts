export interface LoginInput {
  correoElectronico: string;
  contrasena: string;
  captcha: string;
}

export interface VerificarDobleFactorInput {
  preAuthToken: string;
  codigo: string;
}

export interface RefreshTokenInput {
  refreshToken: string;
}

/**
 * Etapas del ciclo de vida de un token. El campo `etapa` actua como
 * discriminante para poder inferir el payload concreto a partir de un token
 * generico (ver `AuthTokenPayload` / `PayloadPorEtapa`).
 */
export type TokenStage = 'pre-auth' | 'access' | 'refresh';

interface BaseTokenPayload<TStage extends TokenStage> {
  etapa: TStage;
  usuarioId: number;
}

export interface PreAuthPayload extends BaseTokenPayload<'pre-auth'> {}

export interface SessionPayload extends BaseTokenPayload<'access'> {
  correoElectronico: string;
  nombres: string;
  apellidos: string;
  documento: string;
  permisos: string[];
}

export interface RefreshTokenPayload extends BaseTokenPayload<'refresh'> {
  jti: string;
}

export type AuthTokenPayload = PreAuthPayload | SessionPayload | RefreshTokenPayload;

/** Dado un `TStage`, resuelve el payload exacto asociado a esa etapa. */
export type PayloadPorEtapa<TStage extends TokenStage> = Extract<AuthTokenPayload, { etapa: TStage }>;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}
