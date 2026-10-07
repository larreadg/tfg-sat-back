import { Canal, EstadoAlerta, EstadoPuntoCritico } from '@prisma/client';
import { SeguimientoResumenDTO } from './alertas.seguimiento.types';

/** Datos minimos de ubicacion/severidad para crear o deduplicar una alerta. */
export interface UbicacionAlerta {
  latitud: number;
  longitud: number;
  nivel: number;
  motivo: string;
  reporteId?: number;
  puntoCriticoId?: number;
  /**
   * Datos de contexto que solo existen para enriquecer el payload de los webhooks
   * (`modules/webhooks`). Los pone el llamador, que ya tiene el reporte/punto en
   * memoria, para que el despachador no tenga que volver a consultar la DB.
   * Opcionales: si faltan, el aviso sale igual con menos detalle.
   */
  reporteCodigoPublico?: string | null;
  ubicacionLegible?: string | null;
}

export interface AlertaListItemDTO {
  id: number;
  nivel: number;
  estado: EstadoAlerta;
  motivo: string;
  fechaCreacion: Date;
  fechaActualizacion: Date;
  reporte: { id: number; codigoPublico: string; latitud: number; longitud: number } | null;
  puntoCritico: {
    id: number;
    latitudCentro: number;
    longitudCentro: number;
    cantidadReportes: number;
  } | null;
}

export interface AlertasListadoDTO {
  items: AlertaListItemDTO[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** Origen de la alerta: un reporte individual XOR un punto critico (ERS §4.4). */
export type OrigenAlerta = 'REPORTE' | 'PUNTO_CRITICO';

/**
 * Un reporte que cae dentro del area y la ventana de la alerta. `orden` es el
 * numero de pin en el mapa (1..N por fecha ascendente): es estable entre
 * llamadas y es la unica forma de identificar el reporte en el mapa sin PII.
 */
export interface AlertaReporteDTO {
  orden: number;
  id: number;
  codigoPublico: string;
  canal: Canal;
  fecha: Date;
  latitud: number;
  longitud: number;
  nivelPreliminar: number | null;
  criticidad: number | null;
  estadoAnalisis: string;
  riesgoScore: number | null;
  /** Resumen de la IA (sin PII); null si el analisis no quedo COMPLETADO. */
  resumenIa: string | null;
  tieneFotos: boolean;
  /** Distancia al centro de la alerta, en metros enteros. */
  distanciaMetros: number;
  /** `true` en el reporte que origino la alerta (si el origen es un reporte). */
  esOrigen: boolean;
}

export interface AlertaPuntoCriticoDetalleDTO {
  id: number;
  latitudCentro: number;
  longitudCentro: number;
  radioMetros: number;
  cantidadReportes: number;
  nivel: number;
  estado: EstadoPuntoCritico;
  ventanaInicio: Date;
  ventanaFin: Date;
}

/**
 * Detalle de una alerta con los reportes que la componen (los que caen en
 * `centro` + `radioMetros` entre `ventanaInicio` y `ventanaFin`). Se devuelve
 * el area y la ventana explicitas para que el panel pueda explicar de donde
 * sale el grupo, en vez de que el front las reconstruya.
 */
export interface AlertaDetalleDTO {
  id: number;
  nivel: number;
  estado: EstadoAlerta;
  motivo: string;
  fechaCreacion: Date;
  fechaActualizacion: Date;
  /** Contadores de las pestañas de seguimiento del modal (ver `alertas.seguimiento.types.ts`). */
  seguimiento: SeguimientoResumenDTO;
  /** `null` solo en una alerta sin origen (no deberia ocurrir: ambas FK cascadean). */
  origen: OrigenAlerta | null;
  centro: { latitud: number; longitud: number } | null;
  radioMetros: number;
  ventanaInicio: Date | null;
  ventanaFin: Date | null;
  reporte: { id: number; codigoPublico: string; latitud: number; longitud: number } | null;
  puntoCritico: AlertaPuntoCriticoDetalleDTO | null;
  reportes: AlertaReporteDTO[];
}
