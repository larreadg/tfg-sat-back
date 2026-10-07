import { EstadoAlerta, EstadoEvaluacionIa, EstadoPuntoCritico, Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { PuntajesConfig, ReglaEspecial, UmbralesNivel } from '../criticidad/criticidad.types';
import {
  AnalisisResumenDTO,
  DiaTendenciaDTO,
  FactoresDTO,
  GestionAlertasDTO,
  PromedioFactorDTO,
  SaludIaDTO,
  SituacionDTO,
} from './analisis.types';
import { DIAS_POR_DEFECTO, ResumenQuery } from './analisis.validation';

const MS_POR_DIA = 24 * 60 * 60 * 1000;
const ESTADOS_ALERTA_ACTIVA: EstadoAlerta[] = [EstadoAlerta.NUEVA, EstadoAlerta.EN_REVISION];
const ESTADOS_IA_ABIERTOS: EstadoEvaluacionIa[] = [
  EstadoEvaluacionIa.PENDIENTE,
  EstadoEvaluacionIa.PROCESANDO,
];

const ETIQUETA_FACTOR: Record<PromedioFactorDTO['factor'], string> = {
  f1: 'F1 · Reportes cercanos',
  f2: 'F2 · Aspecto del agua',
  f3: 'F3 · Síntomas y antigüedad',
  f4: 'F4 · Análisis de IA',
  f5: 'F5 · Malla de riesgo',
};

/**
 * Resumen del panel de analisis. Devuelve todo junto a proposito: son ocho
 * lecturas distintas de la misma ventana temporal y separarlas en endpoints
 * obligaria al front a coordinar ocho requests para pintar una sola pantalla.
 *
 * Convencion del periodo: `tendencia`, `factores`, `ia`, `gestion` y `canales`
 * se filtran por [desde, hasta]; `situacion` y `topPuntosCriticos` describen el
 * estado ACTUAL del sistema (backlog, alertas abiertas) y no se filtran: mezclar
 * ambas cosas haria que un rango viejo mostrara un backlog que ya no existe.
 *
 * OJO con las fechas en SQL crudo: los parametros `Date` contra columnas
 * `timestamp` (sin zona) se desplazan segun el timezone de la sesion de
 * Postgres. Por eso las consultas crudas reciben el ISO string casteado a
 * `::timestamp` (mismo criterio que guarda Prisma: UTC naive).
 */
export async function obtenerResumen(filtros: ResumenQuery): Promise<AnalisisResumenDTO> {
  const hasta = filtros.hasta ?? new Date();
  const desde = filtros.desde ?? new Date(hasta.getTime() - DIAS_POR_DEFECTO * MS_POR_DIA);
  const rango = { gte: desde, lte: hasta };

  const [situacion, tendencia, factores, ia, gestion, canales, topPuntosCriticos] = await Promise.all([
    obtenerSituacion(rango),
    obtenerTendencia(desde, hasta),
    obtenerFactores(rango),
    obtenerSaludIa(rango),
    obtenerGestionAlertas(rango),
    obtenerCanales(rango),
    obtenerTopPuntosCriticos(),
  ]);

  return { periodo: { desde, hasta }, situacion, tendencia, factores, ia, gestion, canales, topPuntosCriticos };
}

type RangoFechas = { gte: Date; lte: Date };

async function obtenerSituacion(rango: RangoFechas): Promise<SituacionDTO> {
  const ahora = new Date();

  const [reportes24h, reportes7d, reportesPeriodo, sinAnalizar, alertasActivas, puntosCriticosActivos] =
    await Promise.all([
      prisma.reporte.count({ where: { fechaCreacion: { gte: new Date(ahora.getTime() - MS_POR_DIA) } } }),
      prisma.reporte.count({ where: { fechaCreacion: { gte: new Date(ahora.getTime() - 7 * MS_POR_DIA) } } }),
      prisma.reporte.count({ where: { fechaCreacion: rango } }),
      // Backlog: sin evaluacion todavia, o con una que no cerro.
      prisma.reporte.count({
        where: {
          OR: [{ evaluacionIa: { is: null } }, { evaluacionIa: { estado: { in: ESTADOS_IA_ABIERTOS } } }],
        },
      }),
      prisma.alerta.groupBy({
        by: ['nivel'],
        where: { estado: { in: ESTADOS_ALERTA_ACTIVA } },
        _count: { _all: true },
      }),
      prisma.puntoCritico.count({ where: { estado: EstadoPuntoCritico.ACTIVO } }),
    ]);

  const alertasActivasPorNivel = alertasActivas
    .map((fila) => ({ nivel: fila.nivel, cantidad: fila._count._all }))
    .sort((a, b) => b.nivel - a.nivel);

  return {
    reportes24h,
    reportes7d,
    reportesPeriodo,
    sinAnalizar,
    alertasActivasPorNivel,
    alertasActivasTotal: alertasActivasPorNivel.reduce((total, fila) => total + fila.cantidad, 0),
    puntosCriticosActivos,
  };
}

/**
 * Serie diaria de reportes por nivel. El dia se corta en la zona horaria de la
 * sesion de Postgres (no en UTC): un reporte de las 22:00 locales tiene que
 * caer en su dia, no en el siguiente. Los dias sin reportes se completan aca.
 */
async function obtenerTendencia(desde: Date, hasta: Date): Promise<DiaTendenciaDTO[]> {
  const filas = await prisma.$queryRaw<
    { dia: Date; nivel0: number; nivel1: number; nivel2: number; nivel3: number; sinNivel: number }[]
  >`
    SELECT
      date_trunc('day', "fechaCreacion" AT TIME ZONE 'UTC' AT TIME ZONE current_setting('TimeZone')) AS dia,
      COUNT(*) FILTER (WHERE "nivelPreliminar" = 0)::int AS "nivel0",
      COUNT(*) FILTER (WHERE "nivelPreliminar" = 1)::int AS "nivel1",
      COUNT(*) FILTER (WHERE "nivelPreliminar" = 2)::int AS "nivel2",
      COUNT(*) FILTER (WHERE "nivelPreliminar" = 3)::int AS "nivel3",
      COUNT(*) FILTER (WHERE "nivelPreliminar" IS NULL)::int AS "sinNivel"
    FROM "Reporte"
    WHERE "fechaCreacion" >= ${desde.toISOString()}::timestamp
      AND "fechaCreacion" <= ${hasta.toISOString()}::timestamp
    GROUP BY dia
    ORDER BY dia ASC
  `;

  const porFecha = new Map(filas.map((f) => [aClaveDia(f.dia), f]));
  const dias: DiaTendenciaDTO[] = [];

  for (const clave of clavesDelRango(desde, hasta)) {
    const fila = porFecha.get(clave);
    const nivel0 = Number(fila?.nivel0 ?? 0);
    const nivel1 = Number(fila?.nivel1 ?? 0);
    const nivel2 = Number(fila?.nivel2 ?? 0);
    const nivel3 = Number(fila?.nivel3 ?? 0);
    const sinNivel = Number(fila?.sinNivel ?? 0);
    dias.push({
      fecha: clave,
      nivel0,
      nivel1,
      nivel2,
      nivel3,
      sinNivel,
      total: nivel0 + nivel1 + nivel2 + nivel3 + sinNivel,
    });
  }

  return dias;
}

async function obtenerFactores(rango: RangoFechas): Promise<FactoresDTO> {
  const whereDesglose: Prisma.DesgloseFactoresWhereInput = { reporte: { fechaCreacion: rango } };

  // La config se lee ANTES del resto: el conteo de reportes con nivel minimo
  // forzado necesita las reglas especiales de la version activa (antes eran dos
  // literales copiados del motor, que se desincronizaban en silencio).
  const config = await prisma.configuracionCriticidad.findFirst({
    where: { activa: true },
    select: { umbralesNivel: true, puntajes: true },
  });
  const puntajes = config?.puntajes as unknown as PuntajesConfig | undefined;

  const [agregado, disponibles, conBonus, sinAporteIa, criticidad, distribucion, conPisoNivel1] =
    await Promise.all([
      prisma.desgloseFactores.aggregate({
        where: whereDesglose,
        _avg: { f1: true, f2: true, f3: true, f4: true, f5: true },
        _count: { _all: true },
      }),
      Promise.all(
        (['f1', 'f2', 'f3', 'f4', 'f5'] as const).map((factor) =>
          prisma.desgloseFactores.count({ where: { ...whereDesglose, [factor]: { not: null } } }),
        ),
      ),
      prisma.desgloseFactores.count({ where: { ...whereDesglose, bonusVulnerabilidad: { gt: 0 } } }),
      prisma.desgloseFactores.count({ where: { ...whereDesglose, f4: null } }),
      prisma.reporte.aggregate({ where: { fechaCreacion: rango }, _avg: { criticidad: true } }),
      prisma.reporte.groupBy({
        by: ['nivelPreliminar'],
        where: { fechaCreacion: rango },
        _count: { _all: true },
      }),
      contarConPisoNivel1(rango, puntajes?.reglasEspeciales ?? []),
    ]);

  const promedios: PromedioFactorDTO[] = (['f1', 'f2', 'f3', 'f4', 'f5'] as const).map((factor, indice) => ({
    factor,
    etiqueta: ETIQUETA_FACTOR[factor],
    promedio: aNumero(agregado._avg[factor]),
    disponibleEn: disponibles[indice],
  }));

  return {
    reportesConDesglose: agregado._count._all,
    promedios,
    criticidadPromedio: aNumero(criticidad._avg.criticidad),
    conBonusVulnerabilidad: conBonus,
    conPisoNivel1,
    sinAporteIa,
    distribucionNivel: distribucion
      .map((fila) => ({ nivel: fila.nivelPreliminar ?? -1, cantidad: fila._count._all }))
      .sort((a, b) => a.nivel - b.nivel),
    umbrales: (config?.umbralesNivel as unknown as UmbralesNivel) ?? null,
  };
}

/**
 * Reportes que activaron alguna regla especial de NIVEL MINIMO. No se persiste como
 * flag, asi que se cuenta desde las respuestas usando las mismas reglas que aplico
 * el motor (las de la config activa), claveadas por codigo.
 *
 * Un reporte que activa dos de esas reglas se cuenta una sola vez (el `OR` es sobre
 * el reporte, no sobre la regla).
 */
async function contarConPisoNivel1(rango: RangoFechas, reglas: ReglaEspecial[]): Promise<number> {
  const deNivel = reglas.filter(
    (regla) => regla.efecto === 'nivelMinimo' && regla.opcionCodigos.length > 0,
  );
  if (deNivel.length === 0) {
    return 0;
  }

  return prisma.reporte.count({
    where: {
      fechaCreacion: rango,
      OR: deNivel.map((regla) => ({
        respuestas: {
          some: {
            pregunta: { codigo: regla.preguntaCodigo },
            opciones: { some: { preguntaOpcion: { codigo: { in: regla.opcionCodigos } } } },
          },
        },
      })),
    },
  });
}

async function obtenerSaludIa(rango: RangoFechas): Promise<SaludIaDTO> {
  const where: Prisma.EvaluacionIaWhereInput = { fechaCreacion: rango };

  const [porEstado, agregado, completadas, latencia] = await Promise.all([
    prisma.evaluacionIa.groupBy({ by: ['estado'], where, _count: { _all: true } }),
    prisma.evaluacionIa.aggregate({ where, _avg: { intentos: true }, _count: { _all: true } }),
    prisma.evaluacionIa.aggregate({
      where: { ...where, estado: EstadoEvaluacionIa.COMPLETADO },
      _avg: { riesgoScore: true },
    }),
    prisma.$queryRaw<{ segundos: number | null }[]>`
      SELECT AVG(EXTRACT(EPOCH FROM ("fechaActualizacion" - "fechaCreacion")))::float AS segundos
      FROM "EvaluacionIa"
      WHERE estado = 'COMPLETADO'
        AND "fechaCreacion" >= ${rango.gte.toISOString()}::timestamp
        AND "fechaCreacion" <= ${rango.lte.toISOString()}::timestamp
    `,
  ]);

  const conteos = porEstado.map((fila) => ({ estado: fila.estado, cantidad: fila._count._all }));

  return {
    porEstado: conteos,
    total: agregado._count._all,
    conError: conteos.find((c) => c.estado === EstadoEvaluacionIa.ERROR)?.cantidad ?? 0,
    intentosPromedio: agregado._avg.intentos,
    latenciaSegundos: latencia[0]?.segundos ?? null,
    riesgoScorePromedio: completadas._avg.riesgoScore,
  };
}

async function obtenerGestionAlertas(rango: RangoFechas): Promise<GestionAlertasDTO> {
  const [porEstado, sinAtender, tiempos] = await Promise.all([
    prisma.alerta.groupBy({ by: ['estado'], where: { fechaCreacion: rango }, _count: { _all: true } }),
    prisma.alerta.count({ where: { estado: EstadoAlerta.NUEVA } }),
    // Primer paso a revision y primer cierre de cada alerta: de ahi salen los
    // dos tiempos de gestion. Se mide contra `Alerta.fechaCreacion`, no contra
    // el cambio anterior, porque lo que importa es cuanto tardo en atenderse.
    prisma.$queryRaw<{ minutos_revision: number | null; minutos_cierre: number | null }[]>`
      WITH hitos AS (
        SELECT
          a.id,
          a."fechaCreacion" AS nacimiento,
          MIN(c."fechaCreacion") FILTER (WHERE c."estadoNuevo" = 'EN_REVISION') AS revision,
          MIN(c."fechaCreacion") FILTER (WHERE c."estadoNuevo" IN ('CERRADA', 'DESCARTADA')) AS cierre
        FROM "Alerta" a
        JOIN "CambioEstadoAlerta" c ON c."alertaId" = a.id
        WHERE a."fechaCreacion" >= ${rango.gte.toISOString()}::timestamp
          AND a."fechaCreacion" <= ${rango.lte.toISOString()}::timestamp
        GROUP BY a.id, a."fechaCreacion"
      )
      SELECT
        AVG(EXTRACT(EPOCH FROM (revision - nacimiento)) / 60)::float AS minutos_revision,
        AVG(EXTRACT(EPOCH FROM (cierre - nacimiento)) / 60)::float AS minutos_cierre
      FROM hitos
    `,
  ]);

  return {
    porEstado: porEstado.map((fila) => ({ estado: fila.estado, cantidad: fila._count._all })),
    sinAtender,
    minutosHastaRevision: tiempos[0]?.minutos_revision ?? null,
    minutosHastaCierre: tiempos[0]?.minutos_cierre ?? null,
  };
}

async function obtenerCanales(rango: RangoFechas) {
  const filas = await prisma.reporte.groupBy({
    by: ['canal'],
    where: { fechaCreacion: rango },
    _count: { _all: true },
  });
  return filas
    .map((fila) => ({ canal: fila.canal, cantidad: fila._count._all }))
    .sort((a, b) => b.cantidad - a.cantidad);
}

async function obtenerTopPuntosCriticos() {
  const puntos = await prisma.puntoCritico.findMany({
    where: { estado: EstadoPuntoCritico.ACTIVO },
    orderBy: [{ cantidadReportes: 'desc' }, { nivel: 'desc' }],
    take: 5,
    select: {
      id: true,
      latitudCentro: true,
      longitudCentro: true,
      cantidadReportes: true,
      nivel: true,
      alertas: { select: { id: true }, orderBy: { id: 'desc' }, take: 1 },
    },
  });

  return puntos.map((punto) => ({
    id: punto.id,
    latitudCentro: punto.latitudCentro,
    longitudCentro: punto.longitudCentro,
    cantidadReportes: punto.cantidadReportes,
    nivel: punto.nivel,
    alertaId: punto.alertas[0]?.id ?? null,
  }));
}

function aNumero(valor: Prisma.Decimal | number | null): number | null {
  return valor == null ? null : Number(valor);
}

/** `YYYY-MM-DD` de un dia ya cortado en hora local por Postgres. */
function aClaveDia(dia: Date): string {
  return dia.toISOString().slice(0, 10);
}

/** Todas las claves `YYYY-MM-DD` del rango, para completar los dias vacios. */
function clavesDelRango(desde: Date, hasta: Date): string[] {
  const claves: string[] = [];
  const cursor = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate());
  const fin = new Date(hasta.getFullYear(), hasta.getMonth(), hasta.getDate());

  while (cursor <= fin) {
    const mes = `${cursor.getMonth() + 1}`.padStart(2, '0');
    const dia = `${cursor.getDate()}`.padStart(2, '0');
    claves.push(`${cursor.getFullYear()}-${mes}-${dia}`);
    cursor.setDate(cursor.getDate() + 1);
  }

  return claves;
}
