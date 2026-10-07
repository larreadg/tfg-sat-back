import { Request, Response as ExpressResponse, NextFunction } from 'express';
import * as alertasService from './alertas.service';
import { Response as ApiResponse } from '../../shared/utils/response';
import { AlertaIdParam, CambiarEstadoBody, ListarAlertasQuery } from './alertas.validation';

export async function listar(req: Request, res: ExpressResponse, next: NextFunction): Promise<void> {
  try {
    const filtros = req.query as unknown as ListarAlertasQuery;
    const { items, page, pageSize, total, totalPages } = await alertasService.listarAlertas(filtros);

    res.status(200).json(
      ApiResponse.success(200, items, 'Alertas obtenidas correctamente.', {
        page,
        limit: pageSize,
        total,
        totalPages,
      }),
    );
  } catch (err) {
    next(err);
  }
}

export async function detalle(req: Request, res: ExpressResponse, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params as unknown as AlertaIdParam;
    const alerta = await alertasService.obtenerAlertaDetalle(id);

    res.status(200).json(ApiResponse.success(200, alerta, 'Detalle de la alerta obtenido correctamente.'));
  } catch (err) {
    next(err);
  }
}

export async function cambiarEstado(
  req: Request,
  res: ExpressResponse,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params as unknown as AlertaIdParam;
    const { estadoNuevo, observacion } = req.body as CambiarEstadoBody;

    const alerta = await alertasService.cambiarEstadoAlerta(
      id,
      estadoNuevo,
      req.usuario!.usuarioId,
      observacion,
    );

    res.status(200).json(
      ApiResponse.success(200, alerta, 'Estado de la alerta actualizado correctamente.'),
    );
  } catch (err) {
    next(err);
  }
}
