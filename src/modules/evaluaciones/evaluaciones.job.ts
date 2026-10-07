import cron from 'node-cron';
import { env } from '../../config/env';
import { procesarPendientes } from './evaluaciones.service';
import { conContextoAislado } from '../auditoria/auditoria.contexto';

let ejecutando = false;

export function iniciarJobEvaluacionIa(): void {
  cron.schedule(env.evaluacionIaCronExpr, async () => {
    if (ejecutando) {
      return;
    }

    ejecutando = true;
    try {
      // Contexto propio de la corrida: no hay request, pero asi todas las
      // entradas de auditoria de esta pasada comparten `requestId` y el panel las
      // puede agrupar como "lo que hizo el job a las 03:00".
      await conContextoAislado(() => procesarPendientes());
    } catch (err) {
      console.error('Error procesando evaluaciones IA', err);
    } finally {
      ejecutando = false;
    }
  });
}
