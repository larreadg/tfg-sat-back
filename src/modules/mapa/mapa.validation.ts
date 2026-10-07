import { z } from 'zod';
import { Canal, EstadoEvaluacionIa } from '@prisma/client';

/**
 * Filtros del mapa admin (ERS §8). Todo opcional. `bbox` = "minLng,minLat,maxLng,maxLat"
 * (orden GeoJSON), acota reportes y puntos criticos a la ventana visible.
 */
export const mapaQuerySchema = z.object({
  desde: z.coerce.date().optional(),
  hasta: z.coerce.date().optional(),
  canal: z.nativeEnum(Canal).optional(),
  estado: z.nativeEnum(EstadoEvaluacionIa).optional(),
  nivel: z.coerce.number().int().min(0).max(3).optional(),
  bbox: z
    .string()
    .optional()
    .transform((valor, ctx) => {
      if (!valor) {
        return undefined;
      }
      const partes = valor.split(',').map((n) => Number(n.trim()));
      if (partes.length !== 4 || partes.some((n) => Number.isNaN(n))) {
        ctx.addIssue({ code: 'custom', message: 'bbox debe ser "minLng,minLat,maxLng,maxLat".' });
        return z.NEVER;
      }
      const [minLng, minLat, maxLng, maxLat] = partes;
      return { minLng, minLat, maxLng, maxLat };
    }),
});

export type MapaQuery = z.infer<typeof mapaQuerySchema>;
