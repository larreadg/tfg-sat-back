import { Request, Response as ExpressResponse, NextFunction } from 'express';
import * as ciudadanoAuthService from './citizen-auth.service';
import { Response as ApiResponse } from '../../shared/utils/response';
import { CitizenLoginBody, CitizenVerificarBody } from './citizen-auth.validation';

export async function login(req: Request, res: ExpressResponse, next: NextFunction): Promise<void> {
  try {
    const { telefono, captcha } = req.body as CitizenLoginBody;
    const ip = req.ip ?? req.socket.remoteAddress ?? '';
    const preAuthToken = await ciudadanoAuthService.login(ip, telefono, captcha);
    res.status(200).json(ApiResponse.success(200, { preAuthToken }, 'Codigo de verificacion enviado correctamente.'));
  } catch (err) {
    next(err);
  }
}

export async function reenviarDobleFactor(req: Request, res: ExpressResponse, next: NextFunction): Promise<void> {
  try {
    const { preAuthToken } = req.body;
    const ip = req.ip ?? req.socket.remoteAddress ?? '';
    await ciudadanoAuthService.reenviarCodigo(ip, preAuthToken);
    res.status(201).json(ApiResponse.success(201, null, 'Codigo de verificacion reenviado correctamente.'));
  } catch (err) {
    next(err);
  }
}

export async function verificarDobleFactor(req: Request, res: ExpressResponse, next: NextFunction): Promise<void> {
  try {
    const { preAuthToken, codigo } = req.body as CitizenVerificarBody;
    const token = await ciudadanoAuthService.verificarCodigo(preAuthToken, codigo);
    res.status(200).json(ApiResponse.success(200, { token }, 'Numero de telefono verificado correctamente.'));
  } catch (err) {
    next(err);
  }
}
