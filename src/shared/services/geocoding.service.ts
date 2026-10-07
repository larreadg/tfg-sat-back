import axios from 'axios';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';

/**
 * Geocodificacion inversa: de (latitud, longitud) a ubicacion legible
 * (departamento, ciudad/distrito, barrio, calle). Se usa para enriquecer los
 * reportes ciudadanos, que solo llegan con coordenadas.
 *
 * Proveedor por defecto: Nominatim (OpenStreetMap), gratuito y sin API key. Su
 * politica de uso exige un User-Agent identificable y limita a 1 req/s, por eso
 * todo pasa por `GeocodificacionCache` (clave = coordenada redondeada a 4
 * decimales, ~11 m). `GEOCODING_URL` permite apuntar a otra instancia
 * (self-hosted o un mirror) sin tocar codigo.
 *
 * Nada de esto es critico: si el proveedor falla o tarda, se devuelve null y el
 * reporte queda con las coordenadas nomas. Nunca se propaga el error.
 */
export interface UbicacionResuelta {
  pais: string | null;
  departamento: string | null;
  distrito: string | null;
  barrio: string | null;
  calle: string | null;
  direccion: string | null;
  fuente: string;
}

/** Campos de direccion que devuelve Nominatim con `addressdetails=1`. */
interface NominatimAddress {
  country?: string;
  state?: string;
  region?: string;
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  county?: string;
  city_district?: string;
  suburb?: string;
  neighbourhood?: string;
  quarter?: string;
  residential?: string;
  road?: string;
  pedestrian?: string;
  house_number?: string;
}

interface NominatimResponse {
  display_name?: string;
  address?: NominatimAddress;
  error?: string;
}

/** Precision de la clave de cache: 4 decimales ~ 11 m. */
const DECIMALES_CLAVE = 4;

function construirClave(latitud: number, longitud: number): string {
  return `${latitud.toFixed(DECIMALES_CLAVE)},${longitud.toFixed(DECIMALES_CLAVE)}`;
}

/** Normaliza: string vacio o solo espacios cuenta como ausente. */
function limpiar(valor: string | undefined): string | null {
  const texto = valor?.trim();
  return texto ? texto : null;
}

/** Primer valor no vacio entre varios alias que usa OSM para el mismo concepto. */
function primero(...valores: (string | undefined)[]): string | null {
  for (const valor of valores) {
    const limpio = limpiar(valor);
    if (limpio) {
      return limpio;
    }
  }
  return null;
}

/**
 * Mapea la direccion de Nominatim al vocabulario administrativo paraguayo:
 * `state` es el departamento, `city/town/village` el distrito (ciudad) y
 * `neighbourhood/suburb` el barrio. Se listan alias porque el detalle mapeado en
 * OSM varia mucho entre zonas urbanas y rurales.
 */
function mapearNominatim(data: NominatimResponse): UbicacionResuelta {
  const address = data.address ?? {};
  const calle = primero(address.road, address.pedestrian, address.residential);
  const numero = limpiar(address.house_number);

  return {
    pais: limpiar(address.country),
    departamento: primero(address.state, address.region),
    distrito: primero(address.city, address.town, address.village, address.municipality, address.county),
    barrio: primero(address.neighbourhood, address.suburb, address.quarter, address.city_district),
    calle: calle && numero ? `${calle} ${numero}` : calle,
    direccion: limpiar(data.display_name),
    fuente: 'nominatim',
  };
}

async function consultarProveedor(latitud: number, longitud: number): Promise<UbicacionResuelta | null> {
  const { data } = await axios.get<NominatimResponse>(env.geocodingUrl, {
    params: {
      lat: latitud,
      lon: longitud,
      format: 'jsonv2',
      addressdetails: 1,
      // zoom 18 = nivel calle/edificio, el maximo detalle util para un reporte.
      zoom: 18,
    },
    headers: {
      // Requisito de la politica de uso de Nominatim: identificar la aplicacion.
      'User-Agent': env.geocodingUserAgent,
      'Accept-Language': env.geocodingIdioma,
    },
    timeout: env.geocodingTimeoutMs,
  });

  if (!data || data.error) {
    return null;
  }

  const ubicacion = mapearNominatim(data);
  const tieneAlgo =
    ubicacion.pais || ubicacion.departamento || ubicacion.distrito || ubicacion.barrio || ubicacion.calle;

  return tieneAlgo ? ubicacion : null;
}

/**
 * Resuelve una coordenada a ubicacion legible. Primero mira el cache; si no hay
 * hit, consulta al proveedor y persiste el resultado. Devuelve null si la
 * geocodificacion esta apagada, el proveedor falla o la coordenada no resuelve.
 */
export async function resolverUbicacion(
  latitud: number,
  longitud: number,
): Promise<UbicacionResuelta | null> {
  if (!env.geocodingEnabled) {
    return null;
  }

  const clave = construirClave(latitud, longitud);

  const cacheado = await prisma.geocodificacionCache.findUnique({ where: { clave } });
  if (cacheado) {
    return {
      pais: cacheado.pais,
      departamento: cacheado.departamento,
      distrito: cacheado.distrito,
      barrio: cacheado.barrio,
      calle: cacheado.calle,
      direccion: cacheado.direccion,
      fuente: cacheado.fuente,
    };
  }

  let ubicacion: UbicacionResuelta | null = null;
  try {
    ubicacion = await consultarProveedor(latitud, longitud);
  } catch (error) {
    console.error('[geocoding] fallo la geocodificacion inversa', {
      latitud,
      longitud,
      mensaje: error instanceof Error ? error.message : String(error),
    });
    return null;
  }

  if (!ubicacion) {
    return null;
  }

  // Solo se cachean los hits: un miss puede ser un bache temporal del proveedor y
  // no queremos congelarlo. `upsert` porque dos reportes simultaneos de la misma
  // cuadra pueden llegar juntos.
  await prisma.geocodificacionCache
    .upsert({
      where: { clave },
      update: {},
      create: {
        clave,
        latitud,
        longitud,
        pais: ubicacion.pais,
        departamento: ubicacion.departamento,
        distrito: ubicacion.distrito,
        barrio: ubicacion.barrio,
        calle: ubicacion.calle,
        direccion: ubicacion.direccion,
        fuente: ubicacion.fuente,
      },
    })
    .catch((error: unknown) => {
      console.error('[geocoding] no se pudo cachear la ubicacion', {
        clave,
        mensaje: error instanceof Error ? error.message : String(error),
      });
    });

  return ubicacion;
}

/**
 * Enriquece un reporte con su ubicacion legible. Idempotente: si el reporte ya
 * fue geocodificado (`geoFecha` seteada) no vuelve a consultar, asi se puede
 * invocar tanto post-envio como en el recalculo post-IA (segunda chance si el
 * proveedor estaba caido cuando entro el reporte). Nunca lanza.
 */
export async function enriquecerUbicacionReporte(reporteId: number): Promise<void> {
  try {
    const reporte = await prisma.reporte.findUnique({
      where: { id: reporteId },
      select: { latitud: true, longitud: true, geoFecha: true },
    });

    if (!reporte || reporte.geoFecha) {
      return;
    }

    const ubicacion = await resolverUbicacion(reporte.latitud, reporte.longitud);
    if (!ubicacion) {
      return;
    }

    await prisma.reporte.update({
      where: { id: reporteId },
      data: {
        pais: ubicacion.pais,
        departamento: ubicacion.departamento,
        distrito: ubicacion.distrito,
        barrio: ubicacion.barrio,
        calle: ubicacion.calle,
        direccion: ubicacion.direccion,
        geoFuente: ubicacion.fuente,
        geoFecha: new Date(),
      },
    });
  } catch (error) {
    console.error('[geocoding] no se pudo enriquecer la ubicacion del reporte', {
      reporteId,
      mensaje: error instanceof Error ? error.message : String(error),
    });
  }
}
