import { z } from 'zod';

/** Dias por defecto del periodo cuando no se manda rango. */
export const DIAS_POR_DEFECTO = 30;

/**
 * Periodo del resumen. Todo opcional: sin rango, se toman los ultimos
 * `DIAS_POR_DEFECTO` dias. El orden (desde <= hasta) se valida aca para que el
 * servicio no tenga que defenderse de un rango invertido.
 */
export const resumenQuerySchema = z
  .object({
    desde: z.coerce.date().optional(),
    hasta: z.coerce.date().optional(),
  })
  .refine((datos) => !datos.desde || !datos.hasta || datos.desde <= datos.hasta, {
    message: 'El inicio del periodo no puede ser posterior al fin.',
    path: ['desde'],
  });

export type ResumenQuery = z.infer<typeof resumenQuerySchema>;
