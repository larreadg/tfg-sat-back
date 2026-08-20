import { Canal, TipoPregunta } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { BadRequestError, ConflictError } from '../../shared/utils/errors';
import { comprimirYGuardarFotos, MAX_FOTOS } from './upload';
import { cargarEncuestaActiva } from '../encuestas/encuestas.service';
import {
  CiudadanoSessionPayload,
  GuardarRespuestasInput,
  ReporteCreadoDTO,
} from './reportes.types';

export async function guardarRespuestas(
  ciudadano: CiudadanoSessionPayload,
  input: GuardarRespuestasInput,
  archivos: Express.Multer.File[],
): Promise<ReporteCreadoDTO> {
  const respuestaExistente = await prisma.respuesta.findFirst({
    where: { validacionSmsId: ciudadano.validacionSmsId },
  });

  if (respuestaExistente) {
    throw new ConflictError(
      'El enlace de verificacion ya fue utilizado para enviar un reporte. Volve a verificar tu numero para enviar uno nuevo.',
    );
  }

  const encuesta = await cargarEncuestaActiva(input.encuestaId);
  const respuestasPorPreguntaId = new Map(input.respuestas.map((item) => [item.preguntaId, item]));
  const tieneFoto = encuesta.preguntas.some((ep) => ep.pregunta.tipo === TipoPregunta.FOTO);

  if (archivos.length > MAX_FOTOS) {
    throw new BadRequestError(`Se permiten como maximo ${MAX_FOTOS} fotos.`);
  }

  if (archivos.length > 0 && !tieneFoto) {
    throw new BadRequestError('Esta encuesta no admite el envio de fotos.');
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

  const respuestaIds = await prisma.$transaction(async (tx) => {
    const idsCreados: number[] = [];

    for (const encuestaPregunta of encuesta.preguntas) {
      const pregunta = encuestaPregunta.pregunta;

      if (pregunta.tipo === TipoPregunta.FOTO) {
        if (urlsFotos.length === 0) {
          continue;
        }

        const respuesta = await tx.respuesta.create({
          data: {
            canal: Canal.WEB,
            encuestaId: encuesta.id,
            usuarioCiudadanoId: ciudadano.usuarioCiudadanoId,
            validacionSmsId: ciudadano.validacionSmsId,
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
          canal: Canal.WEB,
          encuestaId: encuesta.id,
          usuarioCiudadanoId: ciudadano.usuarioCiudadanoId,
          validacionSmsId: ciudadano.validacionSmsId,
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
      data: { validacionSmsId: ciudadano.validacionSmsId },
    });

    return idsCreados;
  });

  return {
    encuestaId: encuesta.id,
    validacionSmsId: ciudadano.validacionSmsId,
    respuestaIds,
  };
}
