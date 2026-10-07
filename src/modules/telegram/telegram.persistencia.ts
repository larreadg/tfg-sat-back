import { Canal } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { guardarRespuestas } from '../reportes/reportes.service';
import { OrigenReporte } from '../reportes/reportes.types';
import { descargarArchivo } from './telegram.api';

/**
 * Puente de persistencia del bot: asegura el ciudadano y un ancla `ValidacionSms`
 * (sin OTP real) que sirve de clave de idempotencia del envio, y dispara el
 * MISMO caso de uso que el flujo web (`guardarRespuestas`) marcando canal
 * TELEGRAM. El `Reporte` resultante queda linkeado a esa ancla por
 * `validacionSmsId` (unico), de modo que un reintento del "confirmar" no crea un
 * reporte duplicado.
 */

export interface Anchor {
  usuarioCiudadanoId: number;
  validacionSmsId: number;
}

export interface DatosReporte {
  encuestaId: number;
  answers: Record<string, number>; // preguntaId -> preguntaOpcionId
  lat: number;
  lng: number;
  fotoFileIds: string[]; // 0..MAX_FOTOS fotos que el ciudadano cargo en el paso de foto
  /** Solo para identificar al actor en la auditoria (se guarda enmascarado). */
  telefono: string;
}

/**
 * Asegura el UsuarioCiudadano (llaveado por chatId de Telegram, reutilizando el
 * de un ciudadano web con el mismo telefono si existe) y crea la fila
 * ValidacionSms que ancla el reporte. Se hace en una transaccion. El id de la
 * ValidacionSms se guarda luego en la conversacion para que un reintento reuse
 * la misma ancla y no deje anclas huerfanas.
 */
export async function crearAnchor(chatId: bigint, telefono: string): Promise<Anchor> {
  return prisma.$transaction(async (tx) => {
    let ciudadano = await tx.usuarioCiudadano.findUnique({ where: { telegramChatId: chatId } });

    if (!ciudadano) {
      const porTelefono = await tx.usuarioCiudadano.findUnique({ where: { telefono } });
      if (porTelefono) {
        ciudadano = await tx.usuarioCiudadano.update({
          where: { id: porTelefono.id },
          data: { telegramChatId: chatId },
        });
      }
    }

    if (!ciudadano) {
      ciudadano = await tx.usuarioCiudadano.create({
        data: { telefono, telegramChatId: chatId },
      });
    }

    const validacion = await tx.validacionSms.create({
      data: {
        telefono,
        ip: 'telegram',
        codigo: '',
        expiracion: new Date(),
        verificado: true,
        usuarioCiudadanoId: ciudadano.id,
      },
    });

    return { usuarioCiudadanoId: ciudadano.id, validacionSmsId: validacion.id };
  });
}

export interface CiudadanoConocido {
  usuarioCiudadanoId: number;
  telefono: string;
}

/**
 * Busca un ciudadano ya conocido por el chatId de Telegram. El chatId lo
 * autentica Telegram y quedo asociado al ciudadano en su primer reporte
 * (`crearAnchor`), asi que si esta presente reusamos su telefono validado y le
 * evitamos volver a compartir el contacto.
 */
export async function buscarCiudadanoPorChat(chatId: bigint): Promise<CiudadanoConocido | null> {
  const ciudadano = await prisma.usuarioCiudadano.findUnique({ where: { telegramChatId: chatId } });
  if (!ciudadano) {
    return null;
  }
  return { usuarioCiudadanoId: ciudadano.id, telefono: ciudadano.telefono };
}

export interface ReporteAnterior {
  reporteId: number;
  fecha: Date;
  encuestaId: number;
  answers: Record<string, number>; // preguntaId -> preguntaOpcionId
  lineasResumen: string[]; // "texto pregunta -> texto opcion" (para mostrar)
}

/**
 * Ultimo reporte enviado por un ciudadano, reconstruido desde su `Reporte` +
 * `Respuesta`. Sirve para dos cosas: mostrarle un resumen de lo que reporto
 * antes y, si la encuesta activa no cambio, ofrecerle reenviar lo mismo
 * cambiando solo la ubicacion. Devuelve null si no tiene reportes con
 * respuestas de opcion.
 */
export async function ultimoReporte(usuarioCiudadanoId: number): Promise<ReporteAnterior | null> {
  const ultimo = await prisma.reporte.findFirst({
    where: { usuarioCiudadanoId },
    orderBy: { fechaCreacion: 'desc' },
    select: { id: true, encuestaId: true, fechaCreacion: true },
  });
  if (!ultimo) {
    return null;
  }

  const respuestas = await prisma.respuesta.findMany({
    where: { reporteId: ultimo.id },
    include: {
      pregunta: true,
      opciones: { include: { preguntaOpcion: true } },
    },
    orderBy: { id: 'asc' },
  });

  const answers: Record<string, number> = {};
  const lineasResumen: string[] = [];

  for (const respuesta of respuestas) {
    const opcion = respuesta.opciones[0]; // el bot usa eleccion unica; la FOTO no tiene opcion
    if (!opcion) {
      continue;
    }
    answers[String(respuesta.preguntaId)] = opcion.preguntaOpcionId;
    lineasResumen.push(`${respuesta.pregunta.texto} -> ${opcion.preguntaOpcion.texto}`);
  }

  if (Object.keys(answers).length === 0) {
    return null;
  }

  return {
    reporteId: ultimo.id,
    fecha: ultimo.fechaCreacion,
    encuestaId: ultimo.encuestaId,
    answers,
    lineasResumen,
  };
}

/**
 * Codigo publico del reporte asociado a un ancla (para la rama idempotente del
 * "confirmar" repetido). Devuelve null si aun no se creo el reporte.
 */
export async function codigoPublicoPorAnchor(validacionSmsId: number): Promise<string | null> {
  const reporte = await prisma.reporte.findUnique({
    where: { validacionSmsId },
    select: { codigoPublico: true },
  });
  return reporte?.codigoPublico ?? null;
}

export async function recuperarAnchor(validacionSmsId: number): Promise<Anchor | null> {
  const validacion = await prisma.validacionSms.findUnique({ where: { id: validacionSmsId } });
  if (!validacion || validacion.usuarioCiudadanoId == null) {
    return null;
  }
  return { usuarioCiudadanoId: validacion.usuarioCiudadanoId, validacionSmsId: validacion.id };
}

/**
 * Persiste el reporte reutilizando `guardarRespuestas`. Devuelve el codigo
 * publico de seguimiento. Propaga los errores para que el llamador decida
 * (reintento / idempotencia).
 */
export async function persistirReporte(anchor: Anchor, datos: DatosReporte): Promise<string> {
  // Bajamos todas las fotos en paralelo; guardarRespuestas valida el tope (MAX_FOTOS).
  const archivos = await Promise.all(datos.fotoFileIds.map(descargarFotoComoArchivo));

  const input = {
    encuestaId: datos.encuestaId,
    latitud: datos.lat,
    longitud: datos.lng,
    respuestas: Object.entries(datos.answers).map(([preguntaId, opcionId]) => ({
      preguntaId: Number(preguntaId),
      preguntaOpcionIds: [opcionId],
    })),
  };

  const origen: OrigenReporte = {
    usuarioCiudadanoId: anchor.usuarioCiudadanoId,
    validacionSmsId: anchor.validacionSmsId,
    telefono: datos.telefono,
  };

  const reporte = await guardarRespuestas(origen, input, archivos, Canal.TELEGRAM);
  return reporte.codigoPublico;
}

/**
 * Baja la foto de Telegram y la envuelve como un `Express.Multer.File` minimo:
 * el pipeline de compresion (`comprimirYGuardarFotos`) solo usa `.buffer`.
 */
async function descargarFotoComoArchivo(fileId: string): Promise<Express.Multer.File> {
  const buffer = await descargarArchivo(fileId);
  return { buffer } as Express.Multer.File;
}
