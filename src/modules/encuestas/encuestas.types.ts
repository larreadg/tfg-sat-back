import { TipoPregunta } from '@prisma/client';

export interface PreguntaOpcionDTO {
  id: number;
  texto: string;
  orden: number;
}

export interface PreguntaDTO {
  id: number;
  texto: string;
  tipo: TipoPregunta;
  orden: number;
  opciones: PreguntaOpcionDTO[];
}

export interface EncuestaConPreguntasDTO {
  id: number;
  /** Version del cuestionario que se esta respondiendo. */
  version: number;
  nombre: string;
  descripcion: string | null;
  /**
   * Fotos que exige esta version. `fotosMin >= 1`: el wizard y el bot tienen
   * que pedirlas si o si, y el back rechaza el envio que no las traiga.
   */
  fotosMin: number;
  fotosMax: number;
  preguntas: PreguntaDTO[];
}
