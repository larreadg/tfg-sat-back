import fs from 'fs';
import path from 'path';
import { EstadoEvaluacionIa, TipoPregunta } from '@prisma/client';
import { prisma } from '../config/prisma';
import { openai } from '../config/openai';
import { env } from '../config/env';
import { PROMPT_VERSION, SYSTEM_PROMPT_EVALUACION_IA, EVALUACION_IA_JSON_SCHEMA } from './evaluacionIa.prompt';
import { EvaluacionIaResultado, ReporteParaEvaluar } from '../models/evaluacionIa.model';

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
      validacionSms: {
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

  const respuestas = evaluacion.validacionSms.respuestas
    .filter((respuesta) => respuesta.pregunta.tipo !== TipoPregunta.FOTO)
    .map((respuesta) => ({
      preguntaTexto: respuesta.pregunta.texto,
      opcionesTexto: respuesta.opciones.map((opcion) => opcion.preguntaOpcion.texto),
    }));

  const fotos = evaluacion.validacionSms.respuestas
    .flatMap((respuesta) => respuesta.archivos)
    .map((archivo) => ({
      respuestaArchivoId: archivo.id,
      url: archivo.url,
      orden: archivo.orden,
    }));

  const primeraRespuesta = evaluacion.validacionSms.respuestas[0];

  return {
    evaluacionId: evaluacion.id,
    validacionSmsId: evaluacion.validacionSmsId,
    canal: primeraRespuesta.canal,
    latitud: primeraRespuesta.latitud,
    longitud: primeraRespuesta.longitud,
    fechaCreacion: primeraRespuesta.fechaCreacion,
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
        where: { validacionSmsId: reporte.validacionSmsId },
        data: { evaluadoIa: true },
      });
    });
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : 'Error desconocido evaluando el reporte.';

    await prisma.evaluacionIa.update({
      where: { id: evaluacionId },
      data: {
        estado: EstadoEvaluacionIa.ERROR,
        intentos: { increment: 1 },
        errorMensaje: mensaje,
      },
    });
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
