import { z } from 'zod';

/** Params de los recursos hijos, que cuelgan de su propio router. */
export const comentarioIdParamSchema = z.object({
  comentarioId: z.coerce.number().int().positive(),
});

export const adjuntoIdParamSchema = z.object({
  adjuntoId: z.coerce.number().int().positive(),
});

export const tareaIdParamSchema = z.object({
  tareaId: z.coerce.number().int().positive(),
});

/**
 * El feed se pagina hacia atras: la pagina 1 es lo MAS RECIENTE (el service
 * ordena por fecha desc) y el front invierte para pintar viejo -> nuevo. Con
 * orden ascendente, "cargar mas" en un hilo que crece es impaginable.
 */
export const listarComentariosQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

/**
 * Cuerpo del comentario. Llega por `multipart/form-data` junto con los archivos,
 * asi que todo es string: no hay coerciones que hacer.
 *
 * El texto es OBLIGATORIO: un "comentario" vacio con solo archivos no se
 * entiende en un hilo de chat. Ese caso es subir el adjunto a la alerta
 * (POST /:id/adjuntos), que aparece en la pestaña Archivos.
 */
export const crearComentarioBodySchema = z.object({
  cuerpo: z.string().trim().min(1, 'Escribi un comentario.').max(2000),
});

/** 'YYYY-MM-DD': fecha de calendario, sin hora ni huso. */
const fechaCalendario = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener el formato YYYY-MM-DD')
  .refine((valor) => !Number.isNaN(Date.parse(`${valor}T00:00:00Z`)), 'La fecha no existe.');

export const crearTareaBodySchema = z.object({
  titulo: z.string().trim().min(1, 'Escribi el titulo de la tarea.').max(300),
  responsableId: z.coerce.number().int().positive().nullable().optional(),
  fechaVencimiento: fechaCalendario.nullable().optional(),
});

/**
 * PATCH parcial. `responsableId` y `fechaVencimiento` son nullable Y optional a
 * proposito: es el contrato de tres estados que ya usa el PUT de cabeceras de
 * webhook, pero por campo.
 *   - ausente -> no se toca
 *   - null    -> se quita (desasignar / sacar el vencimiento)
 *   - valor   -> se reemplaza
 *
 * Es PATCH y no PUT porque el caso dominante —tildar el check— toca un campo.
 */
export const actualizarTareaBodySchema = z
  .object({
    titulo: z.string().trim().min(1).max(300).optional(),
    completada: z.boolean().optional(),
    responsableId: z.coerce.number().int().positive().nullable().optional(),
    fechaVencimiento: fechaCalendario.nullable().optional(),
    orden: z.coerce.number().int().min(0).optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Enviá al menos un campo para actualizar.',
  });

/** `?descargar=true` fuerza `attachment` incluso en una imagen o un PDF. */
export const contenidoAdjuntoQuerySchema = z.object({
  descargar: z
    .enum(['true', 'false'])
    .transform((valor) => valor === 'true')
    .optional(),
});

export type ComentarioIdParam = z.infer<typeof comentarioIdParamSchema>;
export type AdjuntoIdParam = z.infer<typeof adjuntoIdParamSchema>;
export type TareaIdParam = z.infer<typeof tareaIdParamSchema>;
export type ListarComentariosQuery = z.infer<typeof listarComentariosQuerySchema>;
export type CrearComentarioBody = z.infer<typeof crearComentarioBodySchema>;
export type CrearTareaBody = z.infer<typeof crearTareaBodySchema>;
export type ActualizarTareaBody = z.infer<typeof actualizarTareaBodySchema>;
export type ContenidoAdjuntoQuery = z.infer<typeof contenidoAdjuntoQuerySchema>;
