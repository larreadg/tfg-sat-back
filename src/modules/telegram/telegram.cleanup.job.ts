import cron from 'node-cron';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { registrarAuditoria } from '../auditoria/auditoria.registro';
import { conContextoAislado } from '../auditoria/auditoria.contexto';

/**
 * Recoleccion de basura del bot. La expiracion de las conversaciones es
 * perezosa (solo se borran cuando el mismo ciudadano vuelve a escribir), asi que
 * quien abandona y no regresa deja filas muertas. Este job barre:
 *
 * - `TelegramConversacion` vencidas (inactivas mas de la ventana de sesion).
 * - `TelegramUpdateProcesado` viejos: el ledger de idempotencia crece sin limite
 *   y los update_id antiguos ya no se reintentan.
 *
 * Corre una vez por dia (03:00). Fijo: no hay motivo para hacerlo mas seguido.
 */

// Todos los dias a las 03:00 (hora local del server).
const CRON_DIARIO = '0 3 * * *';

// Retencion del ledger de idempotencia. Telegram no reintenta updates tan
// viejos, asi que una semana sobra de margen.
const DIAS_RETENCION_UPDATES = 7;

let ejecutando = false;

export function iniciarJobLimpiezaTelegram(): void {
  if (!env.telegramEnabled) {
    return;
  }

  cron.schedule(CRON_DIARIO, async () => {
    if (ejecutando) {
      return;
    }

    ejecutando = true;
    try {
      await conContextoAislado(() => limpiar());
    } catch (err) {
      console.error('Error en la limpieza de Telegram', err);
    } finally {
      ejecutando = false;
    }
  });
}

async function limpiar(): Promise<void> {
  const ahora = new Date();
  const corteUpdates = new Date(ahora.getTime() - DIAS_RETENCION_UPDATES * 24 * 60 * 60 * 1000);

  const conversaciones = await prisma.telegramConversacion.deleteMany({
    where: { expiracion: { lt: ahora } },
  });
  const updates = await prisma.telegramUpdateProcesado.deleteMany({
    where: { fechaCreacion: { lt: corteUpdates } },
  });

  console.log(
    `Telegram: limpieza diaria -> ${conversaciones.count} conversaciones vencidas, ` +
      `${updates.count} updates antiguos.`,
  );

  // UNA entrada por corrida, con los totales, y solo si borro algo. Las filas en
  // si no se auditan (son estado efimero de una conversacion del bot, ver
  // `auditoria.acciones.ts`): lo que se registra es que el barrido corrio, para
  // que un bajon de datos del bot tenga una explicacion con fecha.
  if (conversaciones.count > 0 || updates.count > 0) {
    registrarAuditoria({
      accion: 'TELEGRAM_LIMPIEZA',
      descripcion: `Limpieza diaria del bot: ${conversaciones.count} conversaciones vencidas y ${updates.count} registros antiguos`,
      actor: { tipo: 'SISTEMA', etiqueta: 'job-limpieza-telegram' },
      metadatos: {
        conversacionesEliminadas: conversaciones.count,
        updatesEliminados: updates.count,
        diasRetencionUpdates: DIAS_RETENCION_UPDATES,
      },
    });
  }
}
