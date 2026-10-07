import { Request, Response as ExpressResponse, NextFunction } from 'express';
import * as configuracionService from './configuracion.service';
import { Response as ApiResponse } from '../../shared/utils/response';
import {
  ActualizarConfiguracionBody,
  ActualizarNotificacionBody,
  ProbarNotificacionBody,
  VersionesQuery,
} from './configuracion.validation';

export async function obtener(_req: Request, res: ExpressResponse, next: NextFunction): Promise<void> {
  try {
    const config = await configuracionService.obtenerConfiguracionActiva();
    res.status(200).json(ApiResponse.success(200, config, 'Configuracion activa obtenida correctamente.'));
  } catch (err) {
    next(err);
  }
}

export async function actualizar(req: Request, res: ExpressResponse, next: NextFunction): Promise<void> {
  try {
    const input = req.body as ActualizarConfiguracionBody;
    const config = await configuracionService.crearNuevaVersion(input, req.usuario!.usuarioId);
    res.status(201).json(ApiResponse.success(201, config, 'Nueva version de configuracion creada y activada.'));
  } catch (err) {
    next(err);
  }
}

export async function listarVersiones(req: Request, res: ExpressResponse, next: NextFunction): Promise<void> {
  try {
    const { page, limit } = req.query as unknown as VersionesQuery;
    const resultado = await configuracionService.listarVersiones({ page, limit });
    res
      .status(200)
      .json(
        ApiResponse.success(200, resultado.data, 'Versiones de configuracion obtenidas correctamente.', resultado.meta),
      );
  } catch (err) {
    next(err);
  }
}

export async function obtenerVersion(req: Request, res: ExpressResponse, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    const config = await configuracionService.obtenerVersion(id);
    res.status(200).json(ApiResponse.success(200, config, 'Version de configuracion obtenida correctamente.'));
  } catch (err) {
    next(err);
  }
}

export async function obtenerSistema(_req: Request, res: ExpressResponse, next: NextFunction): Promise<void> {
  try {
    const estado = await configuracionService.obtenerEstadoSistema();
    res.status(200).json(ApiResponse.success(200, estado, 'Estado del sistema obtenido correctamente.'));
  } catch (err) {
    next(err);
  }
}

export async function obtenerNotificaciones(
  _req: Request,
  res: ExpressResponse,
  next: NextFunction,
): Promise<void> {
  try {
    const config = await configuracionService.obtenerNotificaciones();
    res
      .status(200)
      .json(ApiResponse.success(200, config, 'Configuracion de notificaciones obtenida correctamente.'));
  } catch (err) {
    next(err);
  }
}

export async function actualizarNotificaciones(
  req: Request,
  res: ExpressResponse,
  next: NextFunction,
): Promise<void> {
  try {
    const input = req.body as ActualizarNotificacionBody;
    const config = await configuracionService.guardarNotificaciones(input, req.usuario!.usuarioId);
    res
      .status(200)
      .json(ApiResponse.success(200, config, 'Configuracion de notificaciones guardada correctamente.'));
  } catch (err) {
    next(err);
  }
}

/**
 * Envio de prueba. 200 solo si el correo salio de verdad; si el SMTP falla, el
 * service tira 502 y lo traduce el error-handler (nunca un 200 con `exito:false`).
 */
export async function probarNotificaciones(
  req: Request,
  res: ExpressResponse,
  next: NextFunction,
): Promise<void> {
  try {
    const { destinatario } = req.body as ProbarNotificacionBody;
    const resultado = await configuracionService.enviarCorreoPrueba(destinatario);
    res
      .status(200)
      .json(ApiResponse.success(200, resultado, `Correo de prueba enviado a ${resultado.destinatario}.`));
  } catch (err) {
    next(err);
  }
}
