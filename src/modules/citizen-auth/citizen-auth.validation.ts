import { z } from 'zod';

export const citizenLoginSchema = z.object({
  telefono: z
    .string()
    .trim()
    .regex(/^\+?\d{6,15}$/, 'El numero de telefono no es valido.'),
  captcha: z.string().trim().min(1),
});

export const citizenPreAuthSchema = z.object({
  preAuthToken: z.string().min(1),
});

export const citizenVerificarSchema = z.object({
  preAuthToken: z.string().min(1),
  codigo: z.string().trim().min(1),
});

export type CitizenLoginBody = z.infer<typeof citizenLoginSchema>;
export type CitizenVerificarBody = z.infer<typeof citizenVerificarSchema>;
