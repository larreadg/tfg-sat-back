import jwt, { SignOptions } from 'jsonwebtoken';
import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { env } from '../config/env';
import { verifyPassword } from '../utils/password';
import { UnauthorizedError } from '../utils/errors';
import {
  AuthTokenPayload,
  PayloadPorEtapa,
  PreAuthPayload,
  RefreshTokenPayload,
  SessionPayload,
  TokenPair,
  TokenStage,
} from '../models/auth.model';
import * as dobleFactorService from './dobleFactor.service';
import * as captchaService from './captcha.service';

type UsuarioConPermisos = Prisma.UsuarioGetPayload<{
  include: {
    persona: true;
    roles: { include: { rolPermisos: { include: { permiso: true } } } };
  };
}>;

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
  const payload = verificarPayload(preAuthToken, 'pre-auth', env.jwtSecret);

  await dobleFactorService.solicitarDobleFactor(payload.usuarioId);
}

export async function verificarSegundoFactor(preAuthToken: string, codigo: string): Promise<TokenPair> {
  const payload = verificarPayload(preAuthToken, 'pre-auth', env.jwtSecret);

  await dobleFactorService.verificarDobleFactor(payload.usuarioId, codigo);

  const usuario = await obtenerUsuarioConPermisos(payload.usuarioId);

  return generarParDeTokens(usuario);
}

export async function refrescarToken(refreshToken: string): Promise<TokenPair> {
  const payload = verificarPayload(refreshToken, 'refresh', env.jwtRefreshSecret);

  const tokenHash = hashToken(refreshToken);
  const registro = await prisma.refreshToken.findUnique({ where: { tokenHash } });

  if (!registro || registro.revocado || registro.usuarioId !== payload.usuarioId) {
    throw new UnauthorizedError('Refresh token invalido.');
  }

  if (registro.expiracion < new Date()) {
    await prisma.refreshToken.update({ where: { id: registro.id }, data: { revocado: true } });
    throw new UnauthorizedError('Refresh token expirado.');
  }

  const usuario = await obtenerUsuarioConPermisos(payload.usuarioId);

  await prisma.refreshToken.update({ where: { id: registro.id }, data: { revocado: true } });

  return generarParDeTokens(usuario);
}

export function verificarAccessToken(token: string): SessionPayload {
  return verificarPayload(token, 'access', env.jwtSecret);
}

export async function logout(refreshToken: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(refreshToken) },
    data: { revocado: true },
  });
}

async function obtenerUsuarioConPermisos(usuarioId: number): Promise<UsuarioConPermisos> {
  const usuario = await prisma.usuario.findUnique({
    where: { id: usuarioId },
    include: {
      persona: true,
      roles: { include: { rolPermisos: { include: { permiso: true } } } },
    },
  });

  if (!usuario) {
    throw new UnauthorizedError('Usuario no encontrado.');
  }

  return usuario;
}

async function generarParDeTokens(usuario: UsuarioConPermisos): Promise<TokenPair> {
  const permisos = [
    ...new Set(
      usuario.roles.flatMap((rol) => rol.rolPermisos.map((rolPermiso) => rolPermiso.permiso.nombre)),
    ),
  ];

  const sessionPayload: SessionPayload = {
    etapa: 'access',
    usuarioId: usuario.id,
    correoElectronico: usuario.correoElectronico,
    nombres: usuario.persona.nombres,
    apellidos: usuario.persona.apellidos,
    documento: usuario.persona.documento,
    permisos,
  };

  const accessToken = jwt.sign(sessionPayload, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn as SignOptions['expiresIn'],
  });

  const refreshToken = await firmarRefreshToken(usuario.id);

  return { accessToken, refreshToken };
}

async function firmarRefreshToken(usuarioId: number): Promise<string> {
  const payload: RefreshTokenPayload = { etapa: 'refresh', usuarioId, jti: crypto.randomUUID() };

  const refreshToken = jwt.sign(payload, env.jwtRefreshSecret, {
    expiresIn: env.jwtRefreshExpiresIn as SignOptions['expiresIn'],
  });

  await prisma.refreshToken.create({
    data: {
      usuarioId,
      tokenHash: hashToken(refreshToken),
      expiracion: obtenerExpiracion(refreshToken),
    },
  });

  return refreshToken;
}

function firmarPreAuthToken(usuarioId: number): string {
  const payload: PreAuthPayload = { usuarioId, etapa: 'pre-auth' };
  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: env.jwtPreAuthExpiresIn as SignOptions['expiresIn'],
  });
}

function verificarPayload<TStage extends TokenStage>(
  token: string,
  etapa: TStage,
  secret: string,
): PayloadPorEtapa<TStage> {
  try {
    const payload = jwt.verify(token, secret) as AuthTokenPayload;

    if (payload.etapa !== etapa) {
      throw new Error('Etapa de token invalida.');
    }

    return payload as PayloadPorEtapa<TStage>;
  } catch {
    throw new UnauthorizedError('Token invalido o expirado.');
  }
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function obtenerExpiracion(token: string): Date {
  const decoded = jwt.decode(token) as { exp?: number } | null;

  if (!decoded?.exp) {
    throw new Error('No se pudo determinar la expiracion del refresh token.');
  }

  return new Date(decoded.exp * 1000);
}
