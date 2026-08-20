import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { TelegramUpdate } from './telegram.types';
import { manejarUpdate } from './telegram.state-machine';

/**
 * Orquestacion del webhook. Se invoca de forma asincrona desde el controller
 * (la request HTTP ya respondio 200). Garantiza idempotencia por `update_id`
 * antes de delegar en la maquina de estados.
 */
export async function procesarUpdate(update: TelegramUpdate): Promise<void> {
  if (!env.telegramEnabled) {
    return;
  }

  // Idempotencia: registramos el update ANTES de procesarlo (at-most-once). Si
  // Telegram reintenta el mismo update_id, el segundo intento se descarta y no
  // se genera trabajo duplicado (p.ej. dos reportes).
  const esNuevo = await registrarUpdate(update.update_id);
  if (!esNuevo) {
    return;
  }

  await manejarUpdate(update);
}

async function registrarUpdate(updateId: number): Promise<boolean> {
  try {
    await prisma.telegramUpdateProcesado.create({ data: { updateId: BigInt(updateId) } });
    return true;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return false; // ya procesado
    }
    throw err;
  }
}
