import { z } from 'zod';
import { EstadoAlerta } from '@prisma/client';

/** Filtros del listado admin de alertas (ERS §8). */
export const listarAlertasQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  estado: z.nativeEnum(EstadoAlerta).optional(),
  // Atajo del panel: las abiertas (NUEVA + EN_REVISION), que son sobre las que
  // hay que actuar. `estado` explicito tiene prioridad sobre este flag.
  activas: z
    .enum(['true', 'false'])
    .transform((valor) => valor === 'true')
    .optional(),
  nivel: z.coerce.number().int().min(0).max(3).optional(),
  desde: z.coerce.date().optional(),
  hasta: z.coerce.date().optional(),
});

export const alertaIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

/**
 * Cambio de estado (ERS §8). La validez de la transicion la resuelve la maquina
 * de estados en el servicio; aca solo se valida la forma.
 */
export const cambiarEstadoBodySchema = z.object({
  estadoNuevo: z.nativeEnum(EstadoAlerta),
  observacion: z.string().trim().min(1).max(1000).optional(),
});

export type ListarAlertasQuery = z.infer<typeof listarAlertasQuerySchema>;
export type AlertaIdParam = z.infer<typeof alertaIdParamSchema>;
export type CambiarEstadoBody = z.infer<typeof cambiarEstadoBodySchema>;
