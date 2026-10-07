import { Canal, TipoPregunta } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { BadRequestError, ConflictError, NotFoundError, TooManyRequestsError } from '../../shared/utils/errors';
import { generarCodigoPublico } from '../../shared/utils/codigo-publico';
import { obtenerLimitesAntiabuso } from '../../shared/services/limites.service';
import { procesarReportePostEnvio } from '../criticidad/criticidad.pipeline';
import { comprimirYGuardarFotos } from './upload';
import { registrarAuditoria } from '../auditoria/auditoria.registro';
import { cargarEncuestaActiva } from '../encuestas/encuestas.service';
import {
  GuardarRespuestasInput,
  OrigenReporte,
  ReporteCreadoDTO,
  ReporteEstadoPublicoDTO,
} from './reportes.types';

export async function guardarRespuestas(
  origen: OrigenReporte,
  input: GuardarRespuestasInput,
  archivos: Express.Multer.File[],
  canal: Canal = Canal.WEB,
): Promise<ReporteCreadoDTO> {
  // En WEB, la validacion OTP es de un solo uso: si ya generó un reporte, no se
  // reutiliza. En bots, `validacionSmsId` es el ancla de idempotencia del envio.
  if (origen.validacionSmsId != null) {
    const reporteExistente = await prisma.reporte.findUnique({
      where: { validacionSmsId: origen.validacionSmsId },
    });

    if (reporteExistente) {
      throw new ConflictError(
        'El enlace de verificacion ya fue utilizado para enviar un reporte. Volve a verificar tu numero para enviar uno nuevo.',
      );
    }
  }

  await verificarLimiteReportesPor24h(origen.usuarioCiudadanoId);

  const encuesta = await cargarEncuestaActiva(input.encuestaId);
  const respuestasPorPreguntaId = new Map(input.respuestas.map((item) => [item.preguntaId, item]));
  const tieneFoto = encuesta.preguntas.some((ep) => ep.pregunta.tipo === TipoPregunta.FOTO);

  // Cuantas fotos se exigen lo define la VERSION de la encuesta, no una
  // constante: `fotosMin >= 1`, o sea que la foto no es opcional.
  if (!tieneFoto) {
    if (archivos.length > 0) {
      throw new BadRequestError('Esta encuesta no admite el envio de fotos.');
    }
  } else {
    if (archivos.length < encuesta.fotosMin) {
      throw new BadRequestError(
        encuesta.fotosMin === 1
          ? 'Tenes que adjuntar al menos una foto del agua.'
          : `Tenes que adjuntar al menos ${encuesta.fotosMin} fotos del agua.`,
      );
    }
    if (archivos.length > encuesta.fotosMax) {
      throw new BadRequestError(`Se permiten como maximo ${encuesta.fotosMax} fotos.`);
    }
  }

  for (const encuestaPregunta of encuesta.preguntas) {
    const pregunta = encuestaPregunta.pregunta;

    if (pregunta.tipo === TipoPregunta.FOTO) {
      continue;
    }

    const item = respuestasPorPreguntaId.get(pregunta.id);
    if (!item) {
      throw new BadRequestError(`Falta responder la pregunta "${pregunta.texto}".`);
    }

    const opcionIds = item.preguntaOpcionIds ?? [];

    if (pregunta.tipo === TipoPregunta.ELECCION_UNICA && opcionIds.length !== 1) {
      throw new BadRequestError(`La pregunta "${pregunta.texto}" requiere exactamente una opcion.`);
    }

    if (pregunta.tipo === TipoPregunta.ELECCION_MULTIPLE && opcionIds.length < 1) {
      throw new BadRequestError(`La pregunta "${pregunta.texto}" requiere al menos una opcion.`);
    }

    const opcionesValidas = new Set(pregunta.opciones.map((opcion) => opcion.id));
    for (const opcionId of opcionIds) {
      if (!opcionesValidas.has(opcionId)) {
        throw new BadRequestError(`Opcion invalida para la pregunta "${pregunta.texto}".`);
      }
    }
  }

  const urlsFotos = archivos.length > 0 ? await comprimirYGuardarFotos(archivos) : [];

  const { reporteId, codigoPublico, respuestaIds } = await prisma.$transaction(async (tx) => {
    const reporte = await tx.reporte.create({
      data: {
        codigoPublico: await generarCodigoPublico(tx),
        canal,
        encuestaId: encuesta.id,
        usuarioCiudadanoId: origen.usuarioCiudadanoId,
        validacionSmsId: origen.validacionSmsId ?? null,
        descripcion: input.descripcion ?? null,
        latitud: input.latitud,
        longitud: input.longitud,
      },
    });

    const idsCreados: number[] = [];

    for (const encuestaPregunta of encuesta.preguntas) {
      const pregunta = encuestaPregunta.pregunta;

      if (pregunta.tipo === TipoPregunta.FOTO) {
        if (urlsFotos.length === 0) {
          continue;
        }

        const respuesta = await tx.respuesta.create({
          data: {
            canal,
            encuestaId: encuesta.id,
            usuarioCiudadanoId: origen.usuarioCiudadanoId,
            reporteId: reporte.id,
            preguntaId: pregunta.id,
            latitud: input.latitud,
            longitud: input.longitud,
          },
        });

        await tx.respuestaArchivo.createMany({
          data: urlsFotos.map((url, indice) => ({
            respuestaId: respuesta.id,
            url,
            orden: indice,
          })),
        });

        idsCreados.push(respuesta.id);
        continue;
      }

      const item = respuestasPorPreguntaId.get(pregunta.id)!;
      const opcionIds = item.preguntaOpcionIds ?? [];

      const respuesta = await tx.respuesta.create({
        data: {
          canal,
          encuestaId: encuesta.id,
          usuarioCiudadanoId: origen.usuarioCiudadanoId,
          reporteId: reporte.id,
          preguntaId: pregunta.id,
          latitud: input.latitud,
          longitud: input.longitud,
        },
      });

      await tx.respuestaOpcion.createMany({
        data: opcionIds.map((preguntaOpcionId) => ({ respuestaId: respuesta.id, preguntaOpcionId })),
      });

      idsCreados.push(respuesta.id);
    }

    await tx.evaluacionIa.create({
      data: { reporteId: reporte.id },
    });

    return { reporteId: reporte.id, codigoPublico: reporte.codigoPublico, respuestaIds: idsCreados };
  });

  // El actor es el CIUDADANO. En el canal WEB sale del contexto de la request
  // (`req.ciudadano`, que puso `requireCiudadanoSession`); en TELEGRAM no hay
  // sesion de ese tipo, asi que se pasa explicito. En los dos casos el telefono
  // va ENMASCARADO: la bitacora la lee quien tiene `auditoria.ver`, que no es el
  // mismo permiso que habilita ver PII del ciudadano.
  registrarAuditoria({
    accion: 'REPORTE_CREAR',
    entidadId: reporteId,
    descripcion: `Se registro el reporte ${codigoPublico} por ${canal}`,
    ...(origen.telefono ? { actor: { tipo: 'CIUDADANO' as const, telefono: origen.telefono } } : {}),
    datosNuevos: {
      codigoPublico,
      canal,
      encuestaId: encuesta.id,
      latitud: input.latitud,
      longitud: input.longitud,
      respuestas: respuestaIds.length,
      fotos: urlsFotos.length,
    },
  });

  // Criticidad PRELIMINAR (ERS §5, sin F4). Las alertas/puntos se generan recien
  // en el recalculo post-IA (ver criticidad.pipeline). Tolerante a fallos.
  await procesarReportePostEnvio(reporteId);

  return {
    reporteId,
    codigoPublico,
    encuestaId: encuesta.id,
    respuestaIds,
  };
}

/**
 * Limite anti-abuso: N reportes por 24h por ciudadano (ERS §3, configurable).
 * Aplica a todos los canales (web y bots pasan por aca).
 */
async function verificarLimiteReportesPor24h(usuarioCiudadanoId: number): Promise<void> {
  const { reportesPor24h } = await obtenerLimitesAntiabuso();
  const desde = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const reportesUltimas24h = await prisma.reporte.count({
    where: { usuarioCiudadanoId, fechaCreacion: { gte: desde } },
  });

  if (reportesUltimas24h >= reportesPor24h) {
    throw new TooManyRequestsError(
      'Alcanzaste el limite de reportes en 24 horas para este numero. Intenta nuevamente mas tarde.',
    );
  }
}

/**
 * Estado publico de un reporte por su `codigoPublico`. No expone telefono ni
 * datos personales (ERS §8, §14). Devuelve el estado del analisis IA y el nivel
 * preliminar de criticidad (null mientras el motor no lo calcula — Fase B).
 */
export async function obtenerEstadoPublico(codigoPublico: string): Promise<ReporteEstadoPublicoDTO> {
  const reporte = await prisma.reporte.findUnique({
    where: { codigoPublico },
    select: {
      codigoPublico: true,
      fechaCreacion: true,
      nivelPreliminar: true,
      evaluacionIa: { select: { estado: true } },
    },
  });

  if (!reporte) {
    throw new NotFoundError('No existe un reporte con ese codigo.');
  }

  return {
    codigoPublico: reporte.codigoPublico,
    fecha: reporte.fechaCreacion,
    estadoAnalisis: reporte.evaluacionIa?.estado ?? 'PENDIENTE',
    nivelPreliminar: reporte.nivelPreliminar,
  };
}
