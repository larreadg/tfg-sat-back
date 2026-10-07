import { Request, Response as ExpressResponse, NextFunction } from 'express';
import * as authService from './auth.service';
import { Response as ApiResponse } from '../../shared/utils/response';
import { LoginBody, VerificarDobleFactorBody } from './auth.validation';

export async function login(req: Request, res: ExpressResponse, next: NextFunction): Promise<void> {
  try {
    const { correoElectronico, contrasena, turnstileToken } = req.body as LoginBody;
    const ip = req.ip ?? req.socket.remoteAddress ?? '';
    const preAuthToken = await authService.login(ip, correoElectronico, contrasena, turnstileToken);
    res.status(200).json(ApiResponse.success(200, { preAuthToken }, 'Codigo de verificacion enviado correctamente.'));
  } catch (err) {
    next(err);
  }
}

export async function reenviarDobleFactor(req: Request, res: ExpressResponse, next: NextFunction): Promise<void> {
  try {
    const { preAuthToken } = req.body;
    await authService.reenviarCodigo(preAuthToken);
    res.status(201).json(ApiResponse.success(201, null, 'Codigo de verificacion reenviado correctamente.'));
  } catch (err) {
    next(err);
  }
}

export async function verificarDobleFactor(req: Request, res: ExpressResponse, next: NextFunction): Promise<void> {
  try {
    const { preAuthToken, codigo } = req.body as VerificarDobleFactorBody;
    const tokens = await authService.verificarSegundoFactor(preAuthToken, codigo);
    res.status(200).json(ApiResponse.success(200, tokens, 'Inicio de sesion exitoso.'));
  } catch (err) {
    next(err);
  }
}

export async function refrescarToken(req: Request, res: ExpressResponse, next: NextFunction): Promise<void> {
  try {
    const { refreshToken } = req.body;
    const tokens = await authService.refrescarToken(refreshToken);
    res.status(200).json(ApiResponse.success(200, tokens, 'Token renovado correctamente.'));
  } catch (err) {
    next(err);
  }
}

export async function logout(req: Request, res: ExpressResponse, next: NextFunction): Promise<void> {
  try {
    const { refreshToken } = req.body;
    await authService.logout(refreshToken);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
