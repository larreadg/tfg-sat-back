import { Request, Response as ExpressResponse, NextFunction } from 'express';
import * as reportesAdminService from './reportes-admin.service';
import { Response as ApiResponse } from '../../shared/utils/response';
import { PERMISOS } from '../../shared/permissions';
import { ListarReportesQuery, ReporteIdParam } from './reportes-admin.validation';

export async function listar(req: Request, res: ExpressResponse, next: NextFunction): Promise<void> {
  try {
    const filtros = req.query as unknown as ListarReportesQuery;
    // Mismo criterio que el detalle: el telefono (PII) solo va para quien tiene
    // `usuario_ciudadano.ver` (ADMIN). ORGANISMO ve el listado sin telefono y
    // el filtro por telefono se ignora (ERS §8, §14).
    const incluirTelefono = req.usuario!.permisos.includes(PERMISOS.USUARIOS_CIUDADANOS_VER);
    const { items, page, pageSize, total, totalPages } = await reportesAdminService.listarReportes(
      filtros,
      incluirTelefono,
    );

    res.status(200).json(
      ApiResponse.success(200, items, 'Reportes obtenidos correctamente.', {
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
    const { id } = req.params as unknown as ReporteIdParam;
    // El telefono es PII del ciudadano: solo lo ve quien tiene `usuario_ciudadano.ver`
    // (ADMIN). ORGANISMO (solo lectura del panel) no lo recibe (ERS §8, §14).
    const incluirTelefono = req.usuario!.permisos.includes(PERMISOS.USUARIOS_CIUDADANOS_VER);

    const reporte = await reportesAdminService.obtenerReporteDetalle(id, incluirTelefono);

    res.status(200).json(ApiResponse.success(200, reporte, 'Detalle del reporte obtenido correctamente.'));
  } catch (err) {
    next(err);
  }
}
