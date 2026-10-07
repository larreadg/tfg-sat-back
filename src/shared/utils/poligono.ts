/**
 * Geometria de poligonos para el mapa de riesgo (F5). Funciones PURAS, sin DB:
 * el volumen de zonas es de decenas, asi que el calculo va en memoria y no hace
 * falta PostGIS.
 */

export interface Vertice {
  lat: number;
  lng: number;
}

export interface BoundingBox {
  bboxMinLat: number;
  bboxMaxLat: number;
  bboxMinLng: number;
  bboxMaxLng: number;
}

/** Minimo de vertices para que un poligono encierre area. */
export const MIN_VERTICES = 3;

/**
 * Rectangulo que envuelve al poligono. Se precalcula al guardar la zona para
 * poder descartarla con cuatro comparaciones antes de correr `puntoEnPoligono`,
 * que es O(vertices).
 */
export function calcularBoundingBox(poligono: Vertice[]): BoundingBox {
  const lats = poligono.map((vertice) => vertice.lat);
  const lngs = poligono.map((vertice) => vertice.lng);

  return {
    bboxMinLat: Math.min(...lats),
    bboxMaxLat: Math.max(...lats),
    bboxMinLng: Math.min(...lngs),
    bboxMaxLng: Math.max(...lngs),
  };
}

/** `true` si el punto cae dentro del rectangulo envolvente (descarte barato). */
export function puntoEnBoundingBox(lat: number, lng: number, bbox: BoundingBox): boolean {
  return (
    lat >= bbox.bboxMinLat &&
    lat <= bbox.bboxMaxLat &&
    lng >= bbox.bboxMinLng &&
    lng <= bbox.bboxMaxLng
  );
}

/**
 * Punto-en-poligono por ray casting: se tira un rayo horizontal hacia el este
 * desde el punto y se cuentan los lados que cruza. Impar = adentro.
 *
 * Funciona con poligonos concavos y con los que el analista dibuje en cualquier
 * sentido (horario o antihorario). El cierre es implicito: el ultimo vertice se
 * une con el primero, asi que el poligono NO debe repetir el primero al final.
 *
 * Sobre las coordenadas: se opera en grados planos, sin proyectar. Para zonas del
 * tamano de un barrio o una ciudad el error es despreciable; el caso que si
 * rompe es un poligono que cruce la antimeridiana (lng +180/-180), que en
 * Paraguay no existe.
 */
export function puntoEnPoligono(lat: number, lng: number, poligono: Vertice[]): boolean {
  if (poligono.length < MIN_VERTICES) {
    return false;
  }

  let dentro = false;

  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const { lat: latI, lng: lngI } = poligono[i];
    const { lat: latJ, lng: lngJ } = poligono[j];

    // El lado i-j cruza la horizontal del punto, y el cruce queda al este del
    // punto. El `!==` evita contar dos veces un vertice que toca el rayo justo.
    const cruzaLaHorizontal = latI > lat !== latJ > lat;
    if (!cruzaLaHorizontal) {
      continue;
    }

    const lngDelCruce = ((lngJ - lngI) * (lat - latI)) / (latJ - latI) + lngI;
    if (lng < lngDelCruce) {
      dentro = !dentro;
    }
  }

  return dentro;
}

/**
 * Lee un `poligono` guardado como Json. Devuelve `[]` si el valor no tiene la
 * forma esperada, para que una fila corrupta no tire el calculo de criticidad de
 * un reporte (un poligono vacio simplemente no contiene a nadie).
 */
export function parsearPoligono(valor: unknown): Vertice[] {
  if (!Array.isArray(valor)) {
    return [];
  }

  const vertices: Vertice[] = [];
  for (const item of valor) {
    if (typeof item !== 'object' || item === null) {
      return [];
    }
    const { lat, lng } = item as Record<string, unknown>;
    if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return [];
    }
    vertices.push({ lat, lng });
  }

  return vertices;
}
