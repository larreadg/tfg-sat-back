import { z } from 'zod';

export const loginSchema = z.object({
  correoElectronico: z.string().trim().email(),
  contrasena: z.string().min(1),
  // Token de Cloudflare Turnstile (RF-29). Reemplaza al captcha SVG: la
  // verificacion es server-side y de un solo uso.
  turnstileToken: z.string().trim().min(1),
});

export const preAuthSchema = z.object({
  preAuthToken: z.string().min(1),
});

export const verificarDobleFactorSchema = z.object({
  preAuthToken: z.string().min(1),
  // Codigo SMS de 6 digitos exactos (ver LONGITUD_CODIGO en doble-factor.service).
  codigo: z.string().trim().regex(/^\d{6}$/, 'El codigo debe tener 6 digitos.'),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export const logoutSchema = z.object({
  refreshToken: z.string().min(1),
});

export type LoginBody = z.infer<typeof loginSchema>;
export type VerificarDobleFactorBody = z.infer<typeof verificarDobleFactorSchema>;
