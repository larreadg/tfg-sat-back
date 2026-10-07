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
  descripcion?: string;
}

/**
 * Representa el reporte que se acaba de crear (ERS §4.3, opcion 1). Un envio es
 * un `Reporte` que agrupa sus `Respuesta` (una por pregunta) y su `EvaluacionIa`.
 * `codigoPublico` es el identificador de seguimiento que se le devuelve al
 * ciudadano.
 */
export interface ReporteCreadoDTO {
  reporteId: number;
  codigoPublico: string;
  encuestaId: number;
  respuestaIds: number[];
}

/** Origen de un envio: el ciudadano y, solo en WEB, la validacion OTP asociada. */
export interface OrigenReporte {
  usuarioCiudadanoId: number;
  validacionSmsId?: number | null;
  /**
   * Telefono del ciudadano, solo para identificar al ACTOR en la bitacora de
   * auditoria (y siempre enmascarado antes de guardarse). En el canal WEB llega
   * gratis porque `origen` es el payload de la sesion del ciudadano; los bots lo
   * pasan a mano. Si falta, el reporte se audita sin actor identificado, que es
   * degradacion aceptable: el reporte igual queda con su `codigoPublico`.
   */
  telefono?: string | null;
}

/** Estado publico minimo de un reporte (sin telefono ni datos personales). */
export interface ReporteEstadoPublicoDTO {
  codigoPublico: string;
  fecha: Date;
  estadoAnalisis: string;
  nivelPreliminar: number | null;
}
