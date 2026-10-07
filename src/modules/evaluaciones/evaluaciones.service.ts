import fs from 'fs';
import path from 'path';
import { EstadoEvaluacionIa, TipoPregunta } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { registrarAuditoria } from '../auditoria/auditoria.registro';
import { openai } from '../../config/openai';
import { env } from '../../config/env';
import { PROMPT_VERSION, SYSTEM_PROMPT_EVALUACION_IA, EVALUACION_IA_JSON_SCHEMA } from './evaluaciones.prompt';
import { procesarReportePostIa } from '../criticidad/criticidad.pipeline';
import { EvaluacionIaResultado, ReporteParaEvaluar } from './evaluaciones.types';

function resolverRutaArchivo(url: string): string {
  const rutaRelativa = url.slice(env.uploadsBaseUrl.length + 1);
  return path.join(process.cwd(), env.uploadsDir, rutaRelativa);
}

function fotoADataUri(url: string): string {
  const buffer = fs.readFileSync(resolverRutaArchivo(url));
  return `data:image/webp;base64,${buffer.toString('base64')}`;
}

async function cargarReporteParaEvaluar(evaluacionId: number): Promise<ReporteParaEvaluar> {
  const evaluacion = await prisma.evaluacionIa.findUniqueOrThrow({
    where: { id: evaluacionId },
    include: {
      reporte: {
        include: {
          respuestas: {
            orderBy: { fechaCreacion: 'asc' },
            include: {
              pregunta: true,
              opciones: { include: { preguntaOpcion: true } },
              archivos: { orderBy: { orden: 'asc' } },
            },
          },
        },
      },
    },
  });

  const respuestas = evaluacion.reporte.respuestas
    .filter((respuesta) => respuesta.pregunta.tipo !== TipoPregunta.FOTO)
    .map((respuesta) => ({
      preguntaTexto: respuesta.pregunta.texto,
      opcionesTexto: respuesta.opciones.map((opcion) => opcion.preguntaOpcion.texto),
    }));

  const fotos = evaluacion.reporte.respuestas
    .flatMap((respuesta) => respuesta.archivos)
    .map((archivo) => ({
      respuestaArchivoId: archivo.id,
      url: archivo.url,
      orden: archivo.orden,
    }));

  return {
    evaluacionId: evaluacion.id,
    reporteId: evaluacion.reporteId,
    codigoPublico: evaluacion.reporte.codigoPublico,
    canal: evaluacion.reporte.canal,
    latitud: evaluacion.reporte.latitud,
    longitud: evaluacion.reporte.longitud,
    fechaCreacion: evaluacion.reporte.fechaCreacion,
    respuestas,
    fotos,
  };
}

function construirMensajeUsuario(reporte: ReporteParaEvaluar) {
  const encabezado = [
    `Canal: ${reporte.canal}`,
    `Fecha del reporte: ${reporte.fechaCreacion.toISOString()}`,
    `Ubicacion: lat ${reporte.latitud}, long ${reporte.longitud}`,
    `Cantidad de fotos adjuntas: ${reporte.fotos.length}`,
  ].join('\n');

  const respuestasTexto = reporte.respuestas
    .map((respuesta) => `- ${respuesta.preguntaTexto} => ${respuesta.opcionesTexto.join(', ')}`)
    .join('\n');

  const textoPrincipal = `${encabezado}\n\nRespuestas del cuestionario:\n${respuestasTexto}`;

  const content: Array<
    { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }
  > = [{ type: 'text', text: textoPrincipal }];

  reporte.fotos.forEach((foto, indice) => {
    content.push({ type: 'text', text: `Foto ${indice}:` });
    content.push({ type: 'image_url', image_url: { url: fotoADataUri(foto.url) } });
  });

  return content;
}

function validarResultado(resultado: EvaluacionIaResultado, cantidadFotos: number): void {
  if (!Number.isInteger(resultado.riesgo) || resultado.riesgo < 0 || resultado.riesgo > 5) {
    throw new Error(`La IA devolvio un riesgo invalido: ${resultado.riesgo}`);
  }

  if (resultado.fotos.length !== cantidadFotos) {
    throw new Error(
      `La IA devolvio ${resultado.fotos.length} evaluaciones de foto, se esperaban ${cantidadFotos}.`,
    );
  }

  for (const foto of resultado.fotos) {
    if (!Number.isInteger(foto.riesgoFoto) || foto.riesgoFoto < 0 || foto.riesgoFoto > 5) {
      throw new Error(`La IA devolvio un riesgoFoto invalido: ${foto.riesgoFoto}`);
    }
  }
}

async function solicitarEvaluacion(reporte: ReporteParaEvaluar): Promise<EvaluacionIaResultado> {
  const respuesta = await openai.chat.completions.create({
    model: env.openaiModel,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT_EVALUACION_IA },
      { role: 'user', content: construirMensajeUsuario(reporte) },
    ],
    response_format: { type: 'json_schema', json_schema: EVALUACION_IA_JSON_SCHEMA },
  });

  const contenido = respuesta.choices[0]?.message?.content;
  if (!contenido) {
    throw new Error('La IA no devolvio contenido en la respuesta.');
  }

  const resultado = JSON.parse(contenido) as EvaluacionIaResultado;
  validarResultado(resultado, reporte.fotos.length);
  return resultado;
}

/** Etiqueta del actor SISTEMA del job de analisis. */
const ACTOR_JOB_IA = 'job-evaluacion-ia';

export async function evaluarReporte(evaluacionId: number): Promise<void> {
  await prisma.evaluacionIa.update({
    where: { id: evaluacionId },
    data: { estado: EstadoEvaluacionIa.PROCESANDO },
  });

  try {
    const reporte = await cargarReporteParaEvaluar(evaluacionId);
    const resultado = await solicitarEvaluacion(reporte);

    await prisma.$transaction(async (tx) => {
      await tx.evaluacionIa.update({
        where: { id: evaluacionId },
        data: {
          estado: EstadoEvaluacionIa.COMPLETADO,
          riesgoScore: resultado.riesgo,
          resumen: resultado.resumen,
          justificacion: resultado.justificacion,
          recomendacion: resultado.recomendacion,
          modelo: env.openaiModel,
          promptVersion: PROMPT_VERSION,
          errorMensaje: null,
        },
      });

      if (resultado.fotos.length > 0) {
        await tx.evaluacionIaFoto.createMany({
          data: resultado.fotos.map((foto, indice) => ({
            evaluacionId,
            respuestaArchivoId: reporte.fotos[indice].respuestaArchivoId,
            descripcion: foto.descripcion,
            riesgoFoto: foto.riesgoFoto,
          })),
        });
      }

      await tx.respuesta.updateMany({
        where: { reporteId: reporte.reporteId },
        data: { evaluadoIa: true },
      });
    });

    // Actor SISTEMA: esto lo escribe el cron, no una persona. Se audita porque el
    // resultado de la IA cambia la criticidad del reporte y, con ella, si se
    // genera una alerta: sin esta entrada, un reporte que "subio de nivel solo"
    // no tiene explicacion en ningun lado.
    registrarAuditoria({
      accion: 'EVALUACION_IA_COMPLETAR',
      entidadId: evaluacionId,
      descripcion: `El analisis de IA del reporte ${reporte.codigoPublico} dio riesgo ${resultado.riesgo}`,
      actor: { tipo: 'SISTEMA', etiqueta: ACTOR_JOB_IA },
      datosNuevos: {
        riesgoScore: resultado.riesgo,
        resumen: resultado.resumen,
        modelo: env.openaiModel,
        promptVersion: PROMPT_VERSION,
        fotosAnalizadas: resultado.fotos.length,
      },
      metadatos: { reporteId: reporte.reporteId, codigoPublico: reporte.codigoPublico },
    });
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : 'Error desconocido evaluando el reporte.';

    const fallida = await prisma.evaluacionIa.update({
      where: { id: evaluacionId },
      data: {
        estado: EstadoEvaluacionIa.ERROR,
        intentos: { increment: 1 },
        errorMensaje: mensaje,
      },
    });

    // El fallo tambien se audita: un reporte con el analisis en ERROR se calcula
    // SIN el factor F4 (se renormaliza), o sea que su criticidad sale de otra
    // formula que la del resto. Es la clase de cosa que hay que poder explicar.
    registrarAuditoria({
      accion: 'EVALUACION_IA_ERROR',
      entidadId: evaluacionId,
      descripcion: 'El analisis de IA de un reporte fallo',
      exito: false,
      actor: { tipo: 'SISTEMA', etiqueta: ACTOR_JOB_IA },
      metadatos: { reporteId: fallida.reporteId, intentos: fallida.intentos, detalle: mensaje },
    });
  }

  // Recalcular criticidad + alertas/puntos con el resultado de la IA (ERS §5): si
  // quedo COMPLETADO se incorpora F4; si quedo en ERROR, F4 se omite (renormaliza).
  const evaluacion = await prisma.evaluacionIa.findUnique({
    where: { id: evaluacionId },
    select: { reporteId: true },
  });
  if (evaluacion) {
    await procesarReportePostIa(evaluacion.reporteId);
  }
}

export async function procesarPendientes(): Promise<void> {
  const pendientes = await prisma.evaluacionIa.findMany({
    where: {
      OR: [
        { estado: EstadoEvaluacionIa.PENDIENTE },
        { estado: EstadoEvaluacionIa.ERROR, intentos: { lt: env.evaluacionIaMaxIntentos } },
      ],
    },
    orderBy: { fechaCreacion: 'asc' },
    take: env.evaluacionIaBatchSize,
  });

  for (const evaluacion of pendientes) {
    try {
      await evaluarReporte(evaluacion.id);
    } catch (err) {
      console.error(`Error procesando EvaluacionIa ${evaluacion.id}`, err);
    }
  }
}
