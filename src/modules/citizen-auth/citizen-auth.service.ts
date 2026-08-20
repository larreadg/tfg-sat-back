import jwt, { SignOptions } from 'jsonwebtoken';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { BadRequestError, TooManyRequestsError, UnauthorizedError } from '../../shared/utils/errors';
import { generarCodigoNumerico } from '../../shared/utils/otp';
import {
  CiudadanoPreAuthPayload,
  CiudadanoSessionPayload,
  CiudadanoTokenPayload,
  CiudadanoTokenStage,
  PayloadPorEtapaCiudadano,
} from './citizen-auth.types';
import * as captchaService from '../../shared/services/captcha.service';
import { enviarSms } from '../../shared/services/sms.service';

const LONGITUD_CODIGO = 4;
const EXPIRACION_MINUTOS = 5;
const MAX_INTENTOS = 3;
const TELEFONO_REGEX = /^\+?\d{6,15}$/;

export async function login(ip: string, telefono: string, captcha: string): Promise<string> {
  await captchaService.verifyCaptcha(ip, captcha);
  validarTelefono(telefono);

  await enviarCodigo(ip, telefono);

  return firmarPreAuthToken(telefono);
}

export async function reenviarCodigo(ip: string, preAuthToken: string): Promise<void> {
  const payload = verificarPayload(preAuthToken, 'ciudadano-pre-auth');

  await enviarCodigo(ip, payload.telefono);
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

  if (registro.intentos >= MAX_INTENTOS) {
    await prisma.validacionSms.delete({ where: { id: registro.id } });
    throw new TooManyRequestsError('Se supero el numero maximo de intentos. Solicita un nuevo codigo.');
  }

  if (registro.codigo !== codigo) {
    await prisma.validacionSms.update({
      where: { id: registro.id },
      data: { intentos: registro.intentos + 1 },
    });
    throw new BadRequestError('El codigo de verificacion es incorrecto.');
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

  return firmarSessionToken(usuarioCiudadano.id, payload.telefono, registro.id);
}

export function verificarTokenSesion(token: string): CiudadanoSessionPayload {
  return verificarPayload(token, 'ciudadano-session');
}

async function enviarCodigo(ip: string, telefono: string): Promise<void> {
  const codigo = generarCodigoNumerico(LONGITUD_CODIGO);
  const expiracion = new Date(Date.now() + EXPIRACION_MINUTOS * 60 * 1000);

  await prisma.$transaction([
    prisma.validacionSms.deleteMany({ where: { telefono, verificado: false } }),
    prisma.validacionSms.create({ data: { telefono, ip, codigo, expiracion } }),
  ]);

  await enviarSms(telefono, `Tu codigo de verificacion es ${codigo}. Vence en ${EXPIRACION_MINUTOS} minutos.`);
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
