import { z } from 'zod';

export const crearRolSchema = z.object({
  nombre: z.string().trim().min(1).max(50),
  descripcion: z.string().trim().max(255).optional(),
  permisoIds: z.array(z.number().int().positive()).default([]),
});

export const actualizarRolSchema = z.object({
  nombre: z.string().trim().min(1).max(50).optional(),
  descripcion: z.string().trim().max(255).nullish(),
  permisoIds: z.array(z.number().int().positive()).optional(),
});

export const rolIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export type CrearRolBody = z.infer<typeof crearRolSchema>;
export type ActualizarRolBody = z.infer<typeof actualizarRolSchema>;
export type RolIdParam = z.infer<typeof rolIdParamSchema>;
