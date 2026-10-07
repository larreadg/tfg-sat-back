import { TelegramConversacion } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { ConflictError, TooManyRequestsError } from '../../shared/utils/errors';
import {
  TelegramCallbackQuery,
  TelegramMessage,
  TelegramUpdate,
} from './telegram.types';
import {
  answerCallbackQuery,
  editMessageText,
  sendMessage,
} from './telegram.api';
import * as M from './telegram.messages';
import { cargarEncuestaBot, EncuestaBot } from './telegram.encuesta';
import * as persistencia from './telegram.persistencia';
import { obtenerConfigFotosActiva } from '../encuestas/encuestas.service';

/**
 * Maquina de estados de la encuesta de Telegram. Todo el estado vive en la tabla
 * `TelegramConversacion` (una fila por chat), por lo que sobrevive a reinicios
 * del backend a mitad de una encuesta.
 */

const ESTADO = {
  PROPUESTA: 'PROPUESTA', // ciudadano conocido: ofrecemos repetir el ultimo reporte
  CONTACTO: 'CONTACTO',
  PREGUNTA: 'PREGUNTA',
  UBICACION: 'UBICACION',
  FOTO: 'FOTO',
  RESUMEN: 'RESUMEN',
  COMPLETADO: 'COMPLETADO',
} as const;

interface Parcial {
  answers: Record<string, number>; // preguntaId -> preguntaOpcionId
  anchorValidacionSmsId?: number;
  repetir?: boolean; // reenvio del reporte anterior: reusamos las respuestas y solo pedimos ubicacion + foto
  fotoFileIds?: string[]; // fotos cargadas en el paso FOTO (un album llega como varios updates)
}

// --- Entrada ----------------------------------------------------------------

export async function manejarUpdate(update: TelegramUpdate): Promise<void> {
  if (update.message) {
    await manejarMensaje(update.message);
  } else if (update.callback_query) {
    await manejarCallback(update.callback_query);
  }
}

// --- Mensajes (texto / contacto / ubicacion / foto) -------------------------

async function manejarMensaje(msg: TelegramMessage): Promise<void> {
  const chatId = msg.chat.id;
  const texto = msg.text?.trim();

  if (texto === '/start') {
    await comandoStart(chatId);
    return;
  }
  if (texto === '/cancelar') {
    await comandoCancelar(chatId);
    return;
  }
  if (texto === '/ayuda') {
    await sendMessage(chatId, M.AYUDA);
    return;
  }

  const convo = await cargarConvo(chatId);
  if (!convo || convo.estado === ESTADO.COMPLETADO) {
    await sendMessage(chatId, 'Escribi /start para iniciar un reporte.');
    return;
  }
  if (expirada(convo)) {
    await borrarConvo(chatId);
    await sendMessage(chatId, M.EXPIRADO);
    return;
  }

  switch (convo.estado) {
    case ESTADO.CONTACTO:
      if (msg.contact) {
        await procesarContacto(chatId, msg, convo);
      } else {
        await sendMessage(chatId, M.RECORDAR_CONTACTO, { replyMarkup: M.tecladoContacto() });
      }
      break;
    case ESTADO.UBICACION:
      if (msg.location) {
        await procesarUbicacion(chatId, msg.location.latitude, msg.location.longitude, convo);
      } else {
        await sendMessage(chatId, M.RECORDAR_UBICACION, { replyMarkup: M.tecladoUbicacion() });
      }
      break;
    case ESTADO.FOTO:
      if (msg.photo && msg.photo.length > 0) {
        const fileId = msg.photo[msg.photo.length - 1].file_id; // mayor resolucion
        await agregarFoto(chatId, fileId, convo);
      } else {
        await sendMessage(chatId, M.recordarFotoTxt((await obtenerConfigFotosActiva()).fotosMin));
      }
      break;
    default:
      // Foto tardia (p.ej. resto de un album) que aterriza cuando el paso de
      // foto ya se cerro (estado RESUMEN/COMPLETADO): la ignoramos en silencio.
      if (msg.photo && msg.photo.length > 0) {
        break;
      }
      // PREGUNTA / RESUMEN: se esperan botones, no texto libre.
      await sendMessage(chatId, M.USAR_BOTONES);
  }
}

// --- Callbacks (botones inline) ---------------------------------------------

async function manejarCallback(cb: TelegramCallbackQuery): Promise<void> {
  await answerCallbackQuery(cb.id).catch(() => undefined);

  const chatId = cb.message?.chat.id;
  const messageId = cb.message?.message_id;
  const data = cb.data;
  if (chatId === undefined || !data) {
    return;
  }

  const convo = await cargarConvo(chatId);
  if (!convo) {
    await sendMessage(chatId, 'Escribi /start para iniciar un reporte.');
    return;
  }
  if (expirada(convo)) {
    await borrarConvo(chatId);
    await sendMessage(chatId, M.EXPIRADO);
    return;
  }

  // Propuesta a un ciudadano conocido: reenviar el ultimo reporte o empezar uno nuevo.
  if (convo.estado === ESTADO.PROPUESTA) {
    if (data === M.CB.repetir) {
      await repetirReporte(chatId, convo, messageId);
    } else if (data === M.CB.nuevo) {
      await empezarNuevoConocido(chatId, convo, messageId);
    }
    return;
  }

  // Reentrada (se muestra al hacer /start con una encuesta a medias).
  if (data === M.CB.continuar) {
    await reanudar(chatId, convo);
    return;
  }
  if (data === M.CB.reiniciar) {
    await iniciarEncuesta(chatId);
    return;
  }

  const respuesta = M.parseRespuesta(data);
  if (respuesta && convo.estado === ESTADO.PREGUNTA) {
    await procesarRespuesta(chatId, convo, respuesta.paso, respuesta.indiceOpcion);
    return;
  }

  if (data === M.CB.atras) {
    await manejarAtras(chatId, convo);
    return;
  }
  if ((data === M.CB.omitirFoto || data === M.CB.listoFotos) && convo.estado === ESTADO.FOTO) {
    // Las fotos no son opcionales: el paso solo cierra con el minimo que exige
    // la version activa de la encuesta (si no, el envio fallaria al final).
    const { fotosMin } = await obtenerConfigFotosActiva();
    const cargadas = (leerParcial(convo).fotoFileIds ?? []).length;
    if (cargadas < fotosMin) {
      await sendMessage(chatId, M.recordarFotoTxt(fotosMin));
      return;
    }
    await finalizarFotos(chatId, convo);
    return;
  }
  if (data === M.CB.confirmar && convo.estado === ESTADO.RESUMEN) {
    await confirmar(chatId, convo);
    return;
  }
  if (data === M.CB.cancelar && convo.estado === ESTADO.RESUMEN) {
    await comandoCancelar(chatId, cb.message?.message_id);
    return;
  }
}

// --- Comandos ---------------------------------------------------------------

async function comandoStart(chatId: number): Promise<void> {
  const convo = await cargarConvo(chatId);
  const enProgreso =
    convo &&
    !expirada(convo) &&
    convo.estado !== ESTADO.COMPLETADO &&
    convo.estado !== ESTADO.CONTACTO &&
    convo.estado !== ESTADO.PROPUESTA;

  if (enProgreso) {
    await sendMessage(chatId, M.REENTRADA_TXT, { replyMarkup: M.tecladoReentrada() });
    return;
  }

  // Ciudadano ya conocido (chatId asociado en un reporte previo): reusamos su
  // telefono y, si su ultimo reporte sigue mapeando a la encuesta activa, le
  // ofrecemos reenviarlo cambiando solo la ubicacion.
  const conocido = await persistencia.buscarCiudadanoPorChat(BigInt(chatId));
  if (conocido) {
    const encuesta = await cargarEncuestaBot();
    const anterior = await persistencia.ultimoReporte(conocido.usuarioCiudadanoId);
    const answersValidas = anterior ? mapearAnswersValidas(encuesta, anterior.answers) : null;

    if (anterior && answersValidas) {
      await upsertConvo(chatId, {
        estado: ESTADO.PROPUESTA,
        pasoActual: 0,
        encuestaId: encuesta.encuestaId,
        telefono: conocido.telefono,
        respuestasParciales: { answers: answersValidas },
        ubicacionLat: null,
        ubicacionLng: null,
        messageId: null,
      });
      await sendMessage(chatId, M.mensajeReporteAnterior(anterior.fecha, anterior.lineasResumen), {
        replyMarkup: M.tecladoRepetir(),
      });
      return;
    }

    // Conocido pero sin reporte reutilizable: arrancamos las preguntas sin
    // volver a pedir el contacto.
    await iniciarEncuestaConocido(chatId, conocido.telefono, encuesta);
    return;
  }

  await iniciarEncuesta(chatId);
}

async function comandoCancelar(chatId: number, messageId?: number): Promise<void> {
  await borrarConvo(chatId);
  if (messageId) {
    await editMessageText(chatId, messageId, M.CANCELADO).catch(() => undefined);
  } else {
    await sendMessage(chatId, M.CANCELADO, { replyMarkup: M.quitarTeclado() });
  }
}

// --- Transiciones -----------------------------------------------------------

async function iniciarEncuesta(chatId: number): Promise<void> {
  await upsertConvo(chatId, {
    estado: ESTADO.CONTACTO,
    pasoActual: 0,
    encuestaId: null,
    telefono: null,
    respuestasParciales: { answers: {} },
    ubicacionLat: null,
    ubicacionLng: null,
    messageId: null,
  });
  await sendMessage(chatId, M.BIENVENIDA, { replyMarkup: M.tecladoContacto() });
}

/**
 * Arranca la encuesta para un ciudadano ya conocido: salteamos el paso de
 * contacto porque su telefono ya esta validado y guardado.
 */
async function iniciarEncuestaConocido(
  chatId: number,
  telefono: string,
  encuesta: EncuestaBot,
): Promise<void> {
  await upsertConvo(chatId, {
    estado: ESTADO.PREGUNTA,
    pasoActual: 0,
    encuestaId: encuesta.encuestaId,
    telefono,
    respuestasParciales: { answers: {} },
    ubicacionLat: null,
    ubicacionLng: null,
    messageId: null,
  });
  const messageId = await mostrarPregunta(chatId, null, encuesta, 0);
  await guardarConvo(chatId, { messageId });
}

/**
 * "Reportar lo mismo": el convo ya trae telefono + answers reusadas. Marcamos
 * `repetir` y saltamos las preguntas; pedimos ubicacion y foto (opcional). El
 * resto (resumen, confirmar, persistencia con ancla nueva) reusa el flujo
 * existente.
 */
async function repetirReporte(
  chatId: number,
  convo: TelegramConversacion,
  messageId?: number,
): Promise<void> {
  if (messageId) {
    await editMessageText(
      chatId,
      messageId,
      '🔁 Reenviamos tu ultimo reporte. Te pido la ubicacion de ahora y, si queres, una foto.',
    ).catch(() => undefined);
  }
  const parcial = leerParcial(convo);
  parcial.repetir = true;
  await guardarConvo(chatId, { estado: ESTADO.UBICACION, respuestasParciales: parcial });
  await sendMessage(chatId, M.PEDIR_UBICACION_REPETIR_TXT, { replyMarkup: M.tecladoUbicacion() });
}

/**
 * "Es otra cosa": ciudadano conocido que quiere un reporte distinto. Reusamos
 * su telefono y arrancamos las preguntas desde cero.
 */
async function empezarNuevoConocido(
  chatId: number,
  convo: TelegramConversacion,
  messageId?: number,
): Promise<void> {
  if (messageId) {
    await editMessageText(chatId, messageId, '📝 Dale, empecemos un reporte nuevo.').catch(() => undefined);
  }
  if (!convo.telefono) {
    await iniciarEncuesta(chatId);
    return;
  }
  const encuesta = await cargarEncuestaBot(convo.encuestaId ?? undefined);
  await iniciarEncuestaConocido(chatId, convo.telefono, encuesta);
}

/**
 * Mapea las respuestas de un reporte anterior contra la encuesta activa. Solo
 * es valido si TODAS las preguntas actuales tienen una opcion elegida que sigue
 * existiendo; si la encuesta cambio, devolvemos null y no ofrecemos repetir.
 */
function mapearAnswersValidas(
  encuesta: EncuestaBot,
  answers: Record<string, number>,
): Record<string, number> | null {
  const mapeadas: Record<string, number> = {};
  for (const pregunta of encuesta.preguntas) {
    const opcionId = answers[String(pregunta.preguntaId)];
    if (opcionId == null || !pregunta.opciones.some((o) => o.id === opcionId)) {
      return null;
    }
    mapeadas[String(pregunta.preguntaId)] = opcionId;
  }
  return mapeadas;
}

async function procesarContacto(
  chatId: number,
  msg: TelegramMessage,
  _convo: TelegramConversacion,
): Promise<void> {
  const contacto = msg.contact!;
  if (contacto.user_id !== undefined && msg.from && contacto.user_id !== msg.from.id) {
    await sendMessage(chatId, M.CONTACTO_AJENO, { replyMarkup: M.tecladoContacto() });
    return;
  }

  const telefono = sanitizarTelefono(contacto.phone_number);
  const encuesta = await cargarEncuestaBot();

  await guardarConvo(chatId, {
    telefono,
    encuestaId: encuesta.encuestaId,
    estado: ESTADO.PREGUNTA,
    pasoActual: 0,
    respuestasParciales: { answers: {} },
  });

  // Quitamos el teclado de contacto y mostramos la primera pregunta (inline).
  await sendMessage(chatId, '📱 Numero recibido. ¡Gracias!', { replyMarkup: M.quitarTeclado() });
  const messageId = await mostrarPregunta(chatId, null, encuesta, 0);
  await guardarConvo(chatId, { messageId });
}

async function procesarRespuesta(
  chatId: number,
  convo: TelegramConversacion,
  paso: number,
  indiceOpcion: number,
): Promise<void> {
  if (paso !== convo.pasoActual || convo.encuestaId == null) {
    return; // callback viejo / estado inconsistente
  }

  const encuesta = await cargarEncuestaBot(convo.encuestaId);
  const pregunta = encuesta.preguntas[paso];
  const opcion = pregunta?.opciones[indiceOpcion];
  if (!pregunta || !opcion) {
    return;
  }

  const parcial = leerParcial(convo);
  parcial.answers[String(pregunta.preguntaId)] = opcion.id;

  if (paso < encuesta.preguntas.length - 1) {
    const messageId = await mostrarPregunta(chatId, convo.messageId, encuesta, paso + 1);
    await guardarConvo(chatId, {
      pasoActual: paso + 1,
      respuestasParciales: parcial,
      messageId,
    });
    return;
  }

  // Ultima pregunta respondida -> pedimos ubicacion.
  if (convo.messageId) {
    await editMessageText(
      chatId,
      convo.messageId,
      `✅ Respondiste las ${encuesta.preguntas.length} preguntas.`,
    ).catch(() => undefined);
  }
  await guardarConvo(chatId, { estado: ESTADO.UBICACION, respuestasParciales: parcial });
  await sendMessage(chatId, M.PEDIR_UBICACION_TXT, { replyMarkup: M.tecladoUbicacion() });
}

async function procesarUbicacion(
  chatId: number,
  lat: number,
  lng: number,
  convo: TelegramConversacion,
): Promise<void> {
  await sendMessage(chatId, '📍 Ubicacion recibida.', { replyMarkup: M.quitarTeclado() });
  await guardarConvo(chatId, { estado: ESTADO.FOTO, ubicacionLat: lat, ubicacionLng: lng });
  await enviarPasoFoto(chatId, convo);
}

/**
 * Muestra el paso de foto con el teclado acorde a lo ya cargado: "Omitir" cuando
 * no hay fotos, "Listo" cuando hay al menos una. Guarda el messageId del prompt
 * para poder editarlo a medida que llegan mas fotos. Reusado al entrar desde
 * ubicacion, al reanudar y al volver "atras" desde el resumen.
 */
async function enviarPasoFoto(chatId: number, convo: TelegramConversacion): Promise<void> {
  const fotos = leerParcial(convo).fotoFileIds ?? [];
  const { fotosMin, fotosMax } = await obtenerConfigFotosActiva();
  // "Listo" recien aparece cuando se alcanzo el minimo exigido por la version.
  const { message_id } =
    fotos.length > 0
      ? await sendMessage(chatId, M.fotosCargadasTxt(fotos.length, fotosMin, fotosMax), {
          replyMarkup: fotos.length >= fotosMin ? M.tecladoFotoListo() : M.tecladoFoto(fotosMin),
        })
      : await sendMessage(chatId, M.pedirFotoTxt(fotosMin, fotosMax), { replyMarkup: M.tecladoFoto(fotosMin) });
  await guardarConvo(chatId, { messageId: message_id });
}

/**
 * Agrega una foto al paso FOTO. Las fotos de un album llegan como updates
 * separados y concurrentes, por lo que el append se hace ATOMICO en Postgres
 * (jsonb `||` bajo el lock de fila) con el tope en el propio WHERE: asi ningun
 * update pisa al otro y no se pierden fotos. El tope es el `fotosMax` de la
 * version activa. Devuelve la nueva cantidad via RETURNING para refrescar el
 * contador del mensaje.
 */
async function agregarFoto(
  chatId: number,
  fileId: string,
  convo: TelegramConversacion,
): Promise<void> {
  const { fotosMin, fotosMax } = await obtenerConfigFotosActiva();
  const rows = await prisma.$queryRaw<{ n: number }[]>`
    UPDATE "TelegramConversacion"
    SET "respuestasParciales" = jsonb_set(
          COALESCE("respuestasParciales", '{}'::jsonb),
          '{fotoFileIds}',
          COALESCE("respuestasParciales"->'fotoFileIds', '[]'::jsonb) || to_jsonb(${fileId}::text)
        ),
        "expiracion" = ${nuevaExpiracion()}
    WHERE "chatId" = ${BigInt(chatId)}
      AND "estado" = ${ESTADO.FOTO}
      AND jsonb_array_length(COALESCE("respuestasParciales"->'fotoFileIds', '[]'::jsonb)) < ${fotosMax}
    RETURNING jsonb_array_length("respuestasParciales"->'fotoFileIds')::int AS n
  `;

  if (rows.length === 0) {
    // El WHERE no matcheo: o ya se llego a `fotosMax`, o el paso ya se cerro
    // (p.ej. la foto llego justo despues de "Listo"). Avisamos sin avanzar ni
    // duplicar el resumen.
    await sendMessage(
      chatId,
      `No pude sumar esa foto (llegaste al tope de ${fotosMax} o el paso ya se cerro).`,
    );
    return;
  }

  const n = Number(rows[0].n);
  const texto = M.fotosCargadasTxt(n, fotosMin, fotosMax);
  const teclado = n >= fotosMin ? M.tecladoFotoListo() : M.tecladoFoto(fotosMin);
  if (convo.messageId) {
    await editMessageText(chatId, convo.messageId, texto, { replyMarkup: teclado }).catch(() => undefined);
  } else {
    const { message_id } = await sendMessage(chatId, texto, { replyMarkup: teclado });
    await guardarConvo(chatId, { messageId: message_id });
  }
}

/**
 * Cierra el paso de foto (boton "Listo" con 1..N fotos, o "Omitir" sin ninguna)
 * y muestra el resumen. La transicion FOTO -> RESUMEN se reclama de forma
 * atomica para que un doble toque no muestre el resumen dos veces.
 */
async function finalizarFotos(chatId: number, convo: TelegramConversacion): Promise<void> {
  const claim = await prisma.telegramConversacion.updateMany({
    where: { chatId: BigInt(chatId), estado: ESTADO.FOTO },
    data: { estado: ESTADO.RESUMEN, expiracion: nuevaExpiracion() },
  });
  if (claim.count === 0) {
    return; // el paso de foto ya se habia cerrado
  }

  const fotos = leerParcial(convo).fotoFileIds ?? [];
  if (convo.messageId) {
    await editMessageText(
      chatId,
      convo.messageId,
      fotos.length > 0 ? `📷 ${fotos.length} foto(s) recibida(s).` : '📷 Sin foto.',
    ).catch(() => undefined);
  }
  await mostrarResumen(chatId, { ...convo, estado: ESTADO.RESUMEN });
}

async function mostrarResumen(chatId: number, convo: TelegramConversacion): Promise<void> {
  if (convo.encuestaId == null || convo.ubicacionLat == null || convo.ubicacionLng == null) {
    return;
  }
  const encuesta = await cargarEncuestaBot(convo.encuestaId);
  const parcial = leerParcial(convo);
  const texto = M.mensajeResumen(
    encuesta,
    parcial.answers,
    { lat: convo.ubicacionLat, lng: convo.ubicacionLng },
    (parcial.fotoFileIds ?? []).length,
  );
  const { message_id } = await sendMessage(chatId, texto, { replyMarkup: M.tecladoResumen() });
  await guardarConvo(chatId, { messageId: message_id });
}

async function manejarAtras(chatId: number, convo: TelegramConversacion): Promise<void> {
  switch (convo.estado) {
    case ESTADO.PREGUNTA: {
      if (convo.pasoActual <= 0 || convo.encuestaId == null) {
        return;
      }
      const encuesta = await cargarEncuestaBot(convo.encuestaId);
      const nuevoPaso = convo.pasoActual - 1;
      const messageId = await mostrarPregunta(chatId, convo.messageId, encuesta, nuevoPaso);
      await guardarConvo(chatId, { pasoActual: nuevoPaso, messageId });
      break;
    }
    case ESTADO.FOTO: {
      // Volver a pedir la ubicacion.
      if (convo.messageId) {
        await editMessageText(chatId, convo.messageId, '◀️ Volviendo a la ubicacion.').catch(() => undefined);
      }
      const txtUbic = leerParcial(convo).repetir ? M.PEDIR_UBICACION_REPETIR_TXT : M.PEDIR_UBICACION_TXT;
      await guardarConvo(chatId, { estado: ESTADO.UBICACION });
      await sendMessage(chatId, txtUbic, { replyMarkup: M.tecladoUbicacion() });
      break;
    }
    case ESTADO.RESUMEN: {
      // Volver al paso de foto, conservando las fotos ya cargadas.
      if (convo.messageId) {
        await editMessageText(chatId, convo.messageId, '◀️ Volviendo al paso de la foto.').catch(() => undefined);
      }
      await guardarConvo(chatId, { estado: ESTADO.FOTO });
      await enviarPasoFoto(chatId, convo);
      break;
    }
    default:
      break;
  }
}

async function reanudar(chatId: number, convo: TelegramConversacion): Promise<void> {
  switch (convo.estado) {
    case ESTADO.CONTACTO:
      await sendMessage(chatId, M.PEDIR_CONTACTO_TXT, { replyMarkup: M.tecladoContacto() });
      break;
    case ESTADO.PREGUNTA: {
      if (convo.encuestaId == null) {
        await iniciarEncuesta(chatId);
        return;
      }
      const encuesta = await cargarEncuestaBot(convo.encuestaId);
      const messageId = await mostrarPregunta(chatId, null, encuesta, convo.pasoActual);
      await guardarConvo(chatId, { messageId });
      break;
    }
    case ESTADO.UBICACION:
      await sendMessage(chatId, M.PEDIR_UBICACION_TXT, { replyMarkup: M.tecladoUbicacion() });
      break;
    case ESTADO.FOTO:
      await enviarPasoFoto(chatId, convo);
      break;
    case ESTADO.RESUMEN:
      await mostrarResumen(chatId, convo);
      break;
    default:
      await iniciarEncuesta(chatId);
  }
}

// --- Confirmacion + persistencia --------------------------------------------

async function confirmar(chatId: number, convo: TelegramConversacion): Promise<void> {
  if (convo.encuestaId == null || convo.ubicacionLat == null || convo.ubicacionLng == null || !convo.telefono) {
    await sendMessage(chatId, M.ERROR_PERSISTENCIA);
    return;
  }

  const parcial = leerParcial(convo);

  // Aseguramos el ancla una sola vez y la guardamos, para que un reintento
  // reuse la misma ValidacionSms (sin dejar anclas huerfanas).
  let anchor: persistencia.Anchor | null = null;
  if (parcial.anchorValidacionSmsId) {
    anchor = await persistencia.recuperarAnchor(parcial.anchorValidacionSmsId);
  }
  if (!anchor) {
    anchor = await persistencia.crearAnchor(BigInt(chatId), convo.telefono);
    parcial.anchorValidacionSmsId = anchor.validacionSmsId;
    await guardarConvo(chatId, { respuestasParciales: parcial });
  }

  try {
    const codigo = await persistencia.persistirReporte(anchor, {
      encuestaId: convo.encuestaId,
      answers: parcial.answers,
      lat: convo.ubicacionLat,
      lng: convo.ubicacionLng,
      fotoFileIds: parcial.fotoFileIds ?? [],
      telefono: convo.telefono,
    });
    await finalizar(chatId, convo.messageId, codigo);
  } catch (err) {
    if (err instanceof ConflictError) {
      // Ya existia un reporte para esta ancla: confirmacion repetida, la
      // tratamos como exito idempotente reusando su codigo publico.
      const codigo = await persistencia.codigoPublicoPorAnchor(anchor.validacionSmsId);
      if (codigo) {
        await finalizar(chatId, convo.messageId, codigo);
        return;
      }
    }
    if (err instanceof TooManyRequestsError) {
      // Limite anti-abuso (reportes/24h): reintentar "Confirmar" no ayuda, asi
      // que damos un mensaje claro en vez del generico de reintento.
      await sendMessage(chatId, M.limiteReportes(err.message));
      return;
    }
    // El controller no ve este error (no re-lanzamos): logueamos para diagnostico.
    const detalle = err instanceof Error ? err.message : 'error desconocido';
    console.error(`[telegram] error al persistir reporte (chat ${chatId}): ${detalle}`);
    await sendMessage(chatId, M.ERROR_PERSISTENCIA);
  }
}

async function finalizar(chatId: number, messageId: number | null, codigo: string): Promise<void> {
  await guardarConvo(chatId, { estado: ESTADO.COMPLETADO });
  const texto = M.reporteCreado(codigo);
  if (messageId) {
    await editMessageText(chatId, messageId, texto).catch(async () => {
      await sendMessage(chatId, texto);
    });
  } else {
    await sendMessage(chatId, texto);
  }
}

// --- Helpers de render ------------------------------------------------------

async function mostrarPregunta(
  chatId: number,
  messageId: number | null,
  encuesta: EncuestaBot,
  paso: number,
): Promise<number> {
  const { texto, teclado } = M.mensajePregunta(encuesta.preguntas[paso], paso, encuesta.preguntas.length);
  if (messageId) {
    try {
      await editMessageText(chatId, messageId, texto, { replyMarkup: teclado });
      return messageId;
    } catch {
      // Si no se puede editar (mensaje viejo/borrado), enviamos uno nuevo.
    }
  }
  const { message_id } = await sendMessage(chatId, texto, { replyMarkup: teclado });
  return message_id;
}

// --- Persistencia de la conversacion ----------------------------------------

function cargarConvo(chatId: number): Promise<TelegramConversacion | null> {
  return prisma.telegramConversacion.findUnique({ where: { chatId: BigInt(chatId) } });
}

async function upsertConvo(
  chatId: number,
  data: {
    estado: string;
    pasoActual: number;
    encuestaId: number | null;
    telefono: string | null;
    respuestasParciales: Parcial;
    ubicacionLat: number | null;
    ubicacionLng: number | null;
    messageId: number | null;
  },
): Promise<void> {
  const expiracion = nuevaExpiracion();
  const chatIdBig = BigInt(chatId);
  const payload = {
    ...data,
    respuestasParciales: data.respuestasParciales as unknown as object,
    expiracion,
  };
  await prisma.telegramConversacion.upsert({
    where: { chatId: chatIdBig },
    update: payload,
    create: { chatId: chatIdBig, ...payload },
  });
}

async function guardarConvo(
  chatId: number,
  data: Partial<{
    estado: string;
    pasoActual: number;
    encuestaId: number | null;
    telefono: string | null;
    respuestasParciales: Parcial;
    ubicacionLat: number | null;
    ubicacionLng: number | null;
    messageId: number | null;
  }>,
): Promise<void> {
  const { respuestasParciales, ...resto } = data;
  await prisma.telegramConversacion.update({
    where: { chatId: BigInt(chatId) },
    data: {
      ...resto,
      ...(respuestasParciales ? { respuestasParciales: respuestasParciales as unknown as object } : {}),
      expiracion: nuevaExpiracion(),
    },
  });
}

async function borrarConvo(chatId: number): Promise<void> {
  await prisma.telegramConversacion.deleteMany({ where: { chatId: BigInt(chatId) } });
}

function leerParcial(convo: TelegramConversacion): Parcial {
  const raw = convo.respuestasParciales as unknown as Parcial | null;
  return {
    answers: raw?.answers ?? {},
    anchorValidacionSmsId: raw?.anchorValidacionSmsId,
    repetir: raw?.repetir,
    fotoFileIds: raw?.fotoFileIds ?? [],
  };
}

function expirada(convo: TelegramConversacion): boolean {
  return convo.expiracion.getTime() < Date.now();
}

function nuevaExpiracion(): Date {
  return new Date(Date.now() + env.telegramSesionExpiracionHoras * 60 * 60 * 1000);
}

function sanitizarTelefono(raw: string): string {
  const t = raw.trim();
  const prefijo = t.startsWith('+') ? '+' : '';
  return prefijo + t.replace(/\D/g, '');
}
