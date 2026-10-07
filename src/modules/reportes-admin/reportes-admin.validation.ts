import { z } from 'zod';
import { Canal, EstadoEvaluacionIa } from '@prisma/client';

/**
 * Filtros del listado admin de reportes (ERS §8). Todo opcional; `page`/`pageSize`
 * con defaults. `bbox` = "minLng,minLat,maxLng,maxLat" (orden GeoJSON).
 */
export const listarReportesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  desde: z.coerce.date().optional(),
  hasta: z.coerce.date().optional(),
  canal: z.nativeEnum(Canal).optional(),
  estado: z.nativeEnum(EstadoEvaluacionIa).optional(),
  // Coincidencia parcial contra el telefono del ciudadano. Es PII: el service
  // solo lo aplica si el solicitante tiene `usuario_ciudadano.ver`.
  telefono: z
    .string()
    .trim()
    .max(30)
    .optional()
    .transform((valor) => valor || undefined),
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

export const reporteIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export type ListarReportesQuery = z.infer<typeof listarReportesQuerySchema>;
export type ReporteIdParam = z.infer<typeof reporteIdParamSchema>;
