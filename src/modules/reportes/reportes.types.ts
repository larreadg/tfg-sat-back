import { CiudadanoSessionPayload } from '../citizen-auth/citizen-auth.types';

export type { CiudadanoSessionPayload };

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
