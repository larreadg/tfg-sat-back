import { Request, Response as ExpressResponse, NextFunction } from 'express';
import * as webhooksService from './webhooks.service';
import { Response as ApiResponse } from '../../shared/utils/response';
import { ACCIONES, ESTADOS_ALERTA, ETIQUETAS_NIVEL, EVENTOS } from './webhooks.eventos';
import {
  ActualizarReglaBody,
  ActualizarRemitenteBody,
  CrearReglaBody,
  ListarEntregasQuery,
  ListarReglasQuery,
} from './webhooks.validation';

/**
 * Catalogo de eventos, acciones y condiciones. Es lo que le permite al panel armar
 * el formulario de una regla sin tener cableado nada: si el backend suma un evento,
 * la UI lo ofrece sola.
 */
export function obtenerCatalogo(_req: Request, res: ExpressResponse, next: NextFunction): void {
  try {
    const catalogo = {
      eventos: EVENTOS,
      acciones: ACCIONES,
      estadosAlerta: ESTADOS_ALERTA,
      etiquetasNivel: ETIQUETAS_NIVEL,
    };
    res.status(200).json(ApiResponse.success(200, catalogo, 'Catalogo de webhooks obtenido correctamente.'));
  } catch (err) {
    next(err);
  }
}

export async function obtenerRemitente(_req: Request, res: ExpressResponse, next: NextFunction): Promise<void> {
  try {
    const remitente = await webhooksService.obtenerRemitente();
    res.status(200).json(ApiResponse.success(200, remitente, 'Remitente obtenido correctamente.'));
  } catch (err) {
    next(err);
  }
}

export async function actualizarRemitente(
  req: Request,
  res: ExpressResponse,
  next: NextFunction,
): Promise<void> {
  try {
    const input = req.body as ActualizarRemitenteBody;
    const remitente = await webhooksService.guardarRemitente(input, req.usuario!.usuarioId);
    res.status(200).json(ApiResponse.success(200, remitente, 'Remitente guardado correctamente.'));
  } catch (err) {
    next(err);
  }
}

export async function listarReglas(req: Request, res: ExpressResponse, next: NextFunction): Promise<void> {
  try {
    const query = req.query as unknown as ListarReglasQuery;
    const resultado = await webhooksService.listarReglas(query);
    res
      .status(200)
      .json(ApiResponse.success(200, resultado.data, 'Reglas obtenidas correctamente.', resultado.meta));
  } catch (err) {
    next(err);
  }
}

export async function obtenerRegla(req: Request, res: ExpressResponse, next: NextFunction): Promise<void> {
  try {
    const regla = await webhooksService.obtenerRegla(Number(req.params.id));
    res.status(200).json(ApiResponse.success(200, regla, 'Regla obtenida correctamente.'));
  } catch (err) {
    next(err);
  }
}

export async function crearRegla(req: Request, res: ExpressResponse, next: NextFunction): Promise<void> {
  try {
    const input = req.body as CrearReglaBody;
    const regla = await webhooksService.crearRegla(input, req.usuario!.usuarioId);
    res.status(201).json(ApiResponse.success(201, regla, 'Regla creada correctamente.'));
  } catch (err) {
    next(err);
  }
}

export async function actualizarRegla(req: Request, res: ExpressResponse, next: NextFunction): Promise<void> {
  try {
    const input = req.body as ActualizarReglaBody;
    const regla = await webhooksService.actualizarRegla(Number(req.params.id), input, req.usuario!.usuarioId);
    res.status(200).json(ApiResponse.success(200, regla, 'Regla actualizada correctamente.'));
  } catch (err) {
    next(err);
  }
}

export async function eliminarRegla(req: Request, res: ExpressResponse, next: NextFunction): Promise<void> {
  try {
    await webhooksService.eliminarRegla(Number(req.params.id));
    res.status(200).json(ApiResponse.success(200, null, 'Regla eliminada correctamente.'));
  } catch (err) {
    next(err);
  }
}

/**
 * Dispara la regla con un payload de ejemplo. Responde 200 con el resultado del
 * intento —exito o fallo— en vez de traducir el fallo a 4xx/5xx: a diferencia del
 * envio de prueba del SMTP, aca el valor esta en la BITACORA. Una entrega fallida es
 * un resultado legitimo de la operacion "probar", y el panel la muestra igual que
 * las entregas reales.
 */
export async function probarRegla(req: Request, res: ExpressResponse, next: NextFunction): Promise<void> {
  try {
    const entrega = await webhooksService.probarRegla(Number(req.params.id));
    res
      .status(200)
      .json(
        ApiResponse.success(
          200,
          entrega,
          entrega.exito ? 'La prueba se entrego correctamente.' : 'La prueba fallo: revisa el detalle.',
        ),
      );
  } catch (err) {
    next(err);
  }
}

export async function listarEntregas(req: Request, res: ExpressResponse, next: NextFunction): Promise<void> {
  try {
    const query = req.query as unknown as ListarEntregasQuery;
    const resultado = await webhooksService.listarEntregas(Number(req.params.id), query);
    res
      .status(200)
      .json(ApiResponse.success(200, resultado.data, 'Entregas obtenidas correctamente.', resultado.meta));
  } catch (err) {
    next(err);
  }
}
