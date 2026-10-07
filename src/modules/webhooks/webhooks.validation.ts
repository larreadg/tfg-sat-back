import { z } from 'zod';
import { AccionWebhook, EstadoAlerta, EventoWebhook } from '@prisma/client';
import { admiteCondicion, definicionAccion, definicionEvento } from './webhooks.eventos';
import { validarPlantillaJson } from './webhooks.plantillas';

/**
 * Lista de correos en un solo campo ("a@x.com, b@y.com"). Se valida cada direccion
 * por separado para que el error diga CUAL esta mal.
 */
const destinatariosSchema = z
  .string()
  .trim()
  .max(1000)
  .optional()
  .default('')
  .superRefine((crudo, ctx) => {
    const partes = crudo
      .split(',')
      .map((parte) => parte.trim())
      .filter(Boolean);

    for (const parte of partes) {
      if (!z.string().email().safeParse(parte).success) {
        ctx.addIssue({ code: 'custom', message: `"${parte}" no es un correo valido.` });
      }
    }
  });

/**
 * Solo http(s). Se rechaza cualquier otro esquema porque el backend va a hacer la
 * request del lado del servidor: dejar pasar `file://` o `gopher://` seria regalar
 * una primitiva de lectura local a cualquiera con `webhook.editar`.
 */
const urlWebhookSchema = z
  .string()
  .trim()
  .max(2000)
  .optional()
  .default('')
  .superRefine((valor, ctx) => {
    if (!valor) {
      return;
    }
    let parsed: URL;
    try {
      parsed = new URL(valor);
    } catch {
      ctx.addIssue({ code: 'custom', message: 'La URL no tiene un formato valido.' });
      return;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      ctx.addIssue({ code: 'custom', message: 'La URL tiene que empezar con http:// o https://.' });
    }
  });

/**
 * Una cabecera HTTP de la regla.
 *
 * `valor` tiene los mismos tres estados que los demas secretos: ausente =
 * conservar el guardado (identificando la cabecera por `nombre`), string =
 * reemplazarlo. No se acepta `null`: para quitar una cabecera se la saca de la
 * lista, que es lo que el panel hace al tocar la papelera.
 */
const cabeceraSchema = z.object({
  nombre: z
    .string()
    .trim()
    .min(1, 'La cabecera necesita un nombre.')
    .max(100)
    // RFC 7230: un nombre de cabecera son "tchar". Si se deja pasar un ':' o un
    // salto de linea, se puede inyectar una cabecera extra en la request.
    .regex(/^[A-Za-z0-9!#$%&'*+\-.^_`|~]+$/, 'El nombre de la cabecera tiene caracteres invalidos.'),
  valor: z.string().min(1).max(2000).optional(),
});

const baseReglaSchema = z.object({
  nombre: z.string().trim().min(1, 'Ponele un nombre a la regla.').max(120),
  evento: z.nativeEnum(EventoWebhook),
  accion: z.nativeEnum(AccionWebhook),
  activa: z.boolean().optional().default(true),

  // Condiciones. Se aceptan siempre y se validan contra el catalogo en el refine
  // de abajo: asi el mensaje puede decir "ese evento no filtra por nivel" en vez
  // de un error de tipos opaco.
  nivelMinimo: z.number().int().min(0).max(3).nullable().optional(),
  estadosDestino: z.array(z.nativeEnum(EstadoAlerta)).max(5).optional().default([]),

  // Accion CORREO
  destinatarios: destinatariosSchema,
  asunto: z.string().trim().max(200).optional().default(''),

  // Accion HTTP
  url: urlWebhookSchema,
  /**
   * Tres estados, igual que la contrasena SMTP: ausente = conservar el guardado,
   * `null` = borrarlo (manda sin firmar), string = reemplazarlo. La API nunca lo
   * devuelve, asi que el panel no puede reenviarlo.
   */
  secretoFirma: z.string().min(8, 'El secreto de firma necesita al menos 8 caracteres.').max(255).nullable().optional(),

  /** Plantilla HTML del cuerpo del correo. Vacio = cuerpo autogenerado. */
  cuerpoCorreo: z.string().max(20000, 'El cuerpo del correo es demasiado largo.').optional().default(''),

  /** Plantilla JSON del body del POST. Vacio = el payload completo de AGUARD. */
  cuerpoHttp: z.string().max(10000, 'El cuerpo del POST es demasiado largo.').optional().default(''),

  cabeceras: z.array(cabeceraSchema).max(20, 'Como maximo 20 cabeceras.').optional().default([]),
});

/**
 * Las reglas de coherencia entre evento, accion y campos. Van en un `superRefine`
 * compartido porque son exactamente las mismas al crear y al editar, y porque
 * duplicarlas es la forma mas facil de que el POST y el PUT se desincronicen.
 */
function validarCoherencia(
  regla: z.infer<typeof baseReglaSchema>,
  ctx: z.RefinementCtx,
): void {
  // --- Condiciones admitidas por el evento ---
  if (regla.nivelMinimo != null && !admiteCondicion(regla.evento, 'nivelMinimo')) {
    ctx.addIssue({
      code: 'custom',
      message: 'Ese evento no filtra por nivel.',
      path: ['nivelMinimo'],
    });
  }
  if (regla.estadosDestino.length > 0 && !admiteCondicion(regla.evento, 'estadosDestino')) {
    ctx.addIssue({
      code: 'custom',
      message: 'Ese evento no filtra por estado destino.',
      path: ['estadosDestino'],
    });
  }

  // --- Campos que exige la accion ---
  const campos = definicionAccion(regla.accion).campos;

  if (campos.includes('destinatarios')) {
    const hayDestinatarios = regla.destinatarios.split(',').some((parte) => parte.trim().length > 0);
    if (!hayDestinatarios) {
      ctx.addIssue({
        code: 'custom',
        message: 'Una regla que manda correo necesita al menos un destinatario.',
        path: ['destinatarios'],
      });
    }
  }

  if (campos.includes('url') && !regla.url) {
    ctx.addIssue({
      code: 'custom',
      message: 'Una regla que llama a una URL necesita la URL.',
      path: ['url'],
    });
  }

  // --- Campos que NO corresponden a la accion elegida ---
  // Se rechaza en vez de ignorar en silencio: un usuario que cargo destinatarios y
  // despues cambio la accion a HTTP tiene que enterarse de que ese dato no se usa.
  if (!campos.includes('destinatarios') && regla.destinatarios.trim()) {
    ctx.addIssue({
      code: 'custom',
      message: 'Esta accion no manda correos: los destinatarios no corresponden.',
      path: ['destinatarios'],
    });
  }
  if (!campos.includes('url') && regla.url.trim()) {
    ctx.addIssue({
      code: 'custom',
      message: 'Esta accion no llama a ninguna URL.',
      path: ['url'],
    });
  }
  if (!campos.includes('cuerpoCorreo') && regla.cuerpoCorreo.trim()) {
    ctx.addIssue({
      code: 'custom',
      message: 'Esta accion no manda correos: el cuerpo del correo no corresponde.',
      path: ['cuerpoCorreo'],
    });
  }
  if (!campos.includes('cuerpoHttp') && regla.cuerpoHttp.trim()) {
    ctx.addIssue({
      code: 'custom',
      message: 'Esta accion no hace un POST: el cuerpo JSON no corresponde.',
      path: ['cuerpoHttp'],
    });
  }
  if (!campos.includes('cabeceras') && regla.cabeceras.length > 0) {
    ctx.addIssue({
      code: 'custom',
      message: 'Esta accion no hace una request HTTP: las cabeceras no corresponden.',
      path: ['cabeceras'],
    });
  }

  // --- Cabeceras duplicadas ---
  // El PUT identifica cada cabecera por nombre para decidir si conserva su valor,
  // asi que dos con el mismo nombre serian ambiguas (y la DB las rechaza igual).
  const nombres = regla.cabeceras.map((cabecera) => cabecera.nombre.toLowerCase());
  if (new Set(nombres).size !== nombres.length) {
    ctx.addIssue({
      code: 'custom',
      message: 'Hay dos cabeceras con el mismo nombre.',
      path: ['cabeceras'],
    });
  }

  // --- La plantilla JSON tiene que dar JSON valido ---
  // Se prueba con los valores de EJEMPLO del catalogo del propio evento. Asi el
  // error aparece al configurar y no cuando se pierde la primera alerta real.
  if (campos.includes('cuerpoHttp') && regla.cuerpoHttp.trim()) {
    const ejemplos = Object.fromEntries(
      definicionEvento(regla.evento).variables.map((variable) => [variable.clave, variable.ejemplo]),
    );
    const error = validarPlantillaJson(regla.cuerpoHttp, ejemplos);
    if (error) {
      ctx.addIssue({ code: 'custom', message: error, path: ['cuerpoHttp'] });
    }
  }
}

export const crearReglaSchema = baseReglaSchema.superRefine(validarCoherencia);

/** El PUT manda la regla completa (no es un PATCH): mismo contrato que el POST. */
export const actualizarReglaSchema = baseReglaSchema.superRefine(validarCoherencia);

export const reglaIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const listarReglasQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  evento: z.nativeEnum(EventoWebhook).optional(),
  activa: z
    .enum(['true', 'false'])
    .transform((valor) => valor === 'true')
    .optional(),
});

export const listarEntregasQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

/**
 * Remitente global de los correos. `remitenteCorreo` acepta vacio: significa
 * "usar el usuario SMTP", que es lo que varios servidores exigen igual.
 */
export const actualizarRemitenteSchema = z.object({
  remitenteNombre: z.string().trim().max(120).optional().default(''),
  remitenteCorreo: z.union([z.literal(''), z.string().trim().email()]).optional().default(''),
});

export type CrearReglaBody = z.infer<typeof crearReglaSchema>;
export type ActualizarReglaBody = z.infer<typeof actualizarReglaSchema>;
export type ListarReglasQuery = z.infer<typeof listarReglasQuerySchema>;
export type ListarEntregasQuery = z.infer<typeof listarEntregasQuerySchema>;
export type ActualizarRemitenteBody = z.infer<typeof actualizarRemitenteSchema>;
