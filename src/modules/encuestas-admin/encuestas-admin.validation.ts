import { z } from 'zod';
import { TipoPregunta } from '@prisma/client';

/** Tope duro de fotos por reporte (coincide con el limite del middleware de upload). */
export const FOTOS_TOPE_ABSOLUTO = 10;

/**
 * `codigo` estable de pregunta u opcion. Opcional en la entrada: si no viene, el
 * servicio lo deriva del texto (`derivarCodigo`). Lo que NO hace el servicio es
 * inventarlo distinto en cada version — al clonar se hereda, que es lo que permite
 * que las reglas del motor sobrevivan al versionado.
 */
const codigoInputSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Z][A-Z0-9_]*$/, 'El codigo debe ser MAYUSCULAS_CON_GUION_BAJO y empezar con una letra.')
  .optional();

const opcionInputSchema = z.object({
  texto: z.string().trim().min(1).max(255),
  codigo: codigoInputSchema,
  orden: z.number().int().min(0).optional(),
});

/**
 * Regla de coherencia tipo↔opciones: las preguntas de eleccion requieren al
 * menos 2 opciones; las de tipo FOTO no llevan opciones.
 */
const preguntaInputSchema = z
  .object({
    texto: z.string().trim().min(1).max(500),
    codigo: codigoInputSchema,
    tipo: z.nativeEnum(TipoPregunta),
    orden: z.number().int().min(0).optional(),
    opciones: z.array(opcionInputSchema).default([]),
  })
  .refine((p) => (p.tipo === TipoPregunta.FOTO ? p.opciones.length === 0 : p.opciones.length >= 2), {
    message: 'Las preguntas de eleccion necesitan al menos 2 opciones; el paso de fotos no lleva opciones.',
    path: ['opciones'],
  });

/**
 * Fotos por version: `fotosMin >= 1` porque la foto NO es opcional; lo
 * configurable es cuantas se piden.
 */
const fotosMinSchema = z.number().int().min(1).max(FOTOS_TOPE_ABSOLUTO);
const fotosMaxSchema = z.number().int().min(1).max(FOTOS_TOPE_ABSOLUTO);

export const crearEncuestaSchema = z
  .object({
    nombre: z.string().trim().min(1).max(150),
    descripcion: z.string().trim().max(500).optional(),
    fotosMin: fotosMinSchema.default(1),
    fotosMax: fotosMaxSchema.default(3),
    preguntas: z.array(preguntaInputSchema).default([]),
  })
  .refine((d) => d.fotosMax >= d.fotosMin, {
    message: 'El maximo de fotos no puede ser menor al minimo.',
    path: ['fotosMax'],
  });

/**
 * Actualizacion parcial. El cruce `fotosMax >= fotosMin` se termina de validar
 * en el servicio contra lo ya guardado: aca puede venir solo uno de los dos.
 */
export const actualizarEncuestaSchema = z.object({
  nombre: z.string().trim().min(1).max(150).optional(),
  descripcion: z.string().trim().max(500).nullish(),
  activo: z.boolean().optional(),
  fotosMin: fotosMinSchema.optional(),
  fotosMax: fotosMaxSchema.optional(),
});

/**
 * Nueva version a partir de otra. El front arma el borrador entero (nombre,
 * fotos y preguntas) y lo confirma de una sola vez: nada se persiste mientras
 * se edita. Si no manda `preguntas`, se clona el contenido del origen.
 */
export const crearVersionSchema = z
  .object({
    nombre: z.string().trim().min(1).max(150).optional(),
    descripcion: z.string().trim().max(500).nullish(),
    fotosMin: fotosMinSchema.optional(),
    fotosMax: fotosMaxSchema.optional(),
    preguntas: z.array(preguntaInputSchema).optional(),
  })
  .refine((d) => d.fotosMin === undefined || d.fotosMax === undefined || d.fotosMax >= d.fotosMin, {
    message: 'El maximo de fotos no puede ser menor al minimo.',
    path: ['fotosMax'],
  });

/**
 * Reemplazo completo del contenido de un BORRADOR (version sin reportes). Es
 * el "guardar" del editor: llega todo junto y reemplaza lo que habia.
 */
export const reemplazarContenidoSchema = z
  .object({
    nombre: z.string().trim().min(1).max(150),
    descripcion: z.string().trim().max(500).nullish(),
    fotosMin: fotosMinSchema,
    fotosMax: fotosMaxSchema,
    preguntas: z.array(preguntaInputSchema),
  })
  .refine((d) => d.fotosMax >= d.fotosMin, {
    message: 'El maximo de fotos no puede ser menor al minimo.',
    path: ['fotosMax'],
  });

export const crearPreguntaSchema = preguntaInputSchema;

export const actualizarPreguntaSchema = z.object({
  texto: z.string().trim().min(1).max(500).optional(),
  codigo: codigoInputSchema,
  tipo: z.nativeEnum(TipoPregunta).optional(),
  activo: z.boolean().optional(),
  // Si viene, reemplaza el set de opciones (solo permitido si la pregunta no
  // tiene respuestas registradas).
  opciones: z.array(opcionInputSchema).optional(),
});

export const encuestaIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const preguntaIdParamSchema = z.object({
  preguntaId: z.coerce.number().int().positive(),
});

export type CrearEncuestaBody = z.infer<typeof crearEncuestaSchema>;
export type ActualizarEncuestaBody = z.infer<typeof actualizarEncuestaSchema>;
export type CrearVersionBody = z.infer<typeof crearVersionSchema>;
export type ReemplazarContenidoBody = z.infer<typeof reemplazarContenidoSchema>;
export type CrearPreguntaBody = z.infer<typeof crearPreguntaSchema>;
export type ActualizarPreguntaBody = z.infer<typeof actualizarPreguntaSchema>;
