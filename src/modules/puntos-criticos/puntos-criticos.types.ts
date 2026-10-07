import { EstadoPuntoCritico } from '@prisma/client';

export interface PuntoCriticoListItemDTO {
  id: number;
  latitudCentro: number;
  longitudCentro: number;
  radioMetros: number;
  cantidadReportes: number;
  nivel: number;
  estado: EstadoPuntoCritico;
  ventanaInicio: Date;
  ventanaFin: Date;
  fechaCreacion: Date;
  fechaActualizacion: Date;
}

export interface PuntosCriticosListadoDTO {
  items: PuntoCriticoListItemDTO[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** Fila cruda del grupo de reportes cercanos (consulta Haversine). */
export interface ReporteEnGrupo {
  id: number;
  latitud: number;
  longitud: number;
  nivel: number | null;
  fecha: Date;
}

/** Fila cruda del punto critico ACTIVO mas cercano (consulta Haversine). */
export interface PuntoCercano {
  id: number;
  nivel: number;
  cantidad: number;
  lat: number;
  lng: number;
  inicio: Date;
  fin: Date;
}
