import { TipoPregunta } from '@prisma/client';
import { cargarEncuestaActiva } from '../encuestas/encuestas.service';

/**
 * Vista de la encuesta pensada para el bot: renderizamos SIEMPRE desde la
 * encuesta activa en DB (fuente unica de verdad, mapeo por `orden`). Separamos
 * las preguntas de opciones (las 6 que el bot muestra con botones) de la
 * pregunta de tipo FOTO (paso opcional aparte).
 */
export interface OpcionBot {
  id: number;
  texto: string;
}

export interface PreguntaBot {
  preguntaId: number;
  texto: string;
  opciones: OpcionBot[];
}

export interface EncuestaBot {
  encuestaId: number;
  nombre: string;
  preguntas: PreguntaBot[];
  fotoPreguntaId: number | null;
}

export async function cargarEncuestaBot(encuestaId?: number): Promise<EncuestaBot> {
  const encuesta = await cargarEncuestaActiva(encuestaId);

  const preguntas: PreguntaBot[] = [];
  let fotoPreguntaId: number | null = null;

  for (const ep of encuesta.preguntas) {
    const pregunta = ep.pregunta;
    if (pregunta.tipo === TipoPregunta.FOTO) {
      fotoPreguntaId = pregunta.id;
      continue;
    }
    preguntas.push({
      preguntaId: pregunta.id,
      texto: pregunta.texto,
      opciones: pregunta.opciones.map((o) => ({ id: o.id, texto: o.texto })),
    });
  }

  return {
    encuestaId: encuesta.id,
    nombre: encuesta.nombre,
    preguntas,
    fotoPreguntaId,
  };
}
