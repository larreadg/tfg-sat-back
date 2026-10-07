import jwt, { SignOptions } from 'jsonwebtoken';
import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { verifyPassword } from '../../shared/utils/password';
import { UnauthorizedError } from '../../shared/utils/errors';
import {
  AuthTokenPayload,
  PayloadPorEtapa,
  PreAuthPayload,
  RefreshTokenPayload,
  SessionPayload,
  TokenPair,
  TokenStage,
} from './auth.types';
import * as dobleFactorService from './doble-factor.service';
import { verificarTurnstile } from '../../shared/services/turnstile.service';
import { registrarAuditoria } from '../auditoria/auditoria.registro';

type UsuarioConPermisos = Prisma.UsuarioGetPayload<{
  include: {
    persona: true;
    roles: { include: { rol: { include: { rolPermisos: { include: { permiso: true } } } } } };
  };
}>;

export async function login(
  ip: string,
  correoElectronico: string,
  contrasena: string,
  turnstileToken: string,
): Promise<string> {
  // Gate anti-bot antes de tocar credenciales: encarece el fuerza bruta.
  await verificarTurnstile(turnstileToken, ip);

  const usuario = await prisma.usuario.findUnique({ where: { correoElectronico } });

  if (!usuario || !usuario.activo || !verifyPassword(contrasena, usuario.hashContrasena)) {
    // El rechazo se audita SIEMPRE, y con el detalle de por que: la secuencia de
    // intentos fallidos contra un correo valido es la unica senal de un ataque de
    // fuerza bruta que sobrevive al reinicio del proceso (los logs de consola no).
    // El motivo NO se le dice al cliente (sigue viendo "Credenciales invalidas",
    // para no convertir el login en un oraculo de correos registrados); queda
    // guardado para quien audita.
    registrarAuditoria({
      accion: 'SESION_LOGIN',
      entidadId: usuario?.id ?? null,
      descripcion: `Intento de inicio de sesion rechazado para ${correoElectronico}`,
      exito: false,
      // Si el correo no existe no hay a quien atribuir el intento: queda ANONIMO
      // con su IP. Si existe, se le atribuye, asi el filtro por usuario muestra
      // los intentos fallidos contra esa cuenta.
      actor: usuario ? { tipo: 'USUARIO', usuarioId: usuario.id } : { tipo: 'ANONIMO' },
      metadatos: {
        correoIntentado: correoElectronico,
        motivo: !usuario ? 'correo inexistente' : !usuario.activo ? 'usuario inactivo' : 'contrasena incorrecta',
      },
    });
    throw new UnauthorizedError('Credenciales invalidas.');
  }

  await dobleFactorService.solicitarDobleFactor(usuario.id);

  // Exito del PRIMER factor: la sesion todavia no existe. El cierre del login es
  // `SESION_DOBLE_FACTOR`; tener los dos pasos separados es lo que permite ver
  // "paso la contrasena pero nunca completo el codigo".
  registrarAuditoria({
    accion: 'SESION_LOGIN',
    entidadId: usuario.id,
    descripcion: `Verifico su contrasena y recibio el codigo de verificacion (${correoElectronico})`,
    actor: { tipo: 'USUARIO', usuarioId: usuario.id },
  });

  return firmarPreAuthToken(usuario.id);
}

export async function reenviarCodigo(preAuthToken: string): Promise<void> {
  const payload = verificarPayload(preAuthToken, 'pre-auth', env.jwtSecret);

  await dobleFactorService.solicitarDobleFactor(payload.usuarioId);
}

export async function verificarSegundoFactor(preAuthToken: string, codigo: string): Promise<TokenPair> {
  const payload = verificarPayload(preAuthToken, 'pre-auth', env.jwtSecret);

  try {
    await dobleFactorService.verificarDobleFactor(payload.usuarioId, codigo);
  } catch (err) {
    registrarAuditoria({
      accion: 'SESION_DOBLE_FACTOR',
      entidadId: payload.usuarioId,
      descripcion: 'Codigo de verificacion en dos pasos rechazado',
      exito: false,
      actor: { tipo: 'USUARIO', usuarioId: payload.usuarioId },
      // El codigo tecleado NO se guarda (y el saneador taparia la clave `codigo`
      // igual): lo que importa es el motivo, que ya viene redactado en el error.
      metadatos: { motivo: err instanceof Error ? err.message : 'error desconocido' },
    });
    throw err;
  }

  const usuario = await obtenerUsuarioConPermisos(payload.usuarioId);

  // Aca si hay sesion: es el punto donde el login quedo completo.
  registrarAuditoria({
    accion: 'SESION_DOBLE_FACTOR',
    entidadId: usuario.id,
    descripcion: `Inicio sesion en el panel (${usuario.correoElectronico})`,
    actor: { tipo: 'USUARIO', usuarioId: usuario.id },
  });

  return generarParDeTokens(usuario);
}

export async function refrescarToken(refreshToken: string): Promise<TokenPair> {
  const payload = verificarPayload(refreshToken, 'refresh', env.jwtRefreshSecret);

  const tokenHash = hashToken(refreshToken);
  const registro = await prisma.refreshToken.findUnique({ where: { tokenHash } });

  // La renovacion EXITOSA no se audita: ocurre cada pocos minutos por usuario
  // conectado y llenaria la bitacora de filas donde no paso nada (ver el apartado
  // "Que NO se audita" en `auditoria.acciones.ts`). El RECHAZO si: un refresh
  // revocado que alguien intenta reusar es la senal de un token robado.
  if (!registro || registro.revocado || registro.usuarioId !== payload.usuarioId) {
    registrarAuditoria({
      accion: 'SESION_REFRESH_RECHAZADO',
      entidadId: registro?.id ?? null,
      descripcion: 'Se rechazo la renovacion de una sesion',
      exito: false,
      actor: { tipo: 'USUARIO', usuarioId: payload.usuarioId },
      metadatos: {
        motivo: !registro
          ? 'el token no existe'
          : registro.revocado
            ? 'el token ya estaba revocado'
            : 'el token pertenece a otro usuario',
      },
    });
    throw new UnauthorizedError('Refresh token invalido.');
  }

  if (registro.expiracion < new Date()) {
    await prisma.refreshToken.update({ where: { id: registro.id }, data: { revocado: true } });
    registrarAuditoria({
      accion: 'SESION_REFRESH_RECHAZADO',
      entidadId: registro.id,
      descripcion: 'Se rechazo la renovacion de una sesion vencida',
      exito: false,
      actor: { tipo: 'USUARIO', usuarioId: payload.usuarioId },
      metadatos: { motivo: 'el token estaba vencido' },
    });
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
  const tokenHash = hashToken(refreshToken);

  // Se busca antes de revocar solo para saber de QUIEN es la sesion: la ruta de
  // logout no pide token de acceso, asi que el contexto de la request no tiene
  // actor y sin esto la salida quedaria anonima.
  const registro = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    select: { usuarioId: true },
  });

  const { count } = await prisma.refreshToken.updateMany({
    where: { tokenHash },
    data: { revocado: true },
  });

  // Un logout con un token que no existe o ya estaba revocado no se audita: es el
  // caso de la pestaña duplicada que cierra sesion dos veces, no un evento.
  if (count > 0 && registro) {
    registrarAuditoria({
      accion: 'SESION_CIERRE',
      entidadId: registro.usuarioId,
      descripcion: 'Cerro su sesion',
      actor: { tipo: 'USUARIO', usuarioId: registro.usuarioId },
    });
  }
}

async function obtenerUsuarioConPermisos(usuarioId: number): Promise<UsuarioConPermisos> {
  const usuario = await prisma.usuario.findUnique({
    where: { id: usuarioId },
    include: {
      persona: true,
      roles: { include: { rol: { include: { rolPermisos: { include: { permiso: true } } } } } },
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
      usuario.roles.flatMap((usuarioRol) =>
        usuarioRol.rol.rolPermisos.map((rolPermiso) => rolPermiso.permiso.nombre),
      ),
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
