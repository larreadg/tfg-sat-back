import cron from 'node-cron';
import { env } from '../config/env';
import { procesarPendientes } from '../services/evaluacionIa.service';

let ejecutando = false;

export function iniciarJobEvaluacionIa(): void {
  cron.schedule(env.evaluacionIaCronExpr, async () => {
    if (ejecutando) {
      return;
    }

    ejecutando = true;
    try {
      await procesarPendientes();
    } catch (err) {
      console.error('Error procesando evaluaciones IA', err);
    } finally {
      ejecutando = false;
    }
  });
}
