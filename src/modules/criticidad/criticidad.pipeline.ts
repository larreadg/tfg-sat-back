import { EstadoEvaluacionIa } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { obtenerParametrosGeo } from '../../shared/services/config-geo.service';
import { enriquecerUbicacionReporte } from '../../shared/services/geocoding.service';
import { recalcularCriticidad } from './criticidad.service';
import { generarAlertaDeReporte } from '../alertas/alertas.service';
import { evaluarPuntoCritico } from '../puntos-criticos/puntos-criticos.service';

/**
 * Post-envio: solo criticidad PRELIMINAR (sin F4, la IA aun no corrio). No genera
 * alertas ni puntos criticos: hacerlo con datos incompletos produce alertas que
 * la IA luego invalida. Alertas/puntos se difieren al recalculo post-IA.
 */
export async function procesarReportePostEnvio(reporteId: number): Promise<void> {
  // Geocodificacion inversa antes que nada: es tolerante a fallos y deja la
  // ubicacion legible disponible para el analista apenas entra el reporte.
  await enriquecerUbicacionReporte(reporteId);
  await recalcularCriticidad(reporteId);
}

/**
 * Post-IA: recalcula la criticidad (ya con F4 si la IA quedo COMPLETADO) y, solo
 * cuando el analisis quedo ASENTADO (COMPLETADO, o ERROR sin reintentos
 * pendientes), genera/deduplica alertas (§5.4) y evalua puntos criticos (§5.5).
 *
 * Al generar alertas/puntos unicamente desde aca, y como este camino corre dentro
 * del job de IA (`procesarPendientes`) que procesa las evaluaciones de a una, la
 * deduplicacion no compite consigo misma en un despliegue de instancia unica
 * (multi-instancia requeriria un lock en DB). Ademas, como la criticidad ya no
 * cambia despues de COMPLETADO, no quedan alertas "preliminares" desactualizadas.
 */
export async function procesarReportePostIa(reporteId: number): Promise<void> {
  // Segunda chance: si el proveedor de geocodificacion estaba caido al momento
  // del envio, aca se reintenta. Es no-op si el reporte ya quedo geocodificado.
  await enriquecerUbicacionReporte(reporteId);
  await recalcularCriticidad(reporteId);

  const evaluacion = await prisma.evaluacionIa.findUnique({
    where: { reporteId },
    select: { estado: true, intentos: true },
  });
  if (!evaluacion) {
    return;
  }

  const asentado =
    evaluacion.estado === EstadoEvaluacionIa.COMPLETADO ||
    (evaluacion.estado === EstadoEvaluacionIa.ERROR &&
      evaluacion.intentos >= env.evaluacionIaMaxIntentos);
  if (!asentado) {
    return;
  }

  // Parametros geo leidos una sola vez y propagados (evita relecturas de config).
  const params = await obtenerParametrosGeo();
  await generarAlertaDeReporte(reporteId, params);
  await evaluarPuntoCritico(reporteId, params);
}
