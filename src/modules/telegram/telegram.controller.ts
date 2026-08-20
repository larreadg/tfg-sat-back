import crypto from 'crypto';
import { Request, Response } from 'express';
import { env } from '../../config/env';
import { Response as ApiResponse } from '../../shared/utils/response';
import { TelegramUpdate } from './telegram.types';
import * as telegramService from './telegram.service';

const HEADER_SECRET = 'x-telegram-bot-api-secret-token';

/**
 * Endpoint del webhook de Telegram. Responsabilidades:
 *  - Validar el secret header contra TELEGRAM_WEBHOOK_SECRET (401 si no coincide).
 *  - Responder 200 de inmediato y procesar el update en segundo plano; Telegram
 *    reintenta si la request tarda, asi que nunca la dejamos colgada.
 */
export function webhook(req: Request, res: Response): void {
  if (!secretValido(req.header(HEADER_SECRET))) {
    res.status(401).json(ApiResponse.error(401, 'No autorizado.'));
    return;
  }

  // Respondemos ya; el procesamiento sigue de forma asincrona.
  res.status(200).json({ ok: true });

  const update = req.body as TelegramUpdate;
  if (!update || typeof update.update_id !== 'number') {
    return;
  }

  setImmediate(() => {
    telegramService.procesarUpdate(update).catch((err: unknown) => {
      // Log saneado: nunca imprimimos el token ni el cuerpo crudo del update.
      const detalle = err instanceof Error ? err.message : 'error desconocido';
      console.error(`[telegram] fallo procesando update ${update.update_id}: ${detalle}`);
    });
  });
}

/**
 * Comparacion en tiempo constante para no filtrar informacion por timing.
 * Si el bot esta deshabilitado (secret vacio) nunca valida.
 */
function secretValido(recibido?: string): boolean {
  const esperado = env.telegramWebhookSecret;
  if (!esperado || !recibido) {
    return false;
  }
  const a = Buffer.from(recibido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}
