import { z } from 'zod';

export const citizenLoginSchema = z.object({
  telefono: z
    .string()
    .trim()
    .regex(/^\+?\d{6,15}$/, 'El numero de telefono no es valido.'),
  // Token de Cloudflare Turnstile (RF-29). Reemplaza al captcha SVG y es
  // obligatorio: sin el, el envio de OTP queda abierto a bots.
  turnstileToken: z.string().trim().min(1),
});

export const citizenPreAuthSchema = z.object({
  preAuthToken: z.string().min(1),
});

export const citizenVerificarSchema = z.object({
  preAuthToken: z.string().min(1),
  // Codigo SMS de 4 digitos exactos (ver doble-factor.service / citizen-auth.service).
  codigo: z.string().trim().regex(/^\d{4}$/, 'El codigo debe tener 4 digitos.'),
});

export type CitizenLoginBody = z.infer<typeof citizenLoginSchema>;
export type CitizenVerificarBody = z.infer<typeof citizenVerificarSchema>;
