import { z } from 'zod';
import { ActorAuditoria, OperacionAuditoria } from '@prisma/client';
import { NOMBRES_ACCION } from './auditoria.acciones';

/**
 * Filtros del listado de auditoria. Todos opcionales y combinables (AND).
 *
 * `accion` se valida contra el catalogo con un `refine` y no con `z.enum(...)`
 * porque el catalogo es un array calculado: asi un nombre viejo que ya no esta
 * en el catalogo devuelve un 400 que dice cual es, en vez de un error de zod
 * ilegible con 40 valores posibles.
 */
export const listarAuditoriaQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),

  desde: z.coerce.date().optional(),
  hasta: z.coerce.date().optional(),

  accion: z
    .string()
    .trim()
    .optional()
    .transform((valor) => valor || undefined)
    .refine((valor) => valor === undefined || NOMBRES_ACCION.includes(valor), {
      message: 'Esa accion no existe en el catalogo de auditoria.',
    }),
  operacion: z.nativeEnum(OperacionAuditoria).optional(),
  entidad: z
    .string()
    .trim()
    .max(60)
    .optional()
    .transform((valor) => valor || undefined),
  entidadId: z
    .string()
    .trim()
    .max(60)
    .optional()
    .transform((valor) => valor || undefined),

  /** Id exacto del usuario del panel que ejecuto la accion. */
  usuarioId: z.coerce.number().int().positive().optional(),
  actorTipo: z.nativeEnum(ActorAuditoria).optional(),
  ip: z
    .string()
    .trim()
    .max(60)
    .optional()
    .transform((valor) => valor || undefined),

  exito: z
    .enum(['true', 'false'])
    .transform((valor) => valor === 'true')
    .optional(),

  /**
   * Busqueda libre. Pega contra la descripcion y contra el nombre/correo del
   * actor: es el campo con el que se arranca cuando solo se sabe "algo paso con
   * la alerta 12".
   */
  q: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((valor) => valor || undefined),
});

export const auditoriaIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export type ListarAuditoriaQuery = z.infer<typeof listarAuditoriaQuerySchema>;
export type AuditoriaIdParam = z.infer<typeof auditoriaIdParamSchema>;
