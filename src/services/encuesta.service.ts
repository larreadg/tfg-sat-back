import { prisma } from '../config/prisma';
import { NotFoundError } from '../utils/errors';
import { EncuestaConPreguntasDTO } from '../models/encuesta.model';

export async function obtenerEncuestaActiva(): Promise<EncuestaConPreguntasDTO> {
  const encuesta = await cargarEncuestaActiva();

  return {
    id: encuesta.id,
    nombre: encuesta.nombre,
    descripcion: encuesta.descripcion,
    preguntas: encuesta.preguntas.map((encuestaPregunta) => ({
      id: encuestaPregunta.pregunta.id,
      texto: encuestaPregunta.pregunta.texto,
      tipo: encuestaPregunta.pregunta.tipo,
      orden: encuestaPregunta.orden,
      opciones: encuestaPregunta.pregunta.opciones.map((opcion) => ({
        id: opcion.id,
        texto: opcion.texto,
        orden: opcion.orden,
      })),
    })),
  };
}

export function cargarEncuestaActiva(encuestaId?: number) {
  return prisma.encuesta
    .findFirst({
      where: encuestaId ? { id: encuestaId, activo: true } : { activo: true },
      orderBy: { fechaCreacion: 'desc' },
      include: {
        preguntas: {
          where: { pregunta: { activo: true } },
          orderBy: { orden: 'asc' },
          include: {
            pregunta: {
              include: {
                opciones: { where: { activo: true }, orderBy: { orden: 'asc' } },
              },
            },
          },
        },
      },
    })
    .then((encuesta) => {
      if (!encuesta) {
        throw new NotFoundError('No hay una encuesta activa disponible.');
      }
      return encuesta;
    });
}
