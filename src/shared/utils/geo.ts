const RADIO_TIERRA_M = 6371000;

function radianes(grados: number): number {
  return (grados * Math.PI) / 180;
}

/**
 * Distancia Haversine en metros entre dos coordenadas (ERS §4.6). Misma formula
 * que la consulta SQL de F1/puntos criticos, para usarla en memoria cuando el
 * conjunto a comparar ya esta acotado (p. ej. alertas activas en la ventana).
 */
export function distanciaHaversineMetros(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const dLat = radianes(lat2 - lat1);
  const dLng = radianes(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radianes(lat1)) * Math.cos(radianes(lat2)) * Math.sin(dLng / 2) ** 2;
  return RADIO_TIERRA_M * 2 * Math.asin(Math.sqrt(a));
}
