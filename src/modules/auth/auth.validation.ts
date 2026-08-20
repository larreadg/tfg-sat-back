import { z } from 'zod';

export const loginSchema = z.object({
  correoElectronico: z.string().trim().email(),
  contrasena: z.string().min(1),
  captcha: z.string().trim().min(1),
});

export const preAuthSchema = z.object({
  preAuthToken: z.string().min(1),
});

export const verificarDobleFactorSchema = z.object({
  preAuthToken: z.string().min(1),
  codigo: z.string().trim().min(1),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export const logoutSchema = z.object({
  refreshToken: z.string().min(1),
});

export type LoginBody = z.infer<typeof loginSchema>;
export type VerificarDobleFactorBody = z.infer<typeof verificarDobleFactorSchema>;
