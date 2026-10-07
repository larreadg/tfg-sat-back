/**
 * Etapas del ciclo de vida de un token de ciudadano. Dominio separado de
 * `TokenStage` (auth admin) para que un token de un flujo no sirva en el otro
 * aunque coincida el shape.
 */
export type CiudadanoTokenStage = 'ciudadano-pre-auth' | 'ciudadano-session';

interface BaseCiudadanoTokenPayload<TStage extends CiudadanoTokenStage> {
  etapa: TStage;
}

export interface CiudadanoPreAuthPayload extends BaseCiudadanoTokenPayload<'ciudadano-pre-auth'> {
  telefono: string;
}

export interface CiudadanoSessionPayload extends BaseCiudadanoTokenPayload<'ciudadano-session'> {
  usuarioCiudadanoId: number;
  telefono: string;
  validacionSmsId: number;
}

export type CiudadanoTokenPayload = CiudadanoPreAuthPayload | CiudadanoSessionPayload;

export type PayloadPorEtapaCiudadano<TStage extends CiudadanoTokenStage> = Extract<
  CiudadanoTokenPayload,
  { etapa: TStage }
>;
