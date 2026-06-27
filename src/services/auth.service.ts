import jwt, { SignOptions } from 'jsonwebtoken';
import { prisma } from '../config/prisma';
import { env } from '../config/env';
import { verifyPassword } from '../utils/password';
import { UnauthorizedError } from '../utils/errors';
import { PreAuthPayload } from '../models/auth.model';
import * as dobleFactorService from './dobleFactor.service';
import * as captchaService from './captcha.service';

export async function login(
  ip: string,
  correoElectronico: string,
  contrasena: string,
  captcha: string,
): Promise<string> {
  await captchaService.verifyCaptcha(ip, captcha);

  const usuario = await prisma.usuario.findUnique({ where: { correoElectronico } });

  if (!usuario || !usuario.activo || !verifyPassword(contrasena, usuario.hashContrasena)) {
    throw new UnauthorizedError('Credenciales invalidas.');
  }

  await dobleFactorService.solicitarDobleFactor(usuario.id);

  return firmarPreAuthToken(usuario.id);
}

export async function reenviarCodigo(preAuthToken: string): Promise<void> {
  const payload = verificarPreAuthToken(preAuthToken);

  await dobleFactorService.solicitarDobleFactor(payload.usuarioId);
}

export async function verificarSegundoFactor(preAuthToken: string, codigo: string): Promise<string> {
  const payload = verificarPreAuthToken(preAuthToken);

  await dobleFactorService.verificarDobleFactor(payload.usuarioId, codigo);

  return jwt.sign({ usuarioId: payload.usuarioId }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn as SignOptions['expiresIn'],
  });
}

function firmarPreAuthToken(usuarioId: number): string {
  const payload: PreAuthPayload = { usuarioId, etapa: 'pre-auth' };
  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: env.jwtPreAuthExpiresIn as SignOptions['expiresIn'],
  });
}

function verificarPreAuthToken(token: string): PreAuthPayload {
  try {
    const payload = jwt.verify(token, env.jwtSecret) as PreAuthPayload;

    if (payload.etapa !== 'pre-auth') {
      throw new Error('Etapa de token invalida.');
    }

    return payload;
  } catch {
    throw new UnauthorizedError('Token de verificacion invalido o expirado.');
  }
}
