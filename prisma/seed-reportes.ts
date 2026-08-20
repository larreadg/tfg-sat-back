/**
 * Seed de 30 reportes ciudadanos sinteticos sobre posible contaminacion del
 * agua en el area del Acuifero Patino (Paraguay). Datos de demostracion para
 * desarrollo: NO son denuncias reales ni diagnosticos oficiales.
 *
 * A diferencia de un seed "de tabla", este script no inserta filas a mano:
 * cada reporte se crea llamando al servicio real `guardarRespuestas` (el
 * mismo que usa el endpoint de envio de reportes ciudadanos), leido desde el
 * build compilado en dist/. Asi los 30 registros pasan por las mismas
 * validaciones y efectos secundarios (compresion de fotos, creacion de la
 * EvaluacionIa en PENDIENTE, etc.) que un reporte real, y no son distinguibles
 * en el modelo de datos de un envio genuino. Lo unico que se evita es el flujo
 * real de SMS/captcha: se crea el UsuarioCiudadano/ValidacionSms ya
 * verificados, replicando exactamente lo que persiste
 * sms.service.verificarCodigo, sin mandar SMS ni resolver captcha reales.
 *
 * Importante: este seed NO completa ni simula la EvaluacionIa. La deja tal
 * cual la crea guardarRespuestas (estado PENDIENTE). La evaluacion real de
 * riesgo la hace el cron ya existente (src/jobs/evaluacionIa.job.ts ->
 * procesarPendientes -> evaluarReporte), que llama a la IA real sobre las
 * fotos sembradas. Para que eso ocurra, el servidor (con el cron corriendo)
 * tiene que estar levantado.
 *
 * Requiere:
 *   - Que las imagenes ya esten descargadas (ver prisma/download-seed-images.ts
 *     y docs/seed-reportes-imagenes.md).
 *   - Que el proyecto este compilado (`npm run build`) para poder requerir
 *     dist/services/reporteCiudadano.service.js. El script npm "seed:reportes"
 *     ya encadena el build automaticamente.
 *
 * Uso:
 *   npm run seed:reportes
 *
 * Idempotencia: al inicio de cada corrida se eliminan unicamente los
 * registros (UsuarioCiudadano/ValidacionSms/Respuesta/RespuestaOpcion/
 * RespuestaArchivo/EvaluacionIa/EvaluacionIaFoto) y los archivos de fotos
 * fisicos que pertenecen a los 30 telefonos reservados de este seed, y se
 * vuelven a crear desde cero. La Encuesta/Pregunta/PreguntaOpcion se
 * reutilizan (upsert), nunca se borran. Ejecutar el seed N veces deja siempre
 * exactamente 30 reportes sinteticos.
 */
const fs = require('node:fs');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');
const encuestaAgua = require('./seed-encuesta-agua.ts');
const { REPORTES } = require('./seed-data/reportes.data.ts');

const DIST_DIR = path.join(process.cwd(), 'dist');
let reporteCiudadanoService;
let prismaDist;
try {
  reporteCiudadanoService = require(path.join(DIST_DIR, 'services', 'reporteCiudadano.service.js'));
  prismaDist = require(path.join(DIST_DIR, 'config', 'prisma.js')).prisma;
} catch (error) {
  console.error(
    'No se pudo cargar dist/services/reporteCiudadano.service.js. Este seed reutiliza el servicio real ' +
      'de guardado de reportes, por eso necesita el proyecto compilado. Corre "npm run build" antes (o usa ' +
      '"npm run seed:reportes", que ya lo hace automaticamente).',
  );
  throw error;
}

const prisma = new PrismaClient();

const UPLOADS_DIR = process.env.UPLOADS_DIR || 'uploads';
const UPLOADS_BASE_URL = process.env.UPLOADS_BASE_URL || '/uploads';
const CARPETA_IMAGENES_SEED = path.join(process.cwd(), UPLOADS_DIR, 'seed-reportes');
const PREFIJO_URL_REPORTE_CIUDADANO = `${UPLOADS_BASE_URL}/reporte-ciudadano/`;

const PREGUNTA_FOTO_TEXTO = 'Fotos (hasta 3)';

const RANGOS_RIESGO = {
  RIESGO_ALTO: [4, 5],
  RIESGO_MEDIO: [3, 3],
  RIESGO_BAJO: [1, 2],
  SIN_INDICIOS: [0, 0],
};

const LAT_MIN = -25.65;
const LAT_MAX = -25.03;
const LON_MIN = -57.7;
const LON_MAX = -57.06;

// ---------------------------------------------------------------------------
// Validaciones previas (no tocan la base de datos)
// ---------------------------------------------------------------------------

function validarDatasetEstatico() {
  const errores = [];

  if (REPORTES.length !== 30) {
    errores.push(`Se esperaban 30 reportes, se encontraron ${REPORTES.length}.`);
  }

  const telefonos = new Set();
  const archivosVistos = new Set();
  const preguntaTextos = encuestaAgua.PREGUNTAS.filter((p) => p.tipo !== 'FOTO').map((p) => p.texto);
  const opcionesPorPregunta = new Map(
    encuestaAgua.PREGUNTAS.map((p) => [p.texto, new Set(p.opciones)]),
  );

  const contadores = {
    RIESGO_ALTO: 0,
    RIESGO_MEDIO: 0,
    RIESGO_BAJO: 0,
    SIN_INDICIOS: 0,
  };
  let totalImagenes = 0;

  for (const reporte of REPORTES) {
    const prefijo = `Reporte ${reporte.codigo}:`;

    if (telefonos.has(reporte.telefono)) {
      errores.push(`${prefijo} telefono duplicado ${reporte.telefono}.`);
    }
    telefonos.add(reporte.telefono);

    if (!/^\+?\d{6,15}$/.test(reporte.telefono)) {
      errores.push(`${prefijo} telefono con formato invalido ${reporte.telefono}.`);
    }

    if (!RANGOS_RIESGO[reporte.clasificacionEsperada]) {
      errores.push(`${prefijo} clasificacionEsperada invalida ${reporte.clasificacionEsperada}.`);
    } else {
      const [min, max] = RANGOS_RIESGO[reporte.clasificacionEsperada];
      if (
        !Number.isInteger(reporte.riesgoScore) ||
        reporte.riesgoScore < 0 ||
        reporte.riesgoScore > 5
      ) {
        errores.push(`${prefijo} riesgoScore fuera de rango 0-5 (${reporte.riesgoScore}).`);
      } else if (reporte.riesgoScore < min || reporte.riesgoScore > max) {
        errores.push(
          `${prefijo} riesgoScore ${reporte.riesgoScore} no corresponde a ${reporte.clasificacionEsperada} (esperado ${min}-${max}).`,
        );
      }
      contadores[reporte.clasificacionEsperada] += 1;
    }

    const lat = reporte.ubicacion?.latitud;
    const lon = reporte.ubicacion?.longitud;
    if (typeof lat !== 'number' || lat < LAT_MIN || lat > LAT_MAX) {
      errores.push(`${prefijo} latitud fuera del rango del Acuifero Patino (${lat}).`);
    }
    if (typeof lon !== 'number' || lon < LON_MIN || lon > LON_MAX) {
      errores.push(`${prefijo} longitud fuera del rango del Acuifero Patino (${lon}).`);
    }

    for (const preguntaTexto of preguntaTextos) {
      const opcionElegida = reporte.respuestas[preguntaTexto];
      if (!opcionElegida) {
        errores.push(`${prefijo} falta respuesta para la pregunta "${preguntaTexto}".`);
        continue;
      }
      const opcionesValidas = opcionesPorPregunta.get(preguntaTexto);
      if (!opcionesValidas || !opcionesValidas.has(opcionElegida)) {
        errores.push(
          `${prefijo} opcion invalida "${opcionElegida}" para la pregunta "${preguntaTexto}".`,
        );
      }
    }
    const clavesRespuestas = Object.keys(reporte.respuestas);
    if (clavesRespuestas.length !== preguntaTextos.length) {
      errores.push(
        `${prefijo} cantidad de respuestas (${clavesRespuestas.length}) distinta a la cantidad de preguntas no-FOTO (${preguntaTextos.length}).`,
      );
    }

    if (!Array.isArray(reporte.imagenes) || reporte.imagenes.length < 2) {
      errores.push(`${prefijo} debe tener al menos 2 imagenes.`);
    } else {
      for (const imagen of reporte.imagenes) {
        if (archivosVistos.has(imagen.archivo)) {
          errores.push(`${prefijo} archivo de imagen repetido entre reportes: ${imagen.archivo}.`);
        }
        archivosVistos.add(imagen.archivo);

        const rutaLocal = path.join(CARPETA_IMAGENES_SEED, imagen.archivo);
        if (!fs.existsSync(rutaLocal)) {
          errores.push(
            `${prefijo} falta el archivo local ${rutaLocal}. Corre primero la descarga de imagenes.`,
          );
        }

        if (
          !Number.isInteger(imagen.riesgoFoto) ||
          imagen.riesgoFoto < 0 ||
          imagen.riesgoFoto > 5
        ) {
          errores.push(`${prefijo} riesgoFoto invalido para ${imagen.archivo} (${imagen.riesgoFoto}).`);
        }
      }
      totalImagenes += reporte.imagenes.length;
    }

    if (
      !reporte.evaluacion?.resumen ||
      !reporte.evaluacion?.justificacion ||
      !reporte.evaluacion?.recomendacion
    ) {
      errores.push(`${prefijo} falta resumen/justificacion/recomendacion de la evaluacion.`);
    }
  }

  if (telefonos.size !== 30) {
    errores.push(`Se esperaban 30 telefonos unicos, se encontraron ${telefonos.size}.`);
  }
  if (contadores.RIESGO_ALTO !== 7) {
    errores.push(`Se esperaban 7 reportes RIESGO_ALTO, se encontraron ${contadores.RIESGO_ALTO}.`);
  }
  if (contadores.RIESGO_MEDIO !== 8) {
    errores.push(`Se esperaban 8 reportes RIESGO_MEDIO, se encontraron ${contadores.RIESGO_MEDIO}.`);
  }
  if (contadores.RIESGO_BAJO !== 5) {
    errores.push(`Se esperaban 5 reportes RIESGO_BAJO, se encontraron ${contadores.RIESGO_BAJO}.`);
  }
  if (contadores.SIN_INDICIOS !== 10) {
    errores.push(`Se esperaban 10 reportes SIN_INDICIOS, se encontraron ${contadores.SIN_INDICIOS}.`);
  }
  if (totalImagenes < 60) {
    errores.push(`Se esperaban al menos 60 imagenes en total, se encontraron ${totalImagenes}.`);
  }

  if (errores.length > 0) {
    console.error('Validacion del dataset de reportes fallo:');
    for (const error of errores) {
      console.error(`  - ${error}`);
    }
    throw new Error(`El dataset de reportes tiene ${errores.length} error(es). Se aborta el seed.`);
  }

  return { totalImagenes, contadores };
}

// ---------------------------------------------------------------------------
// Encuesta / preguntas / opciones (reutiliza seed-encuesta-agua.ts)
// ---------------------------------------------------------------------------

async function asegurarEncuestaYPreguntas(tx) {
  const encuesta = await encuestaAgua.sembrarEncuesta(tx, null);

  const preguntaIdPorTexto = new Map();
  const opcionIdPorPreguntaYTexto = new Map();
  const preguntaIdsVigentes = [];

  for (const [indice, definicionPregunta] of encuestaAgua.PREGUNTAS.entries()) {
    const pregunta = await encuestaAgua.sembrarPregunta(tx, definicionPregunta, null);
    await encuestaAgua.sembrarOpciones(tx, pregunta.id, definicionPregunta.opciones, null);
    await encuestaAgua.sembrarEncuestaPregunta(tx, encuesta.id, pregunta.id, indice);

    preguntaIdsVigentes.push(pregunta.id);
    preguntaIdPorTexto.set(definicionPregunta.texto, pregunta.id);

    const opciones = await tx.preguntaOpcion.findMany({ where: { preguntaId: pregunta.id } });
    opcionIdPorPreguntaYTexto.set(pregunta.id, new Map(opciones.map((o) => [o.texto, o.id])));
  }

  await encuestaAgua.eliminarPreguntasObsoletas(tx, encuesta.id, preguntaIdsVigentes);

  return {
    encuestaId: encuesta.id,
    preguntaIdPorTexto,
    opcionIdPorPreguntaYTexto,
    totalPreguntas: encuestaAgua.PREGUNTAS.length,
    totalOpciones: encuestaAgua.PREGUNTAS.reduce((acc, p) => acc + p.opciones.length, 0),
  };
}

// ---------------------------------------------------------------------------
// Limpieza idempotente (solo registros de los telefonos reservados del seed)
// ---------------------------------------------------------------------------

function rutaFisicaDeReporteCiudadano(url) {
  if (typeof url !== 'string' || !url.startsWith(PREFIJO_URL_REPORTE_CIUDADANO)) {
    return null;
  }
  const rutaRelativa = url.slice(UPLOADS_BASE_URL.length + 1);
  return path.join(process.cwd(), UPLOADS_DIR, rutaRelativa);
}

async function limpiarReportesSeedPrevios(tx, telefonosReservados) {
  const usuarios = await tx.usuarioCiudadano.findMany({
    where: { telefono: { in: telefonosReservados } },
    select: { id: true },
  });
  const usuarioIds = usuarios.map((u) => u.id);
  if (usuarioIds.length === 0) {
    return;
  }

  const validaciones = await tx.validacionSms.findMany({
    where: { usuarioCiudadanoId: { in: usuarioIds } },
    select: { id: true },
  });
  const validacionIds = validaciones.map((v) => v.id);

  const respuestas = await tx.respuesta.findMany({
    where: { validacionSmsId: { in: validacionIds } },
    select: { id: true },
  });
  const respuestaIds = respuestas.map((r) => r.id);

  const archivos = await tx.respuestaArchivo.findMany({
    where: { respuestaId: { in: respuestaIds } },
    select: { id: true, url: true },
  });
  const archivoIds = archivos.map((a) => a.id);

  // Las fotos reales quedan guardadas por el servicio bajo uploads/reporte-ciudadano/...
  // (nombres con UUID). Se borran del disco antes de borrar las filas para no
  // dejar archivos huerfanos en corridas sucesivas. Nunca se toca
  // uploads/seed-reportes (son las imagenes fuente, de solo lectura).
  for (const archivo of archivos) {
    const rutaFisica = rutaFisicaDeReporteCiudadano(archivo.url);
    if (rutaFisica) {
      try {
        fs.rmSync(rutaFisica, { force: true });
      } catch {
        // Best-effort: si el archivo ya no existe o esta bloqueado, se ignora.
      }
    }
  }

  await tx.evaluacionIaFoto.deleteMany({ where: { respuestaArchivoId: { in: archivoIds } } });
  await tx.evaluacionIa.deleteMany({ where: { validacionSmsId: { in: validacionIds } } });
  await tx.respuestaOpcion.deleteMany({ where: { respuestaId: { in: respuestaIds } } });
  await tx.respuestaArchivo.deleteMany({ where: { respuestaId: { in: respuestaIds } } });
  await tx.respuesta.deleteMany({ where: { id: { in: respuestaIds } } });
  await tx.validacionSms.deleteMany({ where: { id: { in: validacionIds } } });
  await tx.usuarioCiudadano.deleteMany({ where: { id: { in: usuarioIds } } });
}

// ---------------------------------------------------------------------------
// Persistencia de un reporte completo, via el servicio real de la app
// ---------------------------------------------------------------------------

/**
 * Crea UsuarioCiudadano + ValidacionSms verificados replicando exactamente lo
 * que persiste sms.service.verificarCodigo al validar un codigo real (mismo
 * upsert por telefono, mismos campos), sin mandar SMS ni resolver captcha.
 */
async function crearIdentidadVerificada(reporte) {
  const usuarioCiudadano = await prisma.usuarioCiudadano.upsert({
    where: { telefono: reporte.telefono },
    update: {},
    create: { telefono: reporte.telefono },
  });

  const fechaReporte = new Date(reporte.fecha);
  const validacionSms = await prisma.validacionSms.create({
    data: {
      telefono: reporte.telefono,
      ip: '127.0.0.1',
      codigo: reporte.codigoValidacion,
      intentos: 0,
      expiracion: new Date(fechaReporte.getTime() + 5 * 60 * 1000),
      verificado: true,
      usuarioCiudadanoId: usuarioCiudadano.id,
    },
  });

  return { usuarioCiudadano, validacionSms };
}

function construirArchivoMulter(rutaLocal) {
  const buffer = fs.readFileSync(rutaLocal);
  return {
    fieldname: 'fotos',
    originalname: path.basename(rutaLocal),
    encoding: '7bit',
    mimetype: 'image/webp',
    buffer,
    size: buffer.length,
  };
}

async function crearReporte(reporte, contexto) {
  const fechaReporte = new Date(reporte.fecha);

  const { usuarioCiudadano, validacionSms } = await crearIdentidadVerificada(reporte);

  const ciudadano = {
    etapa: 'ciudadano-session',
    usuarioCiudadanoId: usuarioCiudadano.id,
    telefono: reporte.telefono,
    validacionSmsId: validacionSms.id,
  };

  const respuestasInput = Object.entries(reporte.respuestas).map(([preguntaTexto, opcionTexto]) => {
    const preguntaId = contexto.preguntaIdPorTexto.get(preguntaTexto);
    const opcionId = contexto.opcionIdPorPreguntaYTexto.get(preguntaId).get(opcionTexto);
    return { preguntaId, preguntaOpcionIds: [opcionId] };
  });

  const input = {
    encuestaId: contexto.encuestaId,
    respuestas: respuestasInput,
    latitud: reporte.ubicacion.latitud,
    longitud: reporte.ubicacion.longitud,
  };

  const archivosMulter = reporte.imagenes.map((imagen) =>
    construirArchivoMulter(path.join(CARPETA_IMAGENES_SEED, imagen.archivo)),
  );

  // Llama al servicio real de la app: valida el payload contra la encuesta
  // activa, comprime y guarda las fotos, crea Respuesta/RespuestaOpcion/
  // RespuestaArchivo y una EvaluacionIa en PENDIENTE. Es el mismo codigo que
  // ejecuta el endpoint de envio de reportes ciudadanos.
  const creado = await reporteCiudadanoService.guardarRespuestas(ciudadano, input, archivosMulter);

  // El servicio fija canal=WEB siempre (no existe canal WHATSAPP implementado
  // aun) y usa fechaCreacion=now(). Se retoca esa metadata para reflejar el
  // guion temporal/canal del dataset de demo, sin tocar el contenido del
  // reporte que ya paso por la logica real.
  await prisma.usuarioCiudadano.update({
    where: { id: usuarioCiudadano.id },
    data: { fechaCreacion: fechaReporte, fechaActualizacion: fechaReporte },
  });
  await prisma.validacionSms.update({
    where: { id: validacionSms.id },
    data: { fechaCreacion: fechaReporte },
  });
  await prisma.respuesta.updateMany({
    where: { validacionSmsId: validacionSms.id },
    data: {
      canal: reporte.canal,
      fechaCreacion: fechaReporte,
      fechaActualizacion: fechaReporte,
    },
  });

  const preguntaFotoId = contexto.preguntaIdPorTexto.get(PREGUNTA_FOTO_TEXTO);
  const respuestaFoto = await prisma.respuesta.findFirst({
    where: { validacionSmsId: validacionSms.id, preguntaId: preguntaFotoId },
    include: { archivos: { orderBy: { orden: 'asc' } } },
  });

  if (!respuestaFoto || respuestaFoto.archivos.length !== reporte.imagenes.length) {
    throw new Error(
      `Reporte ${reporte.codigo}: se esperaban ${reporte.imagenes.length} RespuestaArchivo y se encontraron ${respuestaFoto?.archivos.length ?? 0}.`,
    );
  }

  // La EvaluacionIa queda como la crea guardarRespuestas: en PENDIENTE. Este
  // seed NO la completa ni la simula: el cron real (src/jobs/evaluacionIa.job.ts)
  // es el que debe procesarla llamando a la IA de verdad sobre estas fotos.
  return {
    respuestasCreadas: creado.respuestaIds.length,
    archivosCreados: respuestaFoto.archivos.length,
  };
}

// ---------------------------------------------------------------------------
// Orquestacion principal
// ---------------------------------------------------------------------------

async function main() {
  validarDatasetEstatico();

  const telefonosReservados = REPORTES.map((r) => r.telefono);

  const contexto = await prisma.$transaction(async (tx) => {
    const contextoEncuesta = await asegurarEncuestaYPreguntas(tx);
    await limpiarReportesSeedPrevios(tx, telefonosReservados);
    return contextoEncuesta;
  });

  let respuestasCreadas = 0;
  let archivosCreados = 0;
  const contadores = { RIESGO_ALTO: 0, RIESGO_MEDIO: 0, RIESGO_BAJO: 0, SIN_INDICIOS: 0 };

  for (const reporte of REPORTES) {
    const resultadoReporte = await crearReporte(reporte, contexto);
    respuestasCreadas += resultadoReporte.respuestasCreadas;
    archivosCreados += resultadoReporte.archivosCreados;
    contadores[reporte.clasificacionEsperada] += 1;
  }

  const conIndicios = contadores.RIESGO_ALTO + contadores.RIESGO_MEDIO + contadores.RIESGO_BAJO;

  console.log('Seed de reportes completado (via servicio real guardarRespuestas):');
  console.log(`- Encuesta: 1`);
  console.log(`- Preguntas: ${contexto.totalPreguntas}`);
  console.log(`- Opciones: ${contexto.totalOpciones}`);
  console.log(`- Ciudadanos: ${REPORTES.length}`);
  console.log(`- Validaciones verificadas: ${REPORTES.length}`);
  console.log(`- Reportes completos: ${REPORTES.length}`);
  console.log(`- Respuestas registradas: ${respuestasCreadas}`);
  console.log(`- Archivos asociados: ${archivosCreados}`);
  console.log(`- Evaluaciones IA creadas en PENDIENTE (a procesar por el cron real): ${REPORTES.length}`);
  console.log('');
  console.log('Distribucion esperada del dataset (clasificacion de diseno, no persistida):');
  console.log(`- Reportes con indicios: ${conIndicios} (alto ${contadores.RIESGO_ALTO} / medio ${contadores.RIESGO_MEDIO} / bajo ${contadores.RIESGO_BAJO})`);
  console.log(`- Reportes sin indicios: ${contadores.SIN_INDICIOS}`);
}

main()
  .catch((error) => {
    console.error('Error ejecutando el seed de reportes.');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await prismaDist.$disconnect();
  });
