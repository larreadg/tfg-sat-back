import { z } from 'zod';

const respuestaItemSchema = z.object({
  preguntaId: z.number().int().positive(),
  preguntaOpcionIds: z.array(z.number().int().positive()).optional(),
});

/**
 * El reporte llega como `multipart/form-data` (multer): las fotos van en
 * `req.files` y el resto en campos de texto. `respuestas` viaja como un string
 * JSON que aca se parsea y valida; `latitud`/`longitud` se coaccionan a numero.
 */
export const guardarRespuestasSchema = z.object({
  encuestaId: z.coerce.number().int().positive().optional(),
  // Token de Cloudflare Turnstile (RF-29): el envio del reporte tambien pasa
  // por el gate anti-bot, no solo la validacion del telefono.
  turnstileToken: z.string().trim().min(1),
  latitud: z.coerce.number().min(-90).max(90),
  longitud: z.coerce.number().min(-180).max(180),
  descripcion: z.string().trim().max(1000).optional(),
  respuestas: z
    .string()
    .transform((valor, ctx) => {
      try {
        return JSON.parse(valor) as unknown;
      } catch {
        ctx.addIssue({ code: 'custom', message: 'El campo "respuestas" no es un JSON valido.' });
        return z.NEVER;
      }
    })
    .pipe(z.array(respuestaItemSchema)),
});

export type GuardarRespuestasBody = z.infer<typeof guardarRespuestasSchema>;
