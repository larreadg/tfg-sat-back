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
  validacionSmsId: number;
  canal: string;
  latitud: number;
  longitud: number;
  fechaCreacion: Date;
  respuestas: RespuestaParaEvaluar[];
  fotos: FotoParaEvaluar[];
}
