import { Request, Response as ExpressResponse, NextFunction } from 'express';
import * as puntosCriticosService from './puntos-criticos.service';
import { Response as ApiResponse } from '../../shared/utils/response';
import { ListarPuntosCriticosQuery } from './puntos-criticos.validation';

export async function listar(req: Request, res: ExpressResponse, next: NextFunction): Promise<void> {
  try {
    const filtros = req.query as unknown as ListarPuntosCriticosQuery;
    const { items, page, pageSize, total, totalPages } =
      await puntosCriticosService.listarPuntosCriticos(filtros);

    res.status(200).json(
      ApiResponse.success(200, items, 'Puntos criticos obtenidos correctamente.', {
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
