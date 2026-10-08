import { env } from '../../config/env';
import { getWebhookInfo, setMyCommands, setWebhook } from './telegram.api';

/**
 * Comandos que el bot expone en el menu (boton "Menu" + autocompletado al
 * tipear "/"). Mantener alineado con los comandos que maneja la maquina de
 * estados (/start, /ayuda, /cancelar).
 */
const COMANDOS = [
  { command: 'start', description: 'Iniciar un reporte de agua' },
  { command: 'ayuda', description: 'Como funciona el asistente' },
  { command: 'cancelar', description: 'Cancelar el reporte en curso' },
];

/**
 * Registra el menu de comandos al arrancar. Idempotente (se puede correr en
 * cada boot). Si Telegram esta deshabilitado o la llamada falla, no aborta el
 * servidor: el bot sigue funcionando sin el menu.
 */
export async function registrarComandosBot(): Promise<void> {
  if (!env.telegramEnabled) {
    return;
  }
  try {
    await setMyCommands(COMANDOS);
    console.log('Telegram: comandos del bot registrados.');
  } catch (err) {
    const detalle = err instanceof Error ? err.message : 'error desconocido';
    console.warn(`Telegram: no se pudieron registrar los comandos (${detalle}).`);
  }
}

/**
 * Registra en Telegram la URL publica del webhook (`TELEGRAM_WEBHOOK_URL`).
 * Solo corre si la variable esta: en el servidor va en el .env; en local queda
 * vacia y la registra start-https.bat con la URL del tunel.
 *
 * Se llama en cada arranque a proposito. El bot es uno solo y Telegram entrega
 * a UNA sola URL: si alguien corre start-https.bat con este mismo token, se
 * lleva el bot a su tunel, y reiniciar el contenedor lo devuelve.
 *
 * `drop_pending_updates` en false: lo que llego mientras el contenedor estaba
 * caido se procesa al volver, no se descarta. Si falla, no aborta el servidor.
 */
export async function registrarWebhookBot(): Promise<void> {
  if (!env.telegramEnabled || !env.telegramWebhookUrl) {
    return;
  }
  try {
    const anterior = await getWebhookInfo();
    await setWebhook(env.telegramWebhookUrl, env.telegramWebhookSecret, ['message', 'callback_query'], false);
    if (anterior.url === env.telegramWebhookUrl) {
      console.log(`Telegram: webhook confirmado en ${env.telegramWebhookUrl}.`);
    } else {
      console.log(
        `Telegram: webhook registrado en ${env.telegramWebhookUrl} (antes: ${anterior.url || 'ninguno'}).`,
      );
    }
  } catch (err) {
    const detalle = err instanceof Error ? err.message : 'error desconocido';
    console.warn(`Telegram: no se pudo registrar el webhook (${detalle}).`);
  }
}
