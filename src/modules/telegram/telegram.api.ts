import axios, { AxiosInstance } from 'axios';
import { env } from '../../config/env';
import {
  InlineKeyboardMarkup,
  ReplyMarkup,
  WebhookInfo,
} from './telegram.types';

/**
 * Cliente minimo de la Bot API de Telegram sobre axios (el mismo HTTP client
 * que ya usa el proyecto). Sin frameworks de bot.
 *
 * SEGURIDAD: el token viaja en el path de la URL (`/bot<token>/metodo`), asi que
 * NUNCA exponemos la URL ni el error crudo de axios (su `config` incluye la URL
 * con el token). Todas las llamadas pasan por `llamar()`, que traduce cualquier
 * fallo a un Error saneado con solo el metodo, el status y la descripcion que
 * devuelve Telegram.
 */

interface RespuestaTelegram<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

let clienteApi: AxiosInstance | null = null;
let clienteArchivos: AxiosInstance | null = null;

function api(): AxiosInstance {
  if (!clienteApi) {
    clienteApi = axios.create({
      baseURL: `https://api.telegram.org/bot${env.telegramBotToken}`,
      timeout: 15000,
    });
  }
  return clienteApi;
}

function apiArchivos(): AxiosInstance {
  if (!clienteArchivos) {
    clienteArchivos = axios.create({
      baseURL: `https://api.telegram.org/file/bot${env.telegramBotToken}`,
      timeout: 20000,
    });
  }
  return clienteArchivos;
}

async function llamar<T>(metodo: string, params: Record<string, unknown>): Promise<T> {
  try {
    const { data } = await api().post<RespuestaTelegram<T>>(`/${metodo}`, params);
    if (!data.ok) {
      throw new Error(`Telegram ${metodo} respondio not-ok: ${data.description ?? 'sin descripcion'}`);
    }
    return data.result as T;
  } catch (err) {
    // Saneamos: jamas propagamos el error de axios (contiene la URL con token).
    if (axios.isAxiosError(err)) {
      const descripcion =
        (err.response?.data as RespuestaTelegram<unknown> | undefined)?.description ??
        err.response?.statusText ??
        'error de red';
      const status = err.response?.status ?? 'sin-status';
      throw new Error(`Fallo llamada Telegram "${metodo}" (status ${status}): ${descripcion}`);
    }
    throw err instanceof Error ? err : new Error(`Fallo llamada Telegram "${metodo}".`);
  }
}

export interface EnviarMensajeOpciones {
  replyMarkup?: ReplyMarkup;
  parseMode?: 'HTML' | 'MarkdownV2';
}

export async function sendMessage(
  chatId: number,
  texto: string,
  opciones: EnviarMensajeOpciones = {},
): Promise<{ message_id: number }> {
  return llamar('sendMessage', {
    chat_id: chatId,
    text: texto,
    parse_mode: opciones.parseMode,
    reply_markup: opciones.replyMarkup,
  });
}

export async function editMessageText(
  chatId: number,
  messageId: number,
  texto: string,
  opciones: { replyMarkup?: InlineKeyboardMarkup; parseMode?: 'HTML' | 'MarkdownV2' } = {},
): Promise<void> {
  await llamar('editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text: texto,
    parse_mode: opciones.parseMode,
    reply_markup: opciones.replyMarkup,
  });
}

export interface ComandoBot {
  command: string; // sin la barra "/"
  description: string;
}

/**
 * Registra el menu de comandos del bot: Telegram muestra el boton "Menu" y el
 * autocompletado al tipear "/". Idempotente.
 */
export async function setMyCommands(comandos: ComandoBot[]): Promise<boolean> {
  return llamar('setMyCommands', { commands: comandos });
}

export async function answerCallbackQuery(callbackQueryId: string, texto?: string): Promise<void> {
  await llamar('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    text: texto,
  });
}

export async function setWebhook(
  url: string,
  secretToken: string,
  allowedUpdates: string[],
  dropPendingUpdates = true,
): Promise<boolean> {
  return llamar('setWebhook', {
    url,
    secret_token: secretToken,
    allowed_updates: allowedUpdates,
    drop_pending_updates: dropPendingUpdates,
  });
}

export async function deleteWebhook(dropPendingUpdates = false): Promise<boolean> {
  return llamar('deleteWebhook', { drop_pending_updates: dropPendingUpdates });
}

export async function getWebhookInfo(): Promise<WebhookInfo> {
  return llamar('getWebhookInfo', {});
}

/**
 * Baja una foto que el ciudadano envio al bot. Dos pasos: getFile para obtener
 * el `file_path`, y luego GET al endpoint de archivos. Devuelve el buffer para
 * pasarlo al pipeline de compresion/guardado existente.
 */
export async function descargarArchivo(fileId: string): Promise<Buffer> {
  const archivo = await llamar<{ file_path?: string }>('getFile', { file_id: fileId });
  if (!archivo.file_path) {
    throw new Error('Telegram no devolvio la ruta del archivo solicitado.');
  }
  try {
    const { data } = await apiArchivos().get<ArrayBuffer>(`/${archivo.file_path}`, {
      responseType: 'arraybuffer',
    });
    return Buffer.from(data);
  } catch (err) {
    // Igual que en llamar(): no propagamos la URL (lleva el token).
    const status = axios.isAxiosError(err) ? err.response?.status ?? 'sin-status' : 'desconocido';
    throw new Error(`Fallo la descarga del archivo de Telegram (status ${status}).`);
  }
}
