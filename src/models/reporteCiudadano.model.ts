export interface LoginCiudadanoInput {
  telefono: string;
  captcha: string;
}

export interface ReenviarCiudadanoInput {
  preAuthToken: string;
}

export interface VerificarCiudadanoInput {
  preAuthToken: string;
  codigo: string;
}

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

export interface RespuestaItemInput {
  preguntaId: number;
  preguntaOpcionIds?: number[];
}

export interface GuardarRespuestasInput {
  encuestaId?: number;
  respuestas: RespuestaItemInput[];
  latitud: number;
  longitud: number;
}

/**
 * Representa el reporte que se acaba de crear. No existe una tabla `Reporte`
 * unica: un envio genera varias filas `Respuesta` (una por pregunta) que
 * comparten `validacionSmsId`, por eso ese campo identifica al envio como
 * conjunto para quien consuma el 201.
 */
export interface ReporteCreadoDTO {
  encuestaId: number;
  validacionSmsId: number;
  respuestaIds: number[];
}
