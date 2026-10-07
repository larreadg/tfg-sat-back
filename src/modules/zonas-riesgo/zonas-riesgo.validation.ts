import { z } from 'zod';
import { MIN_VERTICES } from '../../shared/utils/poligono';

/**
 * Un vertice del poligono. Los rangos son los de WGS84: fuera de ahi no es una
 * coordenada, es un dato mal armado.
 */
const verticeSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

/**
 * El poligono que dibuja el analista. El cierre es IMPLICITO: no se repite el
 * primer vertice al final (es lo que devuelve Leaflet y lo que espera
 * `puntoEnPoligono`).
 *
 * El tope de 500 vertices no es una limitacion del algoritmo sino un freno al
 * payload: un poligono dibujado a mano no pasa de unas decenas, y `puntoEnPoligono`
 * corre una vez por zona en cada recalculo de criticidad.
 */
const poligonoSchema = z
  .array(verticeSchema)
  .min(MIN_VERTICES, `El poligono necesita al menos ${MIN_VERTICES} vertices para encerrar un area.`)
  .max(500, 'El poligono tiene demasiados vertices (maximo 500).')
  .refine(
    (vertices) => {
      const primero = vertices[0];
      const ultimo = vertices[vertices.length - 1];
      return primero.lat !== ultimo.lat || primero.lng !== ultimo.lng;
    },
    { message: 'No repitas el primer vertice al final: el poligono se cierra solo.' },
  );

export const criticidadZonaSchema = z.enum(['SIN_RIESGO', 'BAJA', 'MEDIA', 'ALTA', 'CRITICA']);

export const crearZonaRiesgoSchema = z.object({
  nombre: z.string().trim().min(1, 'Ponele un nombre a la zona.').max(120),
  descripcion: z.string().trim().max(500).optional().nullable(),
  criticidad: criticidadZonaSchema,
  poligono: poligonoSchema,
  activo: z.boolean().optional(),
});

/** El PATCH edita lo que venga; el poligono completo o nada (no se parchea un vertice). */
export const actualizarZonaRiesgoSchema = z
  .object({
    nombre: z.string().trim().min(1).max(120).optional(),
    descripcion: z.string().trim().max(500).optional().nullable(),
    criticidad: criticidadZonaSchema.optional(),
    poligono: poligonoSchema.optional(),
    activo: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: 'No hay nada para actualizar.',
  });

export const zonaRiesgoIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const listarZonasRiesgoQuerySchema = z.object({
  /** Sin este filtro se devuelven todas, activas e inactivas. */
  activo: z
    .enum(['true', 'false'])
    .optional()
    .transform((valor) => (valor === undefined ? undefined : valor === 'true')),
});

export type CrearZonaRiesgoBody = z.infer<typeof crearZonaRiesgoSchema>;
export type ActualizarZonaRiesgoBody = z.infer<typeof actualizarZonaRiesgoSchema>;
export type ListarZonasRiesgoQuery = z.infer<typeof listarZonasRiesgoQuerySchema>;
