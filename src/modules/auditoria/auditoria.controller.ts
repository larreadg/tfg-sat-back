import { NextFunction, Request, Response as ExpressResponse } from 'express';
import * as auditoriaService from './auditoria.service';
import { Response as ApiResponse } from '../../shared/utils/response';
import { AuditoriaIdParam, ListarAuditoriaQuery } from './auditoria.validation';

export async function listar(req: Request, res: ExpressResponse, next: NextFunction): Promise<void> {
  try {
    const filtros = req.query as unknown as ListarAuditoriaQuery;
    const { items, page, pageSize, total, totalPages } = await auditoriaService.listarAuditoria(filtros);

    res.status(200).json(
      ApiResponse.success(200, items, 'Bitacora obtenida correctamente.', {
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

export async function obtenerCatalogo(
  _req: Request,
  res: ExpressResponse,
  next: NextFunction,
): Promise<void> {
  try {
    const catalogo = await auditoriaService.obtenerCatalogo();
    res.status(200).json(ApiResponse.success(200, catalogo, 'Catalogo de auditoria obtenido correctamente.'));
  } catch (err) {
    next(err);
  }
}

export async function detalle(req: Request, res: ExpressResponse, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params as unknown as AuditoriaIdParam;
    const entrada = await auditoriaService.obtenerEntrada(id);
    res.status(200).json(ApiResponse.success(200, entrada, 'Entrada de auditoria obtenida correctamente.'));
  } catch (err) {
    next(err);
  }
}
