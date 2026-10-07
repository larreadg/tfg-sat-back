import axios from 'axios';
import { env } from '../../config/env';
import { BadRequestError } from '../utils/errors';

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

interface TurnstileSiteverifyResponse {
  success: boolean;
  'error-codes'?: string[];
}

/**
 * Verifica server-side un token de Cloudflare Turnstile (RF-29). Es el UNICO
 * gate anti-bot de los flujos publicos (login del panel, validacion de telefono
 * y envio de reporte), asi que FALLA CERRADO: sin token valido no se pasa.
 *
 * - El token NUNCA se loguea.
 * - Un token sirve una sola vez: Cloudflare lo invalida al canjearlo, asi que
 *   el front tiene que resetear el widget despues de cada intento.
 * - Si Cloudflare no responde, se rechaza igual (no se degrada a "pasa"): un
 *   corte del verificador no puede convertirse en una puerta abierta.
 *
 * En desarrollo no hace falta cuenta de Cloudflare: existen claves de prueba
 * que siempre validan (ver `.env.example`).
 */
export async function verificarTurnstile(token: string | undefined, ip?: string): Promise<void> {
  if (!token) {
    throw new BadRequestError('Falta completar la verificacion de seguridad.');
  }

  const params = new URLSearchParams();
  params.append('secret', env.turnstileSecret);
  params.append('response', token);
  if (ip) {
    params.append('remoteip', ip);
  }

  let respuesta: TurnstileSiteverifyResponse;
  try {
    const { data } = await axios.post<TurnstileSiteverifyResponse>(SITEVERIFY_URL, params, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 8000,
    });
    respuesta = data;
  } catch (err) {
    // Se loguea el motivo tecnico (sin el token) y se rechaza el intento.
    console.error('[turnstile] No se pudo verificar el token con Cloudflare', err);
    throw new BadRequestError('No se pudo completar la verificacion de seguridad. Intenta de nuevo en unos segundos.');
  }

  if (!respuesta.success) {
    // Los `error-codes` de Cloudflare no llevan datos del usuario: sirven para
    // distinguir token vencido/reusado de una mala configuracion del secret.
    console.warn('[turnstile] Token rechazado', respuesta['error-codes'] ?? []);
    throw new BadRequestError('La verificacion de seguridad no paso. Recarga la pagina e intenta de nuevo.');
  }
}
