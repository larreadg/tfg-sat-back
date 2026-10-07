import { prisma } from '../config/prisma';
import { enriquecerUbicacionReporte } from '../shared/services/geocoding.service';

/**
 * Backfill de la ubicacion legible para reportes anteriores a la
 * geocodificacion inversa (o para los que el proveedor no resolvio en su
 * momento). Procesa de a uno y con pausa entre llamadas: la politica de uso de
 * Nominatim publico limita a 1 req/s. Los hits de cache no consumen cuota, pero
 * la pausa se aplica igual por simplicidad.
 *
 * Uso: npx ts-node --transpile-only src/scripts/backfill-geocoding.ts [limite]
 */
const PAUSA_MS = 1100;

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const limite = Number(process.argv[2]) || undefined;

  const pendientes = await prisma.reporte.findMany({
    where: { geoFecha: null },
    select: { id: true },
    orderBy: { id: 'asc' },
    take: limite,
  });

  console.log(`[backfill] reportes sin ubicacion resuelta: ${pendientes.length}`);

  let resueltos = 0;
  for (const [indice, reporte] of pendientes.entries()) {
    await enriquecerUbicacionReporte(reporte.id);

    const actualizado = await prisma.reporte.findUnique({
      where: { id: reporte.id },
      select: { geoFecha: true, departamento: true, distrito: true, barrio: true },
    });

    if (actualizado?.geoFecha) {
      resueltos += 1;
      console.log(
        `[backfill] reporte ${reporte.id}: ${[actualizado.barrio, actualizado.distrito, actualizado.departamento]
          .filter(Boolean)
          .join(', ')}`,
      );
    } else {
      console.log(`[backfill] reporte ${reporte.id}: sin resolucion`);
    }

    if (indice < pendientes.length - 1) {
      await esperar(PAUSA_MS);
    }
  }

  console.log(`[backfill] listo: ${resueltos}/${pendientes.length} resueltos`);
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error('[backfill] fallo', error);
  await prisma.$disconnect();
  process.exit(1);
});
