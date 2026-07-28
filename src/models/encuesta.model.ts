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
  nombre: string;
  descripcion: string | null;
  preguntas: PreguntaDTO[];
}
