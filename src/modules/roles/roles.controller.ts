import { Request, Response as ExpressResponse, NextFunction } from 'express';
import * as rolesService from './roles.service';
import { Response as ApiResponse } from '../../shared/utils/response';
import { ActualizarRolBody, CrearRolBody, RolIdParam } from './roles.validation';

export async function listarPermisos(_req: Request, res: ExpressResponse, next: NextFunction): Promise<void> {
  try {
    const permisos = await rolesService.listarPermisos();
    res.status(200).json(ApiResponse.success(200, permisos, 'Permisos obtenidos correctamente.'));
  } catch (err) {
    next(err);
  }
}

export async function listar(_req: Request, res: ExpressResponse, next: NextFunction): Promise<void> {
  try {
    const roles = await rolesService.listarRoles();
    res.status(200).json(ApiResponse.success(200, roles, 'Roles obtenidos correctamente.'));
  } catch (err) {
    next(err);
  }
}

export async function detalle(req: Request, res: ExpressResponse, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params as unknown as RolIdParam;
    const rol = await rolesService.obtenerRol(id);
    res.status(200).json(ApiResponse.success(200, rol, 'Rol obtenido correctamente.'));
  } catch (err) {
    next(err);
  }
}

export async function crear(req: Request, res: ExpressResponse, next: NextFunction): Promise<void> {
  try {
    const input = req.body as CrearRolBody;
    const rol = await rolesService.crearRol(input, req.usuario!.usuarioId);
    res.status(201).json(ApiResponse.success(201, rol, 'Rol creado correctamente.'));
  } catch (err) {
    next(err);
  }
}

export async function actualizar(req: Request, res: ExpressResponse, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params as unknown as RolIdParam;
    const input = req.body as ActualizarRolBody;
    const rol = await rolesService.actualizarRol(id, input, req.usuario!.usuarioId);
    res.status(200).json(ApiResponse.success(200, rol, 'Rol actualizado correctamente.'));
  } catch (err) {
    next(err);
  }
}

export async function eliminar(req: Request, res: ExpressResponse, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params as unknown as RolIdParam;
    await rolesService.eliminarRol(id);
    res.status(200).json(ApiResponse.success(200, null, 'Rol eliminado correctamente.'));
  } catch (err) {
    next(err);
  }
}
