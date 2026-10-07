import { prisma } from '../../config/prisma';
import { NotFoundError } from '../../shared/utils/errors';
import { EncuestaConPreguntasDTO } from './encuestas.types';

export async function obtenerEncuestaActiva(): Promise<EncuestaConPreguntasDTO> {
  const encuesta = await cargarEncuestaActiva();

  return {
    id: encuesta.id,
    version: encuesta.version,
    nombre: encuesta.nombre,
    descripcion: encuesta.descripcion,
    fotosMin: encuesta.fotosMin,
    fotosMax: encuesta.fotosMax,
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

/**
 * Fotos que exige la version activa. Lo usan los canales conversacionales
 * (Telegram) para armar el paso de fotos sin traerse toda la encuesta. Si no
 * hay version activa devuelve el default del modelo (1..3): el envio va a
 * fallar despues igual, pero el bot no se rompe al pedir la foto.
 */
export async function obtenerConfigFotosActiva(): Promise<{ fotosMin: number; fotosMax: number }> {
  const encuesta = await prisma.encuesta.findFirst({
    where: { activo: true },
    orderBy: { version: 'desc' },
    select: { fotosMin: true, fotosMax: true },
  });
  return { fotosMin: encuesta?.fotosMin ?? 1, fotosMax: encuesta?.fotosMax ?? 3 };
}
