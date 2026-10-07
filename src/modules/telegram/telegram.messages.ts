import {
  InlineKeyboardMarkup,
  ReplyKeyboardMarkup,
  ReplyKeyboardRemove,
} from './telegram.types';
import { EncuestaBot, PreguntaBot } from './telegram.encuesta';

/**
 * Textos y teclados del bot, en espanol claro y sin tecnicismos (le habla a
 * ciudadanos). Todo texto es plano: NO usamos parse_mode para no tener que
 * escapar caracteres de los textos de la encuesta que vienen de la DB.
 */

// --- Codigos de callback_data (cortos y estables, < 64 bytes) ---------------
export const CB = {
  atras: 'back',
  continuar: 'cont',
  reiniciar: 'restart',
  omitirFoto: 'skip',
  listoFotos: 'done', // terminar de cargar fotos (1..N) y pasar al resumen
  confirmar: 'confirm',
  cancelar: 'cancel',
  repetir: 'again', // reenviar el ultimo reporte cambiando solo la ubicacion
  nuevo: 'new', // empezar un reporte nuevo (usuario ya conocido)
  // Respuesta a una pregunta: `a:<paso>:<indiceOpcion>`
  respuesta: (paso: number, indiceOpcion: number) => `a:${paso}:${indiceOpcion}`,
} as const;

export function parseRespuesta(data: string): { paso: number; indiceOpcion: number } | null {
  const m = /^a:(\d+):(\d+)$/.exec(data);
  if (!m) return null;
  return { paso: Number(m[1]), indiceOpcion: Number(m[2]) };
}

// --- Textos fijos -----------------------------------------------------------
export const BIENVENIDA =
  'Hola 👋 Soy el asistente de AGUARD.\n\n' +
  'Te voy a hacer unas preguntas cortas sobre el agua que queres reportar. Al final ' +
  'te pido tu ubicacion y, si queres, una foto.\n\n' +
  'Primero, compartime tu numero de telefono con el boton de abajo para poder ' +
  'registrar tu reporte y darte seguimiento.\n\n' +
  'En cualquier momento podes escribir /cancelar para abortar o /ayuda si tenes dudas.';

export const AYUDA =
  'ℹ️ Como funciona AGUARD:\n\n' +
  '• Respondes unas preguntas tocando los botones.\n' +
  '• Podes volver a la pregunta anterior con el boton "Atras".\n' +
  '• Al final compartis tu ubicacion y, opcionalmente, una foto del agua.\n' +
  '• Revisas un resumen y confirmas el envio.\n\n' +
  'Comandos:\n' +
  '/start - iniciar o reiniciar la encuesta\n' +
  '/cancelar - abortar y borrar lo cargado\n' +
  '/ayuda - mostrar esta ayuda';

export const PEDIR_CONTACTO_TXT =
  'Toca el boton "📱 Compartir mi numero" para continuar.';

export const RECORDAR_CONTACTO =
  'Necesito que compartas tu numero con el boton "📱 Compartir mi numero" para poder seguir.';

export const CONTACTO_AJENO =
  'Ese contacto no es el tuyo. Por favor compartí TU numero con el boton de abajo.';

export const PEDIR_UBICACION_TXT =
  '📍 Ahora compartime la ubicacion del lugar del reporte con el boton de abajo.';

export const PEDIR_UBICACION_REPETIR_TXT =
  '📍 Perfecto. Compartime la ubicacion de ahora con el boton de abajo. Despues te pido la foto del agua y reenviamos tu reporte.';

export const RECORDAR_UBICACION =
  'Necesito tu ubicacion. Toca el boton "📍 Compartir mi ubicacion".';

/**
 * Paso de fotos. La cantidad la define la version activa de la encuesta: la
 * foto NO es opcional, por eso el texto pide y no sugiere.
 */
export function pedirFotoTxt(min: number, max: number): string {
  const pedido =
    min === 1
      ? `enviame al menos una foto del agua (hasta ${max})`
      : `enviame al menos ${min} fotos del agua (hasta ${max})`;
  return `📷 Necesito ver el agua para analizar el reporte: ${pedido}. Cuando termines toca "✅ Listo".`;
}

export function recordarFotoTxt(min: number): string {
  return min === 1
    ? 'Enviame la foto como imagen: sin al menos una foto no puedo tomar el reporte.'
    : `Enviame las fotos como imagen: hacen falta al menos ${min}.`;
}

/** Texto del paso de foto cuando ya hay al menos una cargada. */
export function fotosCargadasTxt(cantidad: number, min = 1, max = 3): string {
  if (cantidad < min) {
    const faltan = min - cantidad;
    return `📷 ${cantidad} foto(s) cargada(s). Falta(n) ${faltan} para poder continuar.`;
  }
  const puedeSumar = cantidad < max ? 'Podes enviar otra o ' : '';
  return `📷 ${cantidad} foto(s) cargada(s). ${puedeSumar}toca "✅ Listo" para continuar.`;
}

export const USAR_BOTONES =
  'Por favor usá los botones 👇 para responder.';

export const CANCELADO =
  'Listo, cancele el reporte y borre lo que habias cargado. Escribi /start cuando quieras empezar de nuevo.';

export const EXPIRADO =
  'Tu encuesta anterior expiro por inactividad. Escribi /start para empezar una nueva.';

export const ERROR_PERSISTENCIA =
  '⚠️ Hubo un problema al guardar tu reporte. Tus respuestas siguen cargadas: toca "✅ Confirmar" de nuevo para reintentar.';

/**
 * Limite anti-abuso alcanzado (reportes/24h). Reintentar no sirve, asi que el
 * texto lo deja claro. `detalle` es el mensaje del TooManyRequestsError.
 */
export function limiteReportes(detalle: string): string {
  return (
    `🚫 ${detalle}\n\n` +
    'No hace falta reintentar ahora: cuando pase el periodo vas a poder enviar un ' +
    'reporte nuevo con /start.'
  );
}

export function reporteCreado(codigo: string): string {
  return (
    '✅ ¡Gracias! Tu reporte fue registrado con exito.\n\n' +
    `Codigo de seguimiento: ${codigo}\n\n` +
    'Nuestro equipo lo va a analizar. Si necesitas reportar otra vez, escribi /start.'
  );
}

// --- Teclados ---------------------------------------------------------------
export function tecladoContacto(): ReplyKeyboardMarkup {
  return {
    keyboard: [[{ text: '📱 Compartir mi numero', request_contact: true }]],
    resize_keyboard: true,
    one_time_keyboard: true,
  };
}

export function tecladoUbicacion(): ReplyKeyboardMarkup {
  return {
    keyboard: [[{ text: '📍 Compartir mi ubicacion', request_location: true }]],
    resize_keyboard: true,
    one_time_keyboard: true,
  };
}

export function quitarTeclado(): ReplyKeyboardRemove {
  return { remove_keyboard: true };
}

/**
 * Arma el mensaje de una pregunta con su inline keyboard. Una opcion por fila
 * (o dos por fila si todos los textos son cortos). Incluye "Atras" salvo en la
 * primera pregunta.
 */
export function mensajePregunta(
  pregunta: PreguntaBot,
  paso: number,
  total: number,
): { texto: string; teclado: InlineKeyboardMarkup } {
  const encabezado = `Pregunta ${paso + 1} de ${total}\n\n${pregunta.texto}`;

  const cortas = pregunta.opciones.every((o) => o.texto.length <= 14);
  const filas: InlineKeyboardMarkup['inline_keyboard'] = [];

  if (cortas) {
    for (let i = 0; i < pregunta.opciones.length; i += 2) {
      const fila = pregunta.opciones
        .slice(i, i + 2)
        .map((o, j) => ({ text: o.texto, callback_data: CB.respuesta(paso, i + j) }));
      filas.push(fila);
    }
  } else {
    pregunta.opciones.forEach((o, i) => {
      filas.push([{ text: o.texto, callback_data: CB.respuesta(paso, i) }]);
    });
  }

  if (paso > 0) {
    filas.push([{ text: '◀️ Atras', callback_data: CB.atras }]);
  }

  return { texto: encabezado, teclado: { inline_keyboard: filas } };
}

/**
 * Teclado del paso de foto sin fotos aun. Solo ofrece "Omitir" si la version
 * activa no exige fotos (`fotosMin === 0`, hoy imposible por validacion, pero
 * el teclado no tiene por que asumirlo).
 */
export function tecladoFoto(min: number): InlineKeyboardMarkup {
  const filas = [];
  if (min <= 0) {
    filas.push([{ text: 'Omitir foto ⏭️', callback_data: CB.omitirFoto }]);
  }
  filas.push([{ text: '◀️ Atras', callback_data: CB.atras }]);
  return { inline_keyboard: filas };
}

/** Teclado del paso de foto con al menos una cargada: se confirma con "Listo". */
export function tecladoFotoListo(): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: '✅ Listo', callback_data: CB.listoFotos }],
      [{ text: '◀️ Atras', callback_data: CB.atras }],
    ],
  };
}

export function tecladoResumen(): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: '✅ Confirmar', callback_data: CB.confirmar }],
      [
        { text: '◀️ Atras', callback_data: CB.atras },
        { text: '✖️ Cancelar', callback_data: CB.cancelar },
      ],
    ],
  };
}

export function tecladoReentrada(): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: '▶️ Continuar', callback_data: CB.continuar }],
      [{ text: '🔄 Empezar de nuevo', callback_data: CB.reiniciar }],
    ],
  };
}

export const REENTRADA_TXT =
  'Tenes una encuesta a medias. ¿Queres continuar donde la dejaste o empezar de nuevo?';

/**
 * Saludo a un ciudadano ya conocido: le recordamos su ultimo reporte y le
 * ofrecemos reenviarlo tal cual (solo cambiando la ubicacion) o empezar uno
 * nuevo. Los textos de preguntas/opciones vienen de la DB (confiables), se
 * envian como texto plano.
 */
export function mensajeReporteAnterior(fecha: Date, lineas: string[]): string {
  const detalle = lineas.map((l) => `• ${l}`).join('\n');
  return (
    'Hola de nuevo 👋\n\n' +
    `El ${formatearFecha(fecha)} ya nos enviaste este reporte:\n\n` +
    `${detalle}\n\n` +
    '¿Es por lo mismo? Si es asi, te pido la ubicacion de ahora (y una foto si queres) y lo reenviamos. ' +
    'Si es otra cosa, empezamos un reporte nuevo.'
  );
}

export function tecladoRepetir(): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: '🔁 Reportar lo mismo', callback_data: CB.repetir }],
      [{ text: '📝 Es otra cosa', callback_data: CB.nuevo }],
    ],
  };
}

/** Fecha en formato dd/mm/aaaa (sin depender de locale del entorno). */
function formatearFecha(fecha: Date): string {
  const dd = String(fecha.getDate()).padStart(2, '0');
  const mm = String(fecha.getMonth() + 1).padStart(2, '0');
  const aaaa = fecha.getFullYear();
  return `${dd}/${mm}/${aaaa}`;
}

/**
 * Resumen final de lo respondido. `answers` mapea preguntaId -> preguntaOpcionId.
 */
/**
 * Emoji "keycap" para numerar preguntas (1..10). Mas alla de 10 cae a "N.".
 * Ayuda a separar visualmente cada pregunta en el resumen (texto plano).
 */
const NUMEROS_EMOJI = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
function numeroPregunta(i: number): string {
  return NUMEROS_EMOJI[i] ?? `${i + 1}.`;
}

export function mensajeResumen(
  encuesta: EncuestaBot,
  answers: Record<string, number>,
  ubicacion: { lat: number; lng: number },
  cantidadFotos: number,
): string {
  const lineas: string[] = ['📋 Revisá tu reporte antes de enviarlo:', ''];

  // Un bloque por pregunta, separado por una linea en blanco para que no se
  // mezclen (el bot manda texto plano, sin formato).
  encuesta.preguntas.forEach((pregunta, i) => {
    const opcionId = answers[String(pregunta.preguntaId)];
    const opcion = pregunta.opciones.find((o) => o.id === opcionId);
    lineas.push(`${numeroPregunta(i)} ${pregunta.texto}`);
    lineas.push(`      ↳ ${opcion ? opcion.texto : '(sin responder)'}`);
    lineas.push('');
  });

  lineas.push('➖➖➖➖➖➖➖➖➖➖');
  lineas.push(`📍 Ubicación: ${ubicacion.lat.toFixed(5)}, ${ubicacion.lng.toFixed(5)}`);
  lineas.push(`📷 Fotos: ${cantidadFotos > 0 ? `${cantidadFotos} adjunta(s)` : 'sin foto'}`);
  lineas.push('');
  lineas.push('Si está todo bien, tocá "✅ Confirmar".');

  return lineas.join('\n');
}
