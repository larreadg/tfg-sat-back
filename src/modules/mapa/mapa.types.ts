import { Canal, EstadoPuntoCritico } from '@prisma/client';

/** GeoJSON minimo (RFC 7946): coordenadas en orden [longitud, latitud]. */
export interface GeoJsonPoint {
  type: 'Point';
  coordinates: [number, number];
}

export interface GeoJsonFeature<P> {
  type: 'Feature';
  geometry: GeoJsonPoint;
  properties: P;
}

export interface GeoJsonFeatureCollection<P> {
  type: 'FeatureCollection';
  features: GeoJsonFeature<P>[];
}

/** Propiedades de un reporte en el mapa. Sin PII (no incluye telefono). */
export interface PropiedadesReporte {
  tipo: 'reporte';
  id: number;
  codigoPublico: string;
  canal: Canal;
  fecha: Date;
  nivelPreliminar: number | null;
  criticidad: number | null;
  estadoAnalisis: string;
}

export interface PropiedadesPuntoCritico {
  tipo: 'punto_critico';
  id: number;
  nivel: number;
  cantidadReportes: number;
  radioMetros: number;
  estado: EstadoPuntoCritico;
}

export type PropiedadesMapa = PropiedadesReporte | PropiedadesPuntoCritico;

export type MapaGeoJson = GeoJsonFeatureCollection<PropiedadesMapa>;
