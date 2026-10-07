import { prisma } from '../config/prisma';
import { recalcularCriticidad } from '../modules/criticidad/criticidad.service';
import { conContextoAislado } from '../modules/auditoria/auditoria.contexto';

/**
 * Recalcula la criticidad de reportes ya existentes con la configuracion ACTIVA.
 *
 * Cuando usarlo: despues de crear una version de configuracion, o de migrar el
 * formato de `puntajes`, para ver el efecto sobre el historico. No corre solo a
 * proposito — la criticidad de un reporte es su foto al momento de evaluarlo, y
 * `DesgloseFactores.configId` registra con que version se calculo.
 *
 * `--dry-run` no escribe: solo muestra el antes y el despues, que es lo que
 * conviene para comparar dos versiones de configuracion.
 *
 * Uso:
 *   npm run criticidad:recalcular -- --dry-run
 *   npm run criticidad:recalcular -- --id=17
 *   npm run criticidad:recalcular
 */

interface Foto {
  f1: string;
  f2: string;
  f3: string;
  f4: string;
  f5: string;
  bonus: string;
  criticidad: string;
  nivel: string;
}

function argumento(nombre: string): string | undefined {
  const prefijo = `--${nombre}=`;
  const encontrado = process.argv.find((arg) => arg.startsWith(prefijo));
  return encontrado?.slice(prefijo.length);
}

async function fotografiar(ids: number[]): Promise<Map<number, Foto>> {
  const reportes = await prisma.reporte.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      criticidad: true,
      nivelPreliminar: true,
      desgloseFactores: {
        select: { f1: true, f2: true, f3: true, f4: true, f5: true, bonusVulnerabilidad: true },
      },
    },
  });

  return new Map(
    reportes.map((reporte) => [
      reporte.id,
      {
        f1: String(reporte.desgloseFactores?.f1 ?? '-'),
        f2: String(reporte.desgloseFactores?.f2 ?? '-'),
        f3: String(reporte.desgloseFactores?.f3 ?? '-'),
        f4: String(reporte.desgloseFactores?.f4 ?? '-'),
        f5: String(reporte.desgloseFactores?.f5 ?? '-'),
        bonus: String(reporte.desgloseFactores?.bonusVulnerabilidad ?? '-'),
        criticidad: String(reporte.criticidad ?? '-'),
        nivel: String(reporte.nivelPreliminar ?? '-'),
      },
    ]),
  );
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const idPedido = argumento('id');

  const where = idPedido ? { id: Number(idPedido) } : {};
  const ids = (await prisma.reporte.findMany({ where, select: { id: true }, orderBy: { id: 'asc' } })).map(
    (reporte) => reporte.id,
  );

  if (ids.length === 0) {
    console.log('No hay reportes para recalcular.');
    return;
  }

  const antes = await fotografiar(ids);

  for (const id of ids) {
    await recalcularCriticidad(id);
  }

  const despues = await fotografiar(ids);

  const filas = ids.map((id) => {
    const a = antes.get(id);
    const d = despues.get(id);
    const cambio =
      a?.criticidad !== d?.criticidad || a?.f2 !== d?.f2 || a?.f3 !== d?.f3 || a?.bonus !== d?.bonus;
    return {
      reporte: id,
      // F1 se muestra porque es el factor que cambia solo con el paso del tiempo:
      // cuenta reportes cercanos dentro de `ventanaDias` contados desde HOY, asi que
      // un reporte viejo va perdiendo vecinos. No es una regresion del motor.
      f1: a?.f1 === d?.f1 ? a?.f1 : `${a?.f1} -> ${d?.f1}`,
      f2: a?.f2 === d?.f2 ? a?.f2 : `${a?.f2} -> ${d?.f2}`,
      f3: a?.f3 === d?.f3 ? a?.f3 : `${a?.f3} -> ${d?.f3}`,
      f4: a?.f4 === d?.f4 ? a?.f4 : `${a?.f4} -> ${d?.f4}`,
      bonus: a?.bonus === d?.bonus ? a?.bonus : `${a?.bonus} -> ${d?.bonus}`,
      criticidad: a?.criticidad === d?.criticidad ? a?.criticidad : `${a?.criticidad} -> ${d?.criticidad}`,
      nivel: a?.nivel === d?.nivel ? a?.nivel : `${a?.nivel} -> ${d?.nivel}`,
      cambio: cambio ? 'SI' : 'no',
    };
  });

  console.table(filas);
  console.log(`${filas.filter((fila) => fila.cambio === 'SI').length} de ${filas.length} reporte(s) cambiaron.`);

  if (dryRun) {
    // El recalculo ya escribio; en dry-run se revierte dejando los valores previos.
    for (const id of ids) {
      const a = antes.get(id);
      if (!a) {
        continue;
      }
      await prisma.reporte.update({
        where: { id },
        data: {
          criticidad: a.criticidad === '-' ? null : a.criticidad,
          nivelPreliminar: a.nivel === '-' ? null : Number(a.nivel),
        },
      });
      await prisma.desgloseFactores.updateMany({
        where: { reporteId: id },
        data: {
          f1: a.f1 === '-' ? null : a.f1,
          f2: a.f2 === '-' ? null : a.f2,
          f3: a.f3 === '-' ? null : a.f3,
          f4: a.f4 === '-' ? null : a.f4,
          f5: a.f5 === '-' ? null : a.f5,
          bonusVulnerabilidad: a.bonus === '-' ? 0 : a.bonus,
        },
      });
    }
    console.log('--dry-run: los valores previos quedaron restaurados.');
  }
}

// En su propio contexto de auditoria: los recalculos que cambien de nivel quedan
// en la bitacora como actor SISTEMA, y compartir `requestId` permite verlos en el
// panel como una sola corrida y no como cambios espontaneos sueltos.
conContextoAislado(main)
  .catch((error) => {
    console.error('Error recalculando la criticidad.');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
