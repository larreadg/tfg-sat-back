import { z } from 'zod';

const personaSchema = z.object({
  nombres: z.string().trim().min(1),
  apellidos: z.string().trim().min(1),
  documento: z.string().trim().min(1),
});

export const createUserSchema = z.object({
  correoElectronico: z.string().trim().email(),
  telefono: z.string().trim().min(1),
  contrasena: z.string().min(8),
  activo: z.boolean().optional(),
  persona: personaSchema,
  rolIds: z.array(z.number().int().positive()).optional(),
});

export const updateUserSchema = z.object({
  correoElectronico: z.string().trim().email().optional(),
  telefono: z.string().trim().min(1).optional(),
  contrasena: z.string().min(8).optional(),
  activo: z.boolean().optional(),
  rolIds: z.array(z.number().int().positive()).optional(),
});

export const userIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  sort: z.string().trim().min(1).optional(),
  activo: z
    .enum(['true', 'false'])
    .transform((valor) => valor === 'true')
    .optional(),
  /** Busqueda libre sobre correo, nombres, apellidos y documento. */
  q: z.string().trim().min(1).max(100).optional(),
});

export type CreateUserBody = z.infer<typeof createUserSchema>;
export type UpdateUserBody = z.infer<typeof updateUserSchema>;
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
