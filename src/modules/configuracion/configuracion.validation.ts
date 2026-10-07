import { z } from 'zod';
import { CRITICIDAD_MAX } from '../criticidad/criticidad.engine';

const pesosSchema = z
  .object({
    f1: z.number().min(0).max(1),
    f2: z.number().min(0).max(1),
    f3: z.number().min(0).max(1),
    f4: z.number().min(0).max(1),
    f5: z.number().min(0).max(1),
  })
  .refine((p) => Math.abs(p.f1 + p.f2 + p.f3 + p.f4 + p.f5 - 1) < 1e-6, {
    message: 'Los pesos deben sumar exactamente 1.',
  });

const umbralesSchema = z
  .object({
    n1: z.number().positive(),
    n2: z.number().positive(),
    n3: z.number().positive(),
  })
  .refine((u) => u.n1 < u.n2 && u.n2 < u.n3, {
    message: 'Cada umbral tiene que ser mayor que el anterior: el de Bajo menor que el de Medio, y el de Medio menor que el de Alto.',
  });

const limitesSchema = z.object({
  otpPorHora: z.number().int().positive(),
  reportesPor24h: z.number().int().positive(),
});

// --- `puntajes` (ERS §5.2) ---
// Espeja `modules/criticidad/criticidad.types.ts`. NO relajar a `z.record(...)`:
// `criticidad.service.ts` castea este JSON a `PuntajesConfig` sin verificarlo, asi
// que un `puntajes` con otra forma no falla: hace que el factor devuelva `null` y
// se renormalice, o que el tramo equivocado gane. El motor calcula mal en silencio.

/** Puntaje de un factor: escala 0-5 (ERS §5.2). */
const puntajeSchema = z.number().min(0).max(5);

/**
 * `codigo` de una pregunta o de una opcion (`AGUA_COLOR`, `VERDE_ALGAS`). Se exige
 * la convencion MAYUSCULAS_CON_GUION_BAJO para que no convivan `AGUA_COLOR` y
 * `agua_color` como si fueran cosas distintas.
 */
const codigoSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Z][A-Z0-9_]*$/, 'El codigo debe ser MAYUSCULAS_CON_GUION_BAJO y empezar con una letra.');

/**
 * F1: tabla escalonada por cantidad de reportes cercanos. `puntajeF1()`
 * (criticidad.service.ts) devuelve el PRIMER tramo cuyo `max` cubre la cantidad,
 * asi que el orden es semantico: si los tramos no vienen por `max` creciente los
 * posteriores quedan muertos, y si falta el tramo abierto (`max: null`) toda
 * cantidad por encima del ultimo `max` cae al `return 0` final.
 */
const tablaF1Schema = z
  .object({
    tabla: z
      .array(
        z.object({
          /** `null` = tramo abierto ("y mas"). */
          max: z.number().int().min(0).nullable(),
          valor: puntajeSchema,
        }),
      )
      .min(1),
  })
  .refine((f1) => f1.tabla.filter((tramo) => tramo.max === null).length === 1, {
    message: 'La tabla de F1 necesita exactamente un tramo final sin techo (el de "y mas").',
    path: ['tabla'],
  })
  .refine((f1) => f1.tabla[f1.tabla.length - 1].max === null, {
    message: 'El tramo sin techo de F1 tiene que ser el ultimo de la tabla.',
    path: ['tabla'],
  })
  .refine(
    (f1) => {
      const finitos = f1.tabla.filter((tramo) => tramo.max !== null).map((tramo) => tramo.max as number);
      return finitos.every((max, i) => i === 0 || max > finitos[i - 1]);
    },
    {
      message: 'Los tramos de F1 tienen que ir de menor a mayor: cada corte mayor que el anterior.',
      path: ['tabla'],
    },
  )
  // F1 mide DENSIDAD: mas reportes cerca no puede significar menos riesgo. Sin esta
  // regla se puede cargar una tabla invertida (0 reportes -> 5, muchos -> 0) que el
  // motor aplica sin chistar y que clasifica al reves para siempre.
  .refine((f1) => f1.tabla.every((tramo, i) => i === 0 || tramo.valor >= f1.tabla[i - 1].valor), {
    message: 'Los puntajes de F1 no pueden bajar: mas reportes cercanos nunca pueden valer menos.',
    path: ['tabla'],
  })
  // Misma exigencia que a los factores de cuestionario (ver `validarAlcanceDeFactores`):
  // F1 tiene que poder llegar al tope de la escala, o entra a la media ponderada con
  // su peso completo sin poder nunca llevar el reporte al rojo. Con los puntajes ya
  // validados como no decrecientes, el tramo abierto es el mas alto de la tabla.
  .refine((f1) => f1.tabla[f1.tabla.length - 1].valor === CRITICIDAD_MAX, {
    message: `El ultimo tramo de F1 (el abierto) tiene que valer ${CRITICIDAD_MAX}: es el unico que puede llevar F1 al tope de la escala.`,
    path: ['tabla'],
  });

/**
 * F4: `riesgoScore` de la IA dividido por `divisor` (hoy 1: la IA ya da 0-5).
 * La fuente del dato esta fija en `calcularF4`, no es configurable.
 */
const tablaF4Schema = z.object({
  divisor: z.number().positive(),
});

/**
 * Como agrega un factor los aportes de sus reglas (ver `ModoAgregacion`).
 *
 * `tope` quedo OPCIONAL y el panel ya no lo edita: el tope de todo factor es
 * `CRITICIDAD_MAX`, porque los cinco factores se promedian entre si y solo son
 * comparables en la misma escala 0-5. Se acepta todavia porque las versiones ya
 * guardadas son inmutables y lo traen; `agregar()` usa CRITICIDAD_MAX si falta.
 */
const factorConfigSchema = z.object({
  modo: z.enum(['suma', 'max', 'promedio']),
  tope: puntajeSchema.optional(),
});

/** Los factores alimentados por el cuestionario. F1 y F4 no salen de preguntas. */
const factorCuestionarioSchema = z.enum(['f2', 'f3', 'f5']);

/** Una pregunta puntuando un factor, por codigo de pregunta y de opcion. */
const reglaPuntajeSchema = z.object({
  preguntaCodigo: codigoSchema,
  factor: factorCuestionarioSchema,
  peso: z.number().positive().max(10).optional(),
  opciones: z
    .record(codigoSchema, puntajeSchema)
    .refine((tabla) => Object.keys(tabla).length > 0, {
      message: 'La regla no puede quedar sin opciones puntuadas.',
    }),
});

/**
 * Regla que actua sobre el resultado: "si responden X, entonces <efecto>".
 * `valor` se valida contra el efecto: un nivel minimo es 0-3 (hay 4 niveles), una
 * suma a la criticidad es 0-5 (la escala de la criticidad).
 */
const reglaEspecialSchema = z
  .object({
    nombre: z.string().trim().min(1, 'Ponele un nombre a la regla.').max(120),
    preguntaCodigo: codigoSchema,
    opcionCodigos: z.array(codigoSchema).min(1, 'Hay que elegir al menos una opcion.'),
    efecto: z.enum(['nivelMinimo', 'sumarCriticidad']),
    valor: z.number(),
  })
  .refine(
    (regla) =>
      regla.efecto === 'nivelMinimo'
        ? Number.isInteger(regla.valor) && regla.valor >= 0 && regla.valor <= 3
        : regla.valor >= 0 && regla.valor <= 5,
    {
      message: 'El nivel minimo va de 0 a 3 y tiene que ser un numero entero; lo que se suma a la criticidad, de 0 a 5.',
      path: ['valor'],
    },
  );

const puntajesSchema = z
  .object({
    f1: tablaF1Schema,
    f4: tablaF4Schema,
    factores: z.object({
      f2: factorConfigSchema,
      f3: factorConfigSchema,
      f5: factorConfigSchema,
    }),
    reglas: z.array(reglaPuntajeSchema),
    reglasEspeciales: z.array(reglaEspecialSchema),
  })
  // Dos reglas de la misma pregunta al mismo factor serian ambiguas (¿suman dos
  // veces?). La misma pregunta en factores DISTINTOS si es valido.
  .refine(
    (puntajes) => {
      const claves = puntajes.reglas.map((regla) => `${regla.factor}:${regla.preguntaCodigo}`);
      return new Set(claves).size === claves.length;
    },
    {
      message: 'Hay dos reglas para la misma pregunta en el mismo factor.',
      path: ['reglas'],
    },
  );

/**
 * Body para crear una nueva version de la configuracion de criticidad (ERS §8).
 * El PUT no edita: crea una version nueva e inmutable y la marca activa.
 */
export const actualizarConfiguracionSchema = z.object({
  pesos: pesosSchema,
  puntajes: puntajesSchema,
  umbralesNivel: umbralesSchema,
  radioMetros: z.number().int().positive(),
  ventanaDias: z.number().int().positive(),
  minReportes: z.number().int().positive(),
  limitesAntiabuso: limitesSchema,
  /**
   * LEGADO. Era el monto del bonus por lugar vulnerable, cuando esa regla estaba
   * cableada en el motor. Hoy cada regla especial lleva su propio `valor`, asi que
   * el motor ya no lo lee. Se mantiene opcional para no invalidar las versiones
   * viejas del historial, que lo tienen guardado.
   */
  bonusVulnerable: z.number().min(0).max(5).optional().default(0),
});

/** Query del listado de versiones (`GET /admin/configuracion/versiones`). */
export const versionesQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

export const versionIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

// --- Transporte SMTP (`ConfiguracionNotificacion`) ---------------------------

/**
 * Body de `PUT /admin/configuracion/notificaciones`. SOLO TRANSPORTE: con que
 * servidor se manda. El remitente vive en `/webhooks/remitente` y los
 * destinatarios en cada `ReglaWebhook`, porque son decisiones de otra naturaleza
 * (y de otro momento) que la de apuntar a un servidor SMTP.
 *
 * `smtpContrasena` es OPCIONAL y eso es parte del contrato, no un descuido: la
 * API nunca devuelve la contrasena guardada, asi que el panel no puede
 * reenviarla. Omitirla = "dejar la que ya esta". Mandar `null` = "borrarla"
 * (servidor SMTP sin autenticacion). Mandar un string = reemplazarla.
 *
 * El host solo es obligatorio si `smtpHabilitado` es true: guardar la config a
 * medio cargar con el canal apagado tiene que poder hacerse.
 */
export const actualizarNotificacionSchema = z
  .object({
    smtpHabilitado: z.boolean(),
    smtpHost: z.string().trim().max(255).optional().default(''),
    smtpPuerto: z.number().int().min(1).max(65535).optional().default(587),
    smtpSeguridad: z.enum(['NINGUNA', 'STARTTLS', 'SSL_TLS']).optional().default('STARTTLS'),
    smtpUsuario: z.string().trim().max(255).optional().default(''),
    smtpContrasena: z.string().min(1).max(255).nullable().optional(),
  })
  .refine((config) => !config.smtpHabilitado || config.smtpHost.length > 0, {
    message: 'Con el envio de correos habilitado hay que indicar la direccion del servidor de correo.',
    path: ['smtpHost'],
  });

/** Body del envio de prueba. El destinatario no se guarda en ningun lado. */
export const probarNotificacionSchema = z.object({
  destinatario: z.string().trim().email('Indica un correo valido para la prueba.'),
});

export type ActualizarConfiguracionBody = z.infer<typeof actualizarConfiguracionSchema>;
export type VersionesQuery = z.infer<typeof versionesQuerySchema>;
export type ActualizarNotificacionBody = z.infer<typeof actualizarNotificacionSchema>;
export type ProbarNotificacionBody = z.infer<typeof probarNotificacionSchema>;
