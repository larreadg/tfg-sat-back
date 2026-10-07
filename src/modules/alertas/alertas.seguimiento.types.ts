/**
 * DTOs del seguimiento de una alerta: el hilo de comentarios, los archivos
 * adjuntos y la checklist de tareas.
 *
 * Regla que vale para todo el archivo: `rutaRelativa` de un adjunto NUNCA se
 * expone. El front llega al archivo por su id, a traves del endpoint
 * autenticado; la ruta en disco es un detalle del servidor.
 */

/** Autor de un comentario, responsable de una tarea, etc. */
export interface AutorDTO {
  id: number;
  nombreCompleto: string;
}

/**
 * Usuario al que se le puede asignar una tarea. Deliberadamente minimo: id y
 * nombre, nada mas. No es "el padron de usuarios" (eso pide `usuario.ver`, que
 * ORGANISMO no tiene): es la lista de gente a la que se le puede pasar un
 * pendiente de esta alerta.
 */
export type ResponsableDTO = AutorDTO;

export interface AdjuntoAlertaDTO {
  id: number;
  /** Null si se subio directo a la alerta; con valor si vino en un comentario. */
  comentarioId: number | null;
  nombreOriginal: string;
  tipoMime: string;
  tamanoBytes: number;
  esImagen: boolean;
  fechaCreacion: Date;
  autor: AutorDTO;
}

export interface ComentarioAlertaDTO {
  id: number;
  /** Texto plano escrito por una persona: el front lo interpola, jamas innerHTML. */
  cuerpo: string;
  fechaCreacion: Date;
  autor: AutorDTO;
  adjuntos: AdjuntoAlertaDTO[];
}

export interface ComentariosListadoDTO {
  items: ComentarioAlertaDTO[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface TareaAlertaDTO {
  id: number;
  titulo: string;
  completada: boolean;
  orden: number;
  /** Fecha de calendario como 'YYYY-MM-DD', nunca un ISO con hora (ver §huso). */
  fechaVencimiento: string | null;
  /**
   * Derivado, no persistido: `!completada && fechaVencimiento < hoy`. Si se
   * guardara en una columna haria falta un cron que la mantenga y quedaria
   * desactualizada entre corridas.
   */
  vencida: boolean;
  responsable: AutorDTO | null;
  completadaPor: AutorDTO | null;
  fechaCompletada: Date | null;
  creadaPor: AutorDTO;
  fechaCreacion: Date;
}

/** Progreso de la checklist. `porcentaje` entero 0..100, listo para el progressbar. */
export interface ResumenTareasDTO {
  total: number;
  completadas: number;
  vencidas: number;
  porcentaje: number;
}

export interface TareasAlertaDTO {
  items: TareaAlertaDTO[];
  resumen: ResumenTareasDTO;
}

/** Contadores para las etiquetas de las pestañas del modal de detalle. */
export interface SeguimientoResumenDTO {
  comentarios: number;
  adjuntos: number;
  tareas: { total: number; completadas: number; vencidas: number };
}

/** Datos con los que el controller entrega un archivo al navegador. */
export interface AdjuntoContenido {
  rutaAbsoluta: string;
  nombreOriginal: string;
  tipoMime: string;
  tamanoBytes: number;
  esImagen: boolean;
}
