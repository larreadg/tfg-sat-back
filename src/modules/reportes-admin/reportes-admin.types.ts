import { Canal } from '@prisma/client';

/**
 * Ubicacion legible resuelta por geocodificacion inversa. Todos los campos son
 * opcionales: el proveedor puede no tener mapeado el barrio o la calle.
 */
export interface ReporteUbicacionDTO {
  pais: string | null;
  departamento: string | null;
  distrito: string | null;
  barrio: string | null;
  calle: string | null;
  direccion: string | null;
}

export interface ReporteFotoPreviewDTO {
  id: number;
  url: string;
}

export interface ReporteListItemDTO {
  id: number;
  codigoPublico: string;
  canal: Canal;
  fecha: Date;
  latitud: number;
  longitud: number;
  /** null mientras la geocodificacion no corrio o no resolvio. */
  ubicacion: ReporteUbicacionDTO | null;
  nivelPreliminar: number | null;
  criticidad: number | null;
  estadoAnalisis: string;
  riesgoScore: number | null;
  tieneFotos: boolean;
  /** Fotos del reporte para el preview de la grilla (orden de carga). */
  fotos: ReporteFotoPreviewDTO[];
  /** PII: solo si el solicitante tiene `usuario_ciudadano.ver`. */
  telefono?: string;
}

export interface ReporteListadoDTO {
  items: ReporteListItemDTO[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ReporteRespuestaDTO {
  preguntaId: number;
  pregunta: string;
  tipo: string;
  opciones: string[];
}

export interface ReporteFotoDTO {
  id: number;
  url: string;
  orden: number;
  descripcionIa: string | null;
  riesgoFoto: number | null;
}

export interface ReporteEvaluacionDTO {
  estado: string;
  riesgoScore: number | null;
  resumen: string | null;
  justificacion: string | null;
  recomendacion: string | null;
  modelo: string | null;
  promptVersion: number;
  intentos: number;
  errorMensaje: string | null;
}

export interface ReporteDesgloseDTO {
  f1: number | null;
  f2: number | null;
  f3: number | null;
  f4: number | null;
  f5: number | null;
  bonusVulnerabilidad: number;
  configId: number;
}

export interface ReporteDetalleDTO {
  id: number;
  codigoPublico: string;
  canal: Canal;
  fecha: Date;
  latitud: number;
  longitud: number;
  /** null mientras la geocodificacion no corrio o no resolvio. */
  ubicacion: ReporteUbicacionDTO | null;
  descripcion: string | null;
  nivelPreliminar: number | null;
  criticidad: number | null;
  telefono?: string; // solo si el solicitante puede ver PII del ciudadano
  respuestas: ReporteRespuestaDTO[];
  fotos: ReporteFotoDTO[];
  evaluacion: ReporteEvaluacionDTO | null;
  desglose: ReporteDesgloseDTO | null;
}
