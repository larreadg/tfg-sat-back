import { ConfiguracionCriticidad, TipoPregunta } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { registrarAuditoria } from '../auditoria/auditoria.registro';
import { puntoEnBoundingBox, puntoEnPoligono } from '../../shared/utils/poligono';
import { PUNTAJE_F5_POR_CRITICIDAD, zonasActivasParaF5 } from '../zonas-riesgo/zonas-riesgo.service';
import {
  combinarFactores,
  evaluarReglas,
  evaluarReglasEspeciales,
  type MapaRespuestas,
} from './criticidad.engine';
import {
  Factores,
  PesosFactores,
  PuntajesConfig,
  ReporteParaCriticidad,
  RespuestaCriticidad,
  TablaF1,
  UmbralesNivel,
} from './criticidad.types';

// Este modulo ya NO conoce ninguna pregunta del cuestionario: que pregunta
// alimenta que factor, con que puntajes, y que dispara RN-11/RN-12 son datos de
// `ConfiguracionCriticidad.puntajes`, clavados al `codigo` de cada pregunta y
// opcion. Agregar una pregunta puntuada es cargar una regla en el panel.

/**
 * Codigos de pregunta de los que depende la configuracion ACTIVA del motor: los
 * que alguna regla puntua, mas los de RN-11 y RN-12.
 *
 * Lo consume el modulo de encuestas para (a) marcar esas preguntas en el detalle y
 * (b) impedir que se active una version del cuestionario que no las tenga. Vive acá
 * porque es el motor el que sabe qué necesita.
 */
export async function codigosExigidosPorConfigActiva(): Promise<Set<string>> {
  const config = await prisma.configuracionCriticidad.findFirst({
    where: { activa: true },
    select: { puntajes: true },
  });

  const puntajes = config?.puntajes as unknown as PuntajesConfig | undefined;
  if (!puntajes) {
    return new Set();
  }

  const codigos = new Set<string>();
  for (const regla of puntajes.reglas ?? []) {
    codigos.add(regla.preguntaCodigo);
  }
  for (const regla of puntajes.reglasEspeciales ?? []) {
    codigos.add(regla.preguntaCodigo);
  }
  return codigos;
}

/**
 * Recalcula y persiste la criticidad de un reporte (ERS §5). Idempotente: puede
 * llamarse post-envio (sin F4, IA pendiente) y de nuevo post-IA (con F4). Nunca
 * lanza: si algo falla (p. ej. no hay config activa), loguea y sale, para no
 * romper el flujo del ciudadano ni el job de IA.
 */
export async function recalcularCriticidad(reporteId: number): Promise<void> {
  try {
    const config = await prisma.configuracionCriticidad.findFirst({ where: { activa: true } });
    if (!config) {
      console.warn(`[criticidad] No hay ConfiguracionCriticidad activa; se omite el reporte ${reporteId}.`);
      return;
    }

    const reporte = await cargarReporte(reporteId);
    if (!reporte) {
      console.warn(`[criticidad] Reporte ${reporteId} inexistente; se omite.`);
      return;
    }

    const puntajes = config.puntajes as unknown as PuntajesConfig;
    const pesos = config.pesos as unknown as PesosFactores;
    const umbrales = config.umbralesNivel as unknown as UmbralesNivel;

    const respuestasPorCodigo = mapaRespuestas(reporte.respuestas);

    // F2/F3/F5 salen de las reglas; F1 (densidad) y F4 (IA) no vienen del
    // cuestionario y conservan su calculo propio.
    // F5 ya NO sale de `evaluarReglas`: viene del mapa de riesgo (ver `calcularF5`).
    const { f2, f3 } = evaluarReglas(respuestasPorCodigo, puntajes);

    const factores: Factores = {
      f1: await calcularF1(reporte, config, puntajes.f1),
      f2,
      f3,
      f4: calcularF4(reporte.riesgoScoreIa, puntajes.f4.divisor),
      f5: await calcularF5(reporte.latitud, reporte.longitud),
    };

    // Reglas especiales (nivel minimo / suma a la criticidad). El monto sale de la
    // regla, ya no de la columna `bonusVulnerable`.
    const efectos = evaluarReglasEspeciales(respuestasPorCodigo, puntajes.reglasEspeciales);

    const resultado = combinarFactores({ factores, pesos, umbrales, efectos });

    const previo = { criticidad: reporte.criticidadPrevia, nivel: reporte.nivelPrevio };

    await persistir(reporteId, config.id, resultado);

    // Solo se audita cuando el NIVEL cambia. El recalculo corre dos veces por cada
    // reporte (post-envio y post-IA) y casi siempre confirma el mismo numero:
    // anotar cada corrida convertiria la bitacora en un log de debug. Lo que
    // importa es el salto de nivel, porque es lo que dispara (o no) una alerta.
    if (resultado.nivel !== previo.nivel) {
      registrarAuditoria({
        accion: 'CRITICIDAD_RECALCULAR',
        entidadId: reporteId,
        descripcion: `La criticidad del reporte paso de nivel ${previo.nivel ?? 'sin calcular'} a nivel ${resultado.nivel}`,
        actor: { tipo: 'SISTEMA', etiqueta: 'pipeline-criticidad' },
        datosPrevios: previo,
        datosNuevos: { criticidad: resultado.criticidad, nivel: resultado.nivel },
        // Los cinco factores: es el desglose que explica el numero. Ya se guarda en
        // `DesgloseFactores`, pero ahi queda solo el ULTIMO calculo; aca queda el
        // de cada cambio.
        metadatos: { factores: resultado.factores, configId: config.id },
      });
    }
  } catch (err) {
    console.error(`[criticidad] Error recalculando el reporte ${reporteId}`, err);
  }
}

async function cargarReporte(reporteId: number): Promise<ReporteParaCriticidad | null> {
  const reporte = await prisma.reporte.findUnique({
    where: { id: reporteId },
    include: {
      respuestas: {
        include: {
          pregunta: true,
          opciones: { include: { preguntaOpcion: true } },
        },
      },
      evaluacionIa: { select: { estado: true, riesgoScore: true } },
    },
  });

  if (!reporte) {
    return null;
  }

  const respuestas: RespuestaCriticidad[] = reporte.respuestas
    .filter((r) => r.pregunta.tipo !== TipoPregunta.FOTO)
    .map((r) => ({
      preguntaCodigo: r.pregunta.codigo,
      opcionCodigos: r.opciones
        .map((o) => o.preguntaOpcion.codigo)
        .filter((codigo): codigo is string => codigo !== null),
    }));

  // F4 solo si la IA quedo COMPLETADO con un score (ERS §5.2): si esta PENDIENTE,
  // PROCESANDO o ERROR, F4 no esta disponible y se renormaliza.
  const riesgoScoreIa =
    reporte.evaluacionIa?.estado === 'COMPLETADO' ? reporte.evaluacionIa.riesgoScore ?? null : null;

  return {
    reporteId: reporte.id,
    canal: reporte.canal,
    latitud: reporte.latitud,
    longitud: reporte.longitud,
    respuestas,
    riesgoScoreIa,
    // Lo que habia antes de este recalculo. Solo para auditar el cambio.
    criticidadPrevia: reporte.criticidad == null ? null : Number(reporte.criticidad),
    nivelPrevio: reporte.nivelPreliminar,
  };
}

/**
 * Mapa `codigo de pregunta -> codigos de las opciones elegidas`. Las preguntas sin
 * codigo se descartan: ninguna regla puede alcanzarlas.
 */
function mapaRespuestas(respuestas: RespuestaCriticidad[]): MapaRespuestas {
  const mapa: MapaRespuestas = new Map();
  for (const r of respuestas) {
    if (!r.preguntaCodigo) {
      continue;
    }
    // Una pregunta puede venir en mas de una fila de `Respuesta`; se acumulan las
    // opciones en vez de que la ultima pise a las anteriores.
    const acumuladas = mapa.get(r.preguntaCodigo) ?? new Set<string>();
    for (const codigo of r.opcionCodigos) {
      acumuladas.add(codigo);
    }
    mapa.set(r.preguntaCodigo, acumuladas);
  }
  return mapa;
}

/**
 * F1: cantidad de OTROS reportes en `radioMetros` / `ventanaDias` (Haversine,
 * ERS §4.6), mapeada por la tabla escalonada de `puntajes.f1`.
 */
async function calcularF1(
  reporte: ReporteParaCriticidad,
  config: ConfiguracionCriticidad,
  tablaF1: TablaF1,
): Promise<number | null> {
  const filas = await prisma.$queryRaw<{ cantidad: number }[]>`
    SELECT COUNT(*)::int AS cantidad
    FROM "Reporte"
    WHERE "fechaCreacion" >= NOW() - make_interval(days => ${config.ventanaDias}::int)
      AND id <> ${reporte.reporteId}
      AND 6371000 * 2 * ASIN(SQRT(
            POWER(SIN(RADIANS(latitud - ${reporte.latitud}) / 2), 2) +
            COS(RADIANS(${reporte.latitud})) * COS(RADIANS(latitud)) *
            POWER(SIN(RADIANS(longitud - ${reporte.longitud}) / 2), 2)
          )) <= ${config.radioMetros}
  `;

  const cantidad = Number(filas[0]?.cantidad ?? 0);
  return puntajeF1(cantidad, tablaF1);
}

/** Primer tramo cuyo `max` (null = infinito) cubre `cantidad`. */
function puntajeF1(cantidad: number, tablaF1: TablaF1): number {
  for (const tramo of tablaF1.tabla) {
    if (tramo.max === null || cantidad <= tramo.max) {
      return tramo.valor;
    }
  }
  return 0;
}

/** F4 = riesgoScore / divisor (ERS §5.2). Null si la IA no dio score. */
/**
 * F5: mapa de riesgo (ERS §5.1). Sale de la UBICACION del reporte, no del
 * cuestionario.
 *
 *   sin ninguna zona activa cargada -> null (no participa, se renormaliza)
 *   con zonas, pero el punto cae fuera de todas -> 0
 *   con zonas, el punto cae adentro -> el puntaje de la zona (SIN_RIESGO=1 .. CRITICA=5)
 *
 * Si el punto cae en varias zonas superpuestas gana LA MAS ALTA: agregar una zona
 * al mapa nunca puede bajarle la criticidad a un reporte que ya estaba cubierto.
 *
 * `null` (sin mapa) y `0` (fuera del mapa) son deliberadamente distintos: el
 * primero dice "no se", y se renormaliza; el segundo dice "se, y no hay riesgo
 * mapeado aca", y entra al promedio tirando hacia abajo.
 *
 * Tolerante a fallos, igual que la geocodificacion: si la consulta falla, F5 queda
 * `null` y el reporte se calcula con los demas factores en vez de no calcularse.
 */
async function calcularF5(latitud: number, longitud: number): Promise<number | null> {
  try {
    const zonas = await zonasActivasParaF5();
    if (zonas.length === 0) {
      return null;
    }

    let puntaje = 0;
    for (const zona of zonas) {
      // El bbox descarta la mayoria de las zonas con cuatro comparaciones, antes
      // del ray casting que es O(vertices).
      if (!puntoEnBoundingBox(latitud, longitud, zona)) {
        continue;
      }
      if (!puntoEnPoligono(latitud, longitud, zona.poligono)) {
        continue;
      }
      puntaje = Math.max(puntaje, PUNTAJE_F5_POR_CRITICIDAD[zona.criticidad]);
    }

    return puntaje;
  } catch (err) {
    console.error('[criticidad] No se pudo evaluar F5 contra el mapa de riesgo.', err);
    return null;
  }
}

function calcularF4(riesgoScore: number | null, divisor: number): number | null {
  if (riesgoScore === null) {
    return null;
  }
  const d = divisor && divisor !== 0 ? divisor : 1;
  return riesgoScore / d;
}

async function persistir(
  reporteId: number,
  configId: number,
  resultado: ReturnType<typeof combinarFactores>,
): Promise<void> {
  const { factores, sumaCriticidad, criticidad, nivel } = resultado;

  await prisma.$transaction([
    prisma.desgloseFactores.upsert({
      where: { reporteId },
      create: {
        reporteId,
        configId,
        f1: factores.f1,
        f2: factores.f2,
        f3: factores.f3,
        f4: factores.f4,
        f5: factores.f5,
        // La columna se llama `bonusVulnerabilidad` por el bonus original; hoy
        // guarda el total sumado por TODAS las reglas especiales de suma.
        bonusVulnerabilidad: sumaCriticidad,
      },
      update: {
        configId,
        f1: factores.f1,
        f2: factores.f2,
        f3: factores.f3,
        f4: factores.f4,
        f5: factores.f5,
        bonusVulnerabilidad: sumaCriticidad,
      },
    }),
    prisma.reporte.update({
      where: { id: reporteId },
      data: { criticidad, nivelPreliminar: nivel },
    }),
  ]);
}
