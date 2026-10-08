import jwt, { SignOptions } from 'jsonwebtoken';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { BadRequestError, TooManyRequestsError, UnauthorizedError } from '../../shared/utils/errors';
import { generarCodigoNumerico, hashCodigo, verificarCodigo as compararCodigoHash } from '../../shared/utils/otp';
import {
  CiudadanoPreAuthPayload,
  CiudadanoSessionPayload,
  CiudadanoTokenPayload,
  CiudadanoTokenStage,
  PayloadPorEtapaCiudadano,
} from './citizen-auth.types';
import { verificarTurnstile } from '../../shared/services/turnstile.service';
import { obtenerLimitesAntiabuso } from '../../shared/services/limites.service';
import { enviarCodigoVerificacion } from '../../shared/services/sms.service';
import { registrarAuditoria } from '../auditoria/auditoria.registro';

const LONGITUD_CODIGO = 4;
const EXPIRACION_MINUTOS = 5;
const MAX_INTENTOS = 3;
const TELEFONO_REGEX = /^\+?\d{6,15}$/;

export async function login(
  ip: string,
  telefono: string,
  turnstileToken: string,
): Promise<string> {
  await verificarTurnstile(turnstileToken, ip);
  validarTelefono(telefono);

  await enviarCodigo(ip, telefono);

  registrarAuditoria({
    accion: 'CIUDADANO_OTP_SOLICITAR',
    descripcion: 'Un ciudadano pidio un codigo de verificacion por SMS',
    // El telefono va enmascarado (lo hace `registrarAuditoria`): la bitacora la
    // lee quien tiene `auditoria.ver`, que no es el permiso que habilita ver PII
    // del ciudadano. La IP si queda completa: es el dato anti-abuso.
    actor: { tipo: 'CIUDADANO', telefono },
  });

  return firmarPreAuthToken(telefono);
}

export async function reenviarCodigo(ip: string, preAuthToken: string): Promise<void> {
  const payload = verificarPayload(preAuthToken, 'ciudadano-pre-auth');

  await enviarCodigo(ip, payload.telefono);

  registrarAuditoria({
    accion: 'CIUDADANO_OTP_SOLICITAR',
    descripcion: 'Un ciudadano pidio que le reenvien el codigo de verificacion',
    actor: { tipo: 'CIUDADANO', telefono: payload.telefono },
    metadatos: { reenvio: true },
  });
}

export async function verificarCodigo(preAuthToken: string, codigo: string): Promise<string> {
  const payload = verificarPayload(preAuthToken, 'ciudadano-pre-auth');

  const registro = await prisma.validacionSms.findFirst({
    where: { telefono: payload.telefono, verificado: false },
    orderBy: { fechaCreacion: 'desc' },
  });

  if (!registro) {
    throw new BadRequestError('No existe un codigo de verificacion vigente. Solicita uno nuevo.');
  }

  if (registro.expiracion < new Date()) {
    await prisma.validacionSms.delete({ where: { id: registro.id } });
    throw new BadRequestError('El codigo de verificacion ha expirado. Solicita uno nuevo.');
  }

  if (!compararCodigoHash(codigo, registro.codigo)) {
    const intentos = registro.intentos + 1;
    const restantes = MAX_INTENTOS - intentos;

    registrarAuditoria({
      accion: 'CIUDADANO_OTP_VERIFICAR',
      entidadId: registro.id,
      descripcion: 'Codigo de verificacion por SMS incorrecto',
      exito: false,
      actor: { tipo: 'CIUDADANO', telefono: payload.telefono },
      metadatos: { intentos, intentosRestantes: Math.max(restantes, 0) },
    });

    // Mismo criterio que el 2FA del panel: agotados los intentos el codigo se
    // invalida en el acto, no en el intento siguiente.
    if (restantes <= 0) {
      await prisma.validacionSms.delete({ where: { id: registro.id } });
      throw new TooManyRequestsError(
        `Se supero el maximo de ${MAX_INTENTOS} intentos. Solicita un nuevo codigo.`,
      );
    }

    await prisma.validacionSms.update({ where: { id: registro.id }, data: { intentos } });
    throw new BadRequestError(
      `El codigo de verificacion es incorrecto. Te ${restantes === 1 ? 'queda 1 intento' : `quedan ${restantes} intentos`}.`,
    );
  }

  const usuarioCiudadano = await prisma.usuarioCiudadano.upsert({
    where: { telefono: payload.telefono },
    update: {},
    create: { telefono: payload.telefono },
  });

  await prisma.validacionSms.update({
    where: { id: registro.id },
    data: { verificado: true, usuarioCiudadanoId: usuarioCiudadano.id },
  });

  registrarAuditoria({
    accion: 'CIUDADANO_OTP_VERIFICAR',
    entidadId: registro.id,
    descripcion: 'Un ciudadano verifico su numero y quedo habilitado para reportar',
    actor: { tipo: 'CIUDADANO', telefono: payload.telefono },
    metadatos: { usuarioCiudadanoId: usuarioCiudadano.id },
  });

  return firmarSessionToken(usuarioCiudadano.id, payload.telefono, registro.id);
}

export function verificarTokenSesion(token: string): CiudadanoSessionPayload {
  return verificarPayload(token, 'ciudadano-session');
}

async function enviarCodigo(ip: string, telefono: string): Promise<void> {
  await verificarLimiteOtpPorHora(telefono);

  const codigo = generarCodigoNumerico(LONGITUD_CODIGO);
  const expiracion = new Date(Date.now() + EXPIRACION_MINUTOS * 60 * 1000);

  // No borramos los codigos previos: se necesitan para contar envios por hora
  // (anti-abuso). La verificacion siempre usa el mas reciente (findFirst desc) y
  // los viejos expiran solos.
  await prisma.validacionSms.create({ data: { telefono, ip, codigo: hashCodigo(codigo), expiracion } });

  await enviarCodigoVerificacion(telefono, codigo, EXPIRACION_MINUTOS);
}

/**
 * Limite anti-abuso: N envios de OTP por hora por numero (ERS §3, configurable).
 * Cuenta solo envios OTP reales (codigo no vacio) — excluye las anclas de los
 * bots, que tienen `codigo=''`.
 */
async function verificarLimiteOtpPorHora(telefono: string): Promise<void> {
  const { otpPorHora } = await obtenerLimitesAntiabuso();
  const desde = new Date(Date.now() - 60 * 60 * 1000);

  const enviadosUltimaHora = await prisma.validacionSms.count({
    where: { telefono, codigo: { not: '' }, fechaCreacion: { gte: desde } },
  });

  if (enviadosUltimaHora >= otpPorHora) {
    throw new TooManyRequestsError(
      'Alcanzaste el limite de codigos por hora para este numero. Espera un momento e intenta de nuevo.',
    );
  }
}

function validarTelefono(telefono: string): void {
  if (!TELEFONO_REGEX.test(telefono)) {
    throw new BadRequestError('El numero de telefono no es valido.');
  }
}

function firmarPreAuthToken(telefono: string): string {
  const payload: CiudadanoPreAuthPayload = { etapa: 'ciudadano-pre-auth', telefono };
  return jwt.sign(payload, env.jwtCiudadanoSecret, {
    expiresIn: env.jwtCiudadanoPreAuthExpiresIn as SignOptions['expiresIn'],
  });
}

function firmarSessionToken(usuarioCiudadanoId: number, telefono: string, validacionSmsId: number): string {
  const payload: CiudadanoSessionPayload = {
    etapa: 'ciudadano-session',
    usuarioCiudadanoId,
    telefono,
    validacionSmsId,
  };
  return jwt.sign(payload, env.jwtCiudadanoSecret, {
    expiresIn: env.jwtCiudadanoSessionExpiresIn as SignOptions['expiresIn'],
  });
}

function verificarPayload<TStage extends CiudadanoTokenStage>(
  token: string,
  etapa: TStage,
): PayloadPorEtapaCiudadano<TStage> {
  try {
    const payload = jwt.verify(token, env.jwtCiudadanoSecret) as CiudadanoTokenPayload;

    if (payload.etapa !== etapa) {
      throw new Error('Etapa de token invalida.');
    }

    return payload as PayloadPorEtapaCiudadano<TStage>;
  } catch {
    throw new UnauthorizedError('Token invalido o expirado.');
  }
}
