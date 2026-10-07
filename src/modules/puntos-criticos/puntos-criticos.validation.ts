import { z } from 'zod';
import { EstadoPuntoCritico } from '@prisma/client';

/** Filtros del listado admin de puntos criticos (ERS §8). */
export const listarPuntosCriticosQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  estado: z.nativeEnum(EstadoPuntoCritico).optional(),
});

export type ListarPuntosCriticosQuery = z.infer<typeof listarPuntosCriticosQuerySchema>;
