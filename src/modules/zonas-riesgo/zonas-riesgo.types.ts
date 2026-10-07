import type { CriticidadZona } from '@prisma/client';
import type { Vertice } from '../../shared/utils/poligono';

/** Lo que el panel ve de una zona. El `poligono` ya viene parseado. */
export interface ZonaRiesgoDTO {
  id: number;
  nombre: string;
  descripcion: string | null;
  criticidad: CriticidadZona;
  poligono: Vertice[];
  activo: boolean;
  /** Puntaje que esta zona le aporta a F5 si el reporte cae adentro. */
  puntajeF5: number;
  fechaCreacion: string;
  fechaActualizacion: string;
}

/** Lo minimo que el motor de criticidad necesita para evaluar F5. */
export interface ZonaParaF5 {
  id: number;
  criticidad: CriticidadZona;
  poligono: Vertice[];
  bboxMinLat: number;
  bboxMaxLat: number;
  bboxMinLng: number;
  bboxMaxLng: number;
}
