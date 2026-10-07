import { EstadoPuntoCritico, Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { MapaQuery } from './mapa.validation';
import {
  GeoJsonFeature,
  MapaGeoJson,
  PropiedadesPuntoCritico,
  PropiedadesReporte,
} from './mapa.types';

function aNumero(valor: Prisma.Decimal | null): number | null {
  return valor == null ? null : Number(valor);
}

function construirWhereReportes(filtros: MapaQuery): Prisma.ReporteWhereInput {
  const where: Prisma.ReporteWhereInput = {};

  if (filtros.canal) {
    where.canal = filtros.canal;
  }
  if (filtros.nivel !== undefined) {
    where.nivelPreliminar = filtros.nivel;
  }
  if (filtros.desde || filtros.hasta) {
    where.fechaCreacion = { gte: filtros.desde, lte: filtros.hasta };
  }
  if (filtros.estado) {
    where.evaluacionIa = { estado: filtros.estado };
  }
  if (filtros.bbox) {
    where.latitud = { gte: filtros.bbox.minLat, lte: filtros.bbox.maxLat };
    where.longitud = { gte: filtros.bbox.minLng, lte: filtros.bbox.maxLng };
  }

  return where;
}

function construirWherePuntos(filtros: MapaQuery): Prisma.PuntoCriticoWhereInput {
  // Los puntos criticos vigentes son los ACTIVO. Se aplican los mismos filtros
  // que a los reportes en lo que tiene sentido para un cluster: nivel, bbox y
  // ventana temporal (solapamiento con [desde, hasta]). `canal` y `estado` de IA
  // son atributos por reporte, no del punto: no aplican aca (por eso el mapa los
  // usa solo para la capa de reportes).
  const where: Prisma.PuntoCriticoWhereInput = { estado: EstadoPuntoCritico.ACTIVO };

  if (filtros.nivel !== undefined) {
    where.nivel = filtros.nivel;
  }
  if (filtros.bbox) {
    where.latitudCentro = { gte: filtros.bbox.minLat, lte: filtros.bbox.maxLat };
    where.longitudCentro = { gte: filtros.bbox.minLng, lte: filtros.bbox.maxLng };
  }
  // Solapamiento de la ventana del punto con el rango pedido: fin >= desde y inicio <= hasta.
  if (filtros.desde) {
    where.ventanaFin = { gte: filtros.desde };
  }
  if (filtros.hasta) {
    where.ventanaInicio = { lte: filtros.hasta };
  }

  return where;
}

/**
 * FeatureCollection GeoJSON (RFC 7946) con reportes y puntos criticos para el mapa
 * admin (ERS §8, §10.2). Cada feature se distingue por `properties.tipo`. La malla
 * de riesgo (F5) queda fuera del MVP (Fase H). Sin PII.
 */
export async function obtenerMapa(filtros: MapaQuery): Promise<MapaGeoJson> {
  const [reportes, puntos] = await prisma.$transaction([
    prisma.reporte.findMany({
      where: construirWhereReportes(filtros),
      orderBy: { fechaCreacion: 'desc' },
      select: {
        id: true,
        codigoPublico: true,
        canal: true,
        fechaCreacion: true,
        latitud: true,
        longitud: true,
        nivelPreliminar: true,
        criticidad: true,
        evaluacionIa: { select: { estado: true } },
      },
    }),
    prisma.puntoCritico.findMany({ where: construirWherePuntos(filtros) }),
  ]);

  const featuresReportes: GeoJsonFeature<PropiedadesReporte>[] = reportes.map((r) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [r.longitud, r.latitud] },
    properties: {
      tipo: 'reporte',
      id: r.id,
      codigoPublico: r.codigoPublico,
      canal: r.canal,
      fecha: r.fechaCreacion,
      nivelPreliminar: r.nivelPreliminar,
      criticidad: aNumero(r.criticidad),
      estadoAnalisis: r.evaluacionIa?.estado ?? 'PENDIENTE',
    },
  }));

  const featuresPuntos: GeoJsonFeature<PropiedadesPuntoCritico>[] = puntos.map((p) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [p.longitudCentro, p.latitudCentro] },
    properties: {
      tipo: 'punto_critico',
      id: p.id,
      nivel: p.nivel,
      cantidadReportes: p.cantidadReportes,
      radioMetros: p.radioMetros,
      estado: p.estado,
    },
  }));

  return {
    type: 'FeatureCollection',
    features: [...featuresReportes, ...featuresPuntos],
  };
}
