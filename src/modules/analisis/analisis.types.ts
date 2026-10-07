import { Canal, EstadoAlerta, EstadoEvaluacionIa } from '@prisma/client';

export interface ConteoPorNivelDTO {
  nivel: number;
  cantidad: number;
}

/**
 * Foto del estado ACTUAL del sistema. A diferencia del resto del resumen, no se
 * filtra por el periodo: responde "que esta pasando ahora", no "que paso entre
 * tal y tal fecha".
 */
export interface SituacionDTO {
  reportes24h: number;
  reportes7d: number;
  reportesPeriodo: number;
  /** Reportes cuyo analisis de IA todavia no quedo asentado (backlog real). */
  sinAnalizar: number;
  alertasActivasPorNivel: ConteoPorNivelDTO[];
  alertasActivasTotal: number;
  puntosCriticosActivos: number;
}

/** Un dia de la serie temporal. Los dias sin reportes vienen en cero. */
export interface DiaTendenciaDTO {
  fecha: string;
  nivel0: number;
  nivel1: number;
  nivel2: number;
  nivel3: number;
  /** Reportes cuyo nivel todavia no se calculo. */
  sinNivel: number;
  total: number;
}

export interface PromedioFactorDTO {
  factor: 'f1' | 'f2' | 'f3' | 'f4' | 'f5';
  etiqueta: string;
  /** Promedio 0-5 sobre los reportes donde el factor estuvo disponible. */
  promedio: number | null;
  /** En cuantos reportes del periodo estuvo disponible (los `null` se renormalizan). */
  disponibleEn: number;
}

/**
 * De donde sale el riesgo: como se reparte el peso entre los factores del motor
 * (ERS §5.1) y cuantas veces se aplicaron las reglas RN-11 / RN-12.
 */
export interface FactoresDTO {
  reportesConDesglose: number;
  promedios: PromedioFactorDTO[];
  criticidadPromedio: number | null;
  /** RN-12: reportes con bonus por lugar vulnerable (escuela / puesto de salud). */
  conBonusVulnerabilidad: number;
  /** RN-11: reportes que declararon malestar (P-07 = "Si"), que fuerzan Nivel >= 1. */
  conPisoNivel1: number;
  /** Reportes sin F4: la IA no aporto (pendiente, error o sin score). */
  sinAporteIa: number;
  distribucionNivel: ConteoPorNivelDTO[];
  umbrales: { n1: number; n2: number; n3: number } | null;
}

/** Salud del job de IA: sin esto, un cron caido no se ve en ninguna pantalla. */
export interface SaludIaDTO {
  porEstado: { estado: EstadoEvaluacionIa; cantidad: number }[];
  total: number;
  conError: number;
  intentosPromedio: number | null;
  /** Segundos promedio entre que se creo la evaluacion y quedo COMPLETADO. */
  latenciaSegundos: number | null;
  riesgoScorePromedio: number | null;
}

export interface GestionAlertasDTO {
  porEstado: { estado: EstadoAlerta; cantidad: number }[];
  /** Alertas todavia en NUEVA: nadie las miro. */
  sinAtender: number;
  /** Minutos promedio desde que nace la alerta hasta que pasa a EN_REVISION. */
  minutosHastaRevision: number | null;
  /** Minutos promedio desde que nace hasta que se cierra o descarta. */
  minutosHastaCierre: number | null;
}

export interface PuntoCriticoTopDTO {
  id: number;
  latitudCentro: number;
  longitudCentro: number;
  cantidadReportes: number;
  nivel: number;
  /** Alerta consolidada del punto, si tiene: permite saltar al detalle. */
  alertaId: number | null;
}

export interface AnalisisResumenDTO {
  periodo: { desde: Date; hasta: Date };
  situacion: SituacionDTO;
  tendencia: DiaTendenciaDTO[];
  factores: FactoresDTO;
  ia: SaludIaDTO;
  gestion: GestionAlertasDTO;
  canales: { canal: Canal; cantidad: number }[];
  topPuntosCriticos: PuntoCriticoTopDTO[];
}
