import { env } from '../../config/env';
import { setMyCommands } from './telegram.api';

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
