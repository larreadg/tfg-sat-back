export interface EvaluacionIaFotoResultado {
  indice: number;
  descripcion: string;
  riesgoFoto: number;
}

export interface EvaluacionIaResultado {
  riesgo: number;
  resumen: string;
  justificacion: string;
  recomendacion: string;
  fotos: EvaluacionIaFotoResultado[];
}

export interface FotoParaEvaluar {
  respuestaArchivoId: number;
  url: string;
  orden: number;
}

export interface RespuestaParaEvaluar {
  preguntaTexto: string;
  opcionesTexto: string[];
}

export interface ReporteParaEvaluar {
  evaluacionId: number;
  reporteId: number;
  /**
   * Identificador que se le dio al ciudadano. Es como la auditoria nombra al
   * reporte: no es PII (a diferencia del telefono) y es lo que permite cruzar la
   * bitacora con el reclamo de una persona.
   */
  codigoPublico: string;
  canal: string;
  latitud: number;
  longitud: number;
  fechaCreacion: Date;
  respuestas: RespuestaParaEvaluar[];
  fotos: FotoParaEvaluar[];
}
