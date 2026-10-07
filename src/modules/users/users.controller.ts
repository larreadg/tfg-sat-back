import { Request, Response as ExpressResponse, NextFunction } from 'express';
import * as userService from './users.service';
import { Response as ApiResponse } from '../../shared/utils/response';
import { ListUsersQuery } from './users.validation';

export async function getUsers(req: Request, res: ExpressResponse, next: NextFunction): Promise<void> {
  try {
    const { page, limit, sort, activo, q } = req.query as unknown as ListUsersQuery;

    const result = await userService.getAllUsers({ page, limit, sort, activo, q });

    res
      .status(200)
      .json(ApiResponse.success(200, result.data, 'Usuarios obtenidos correctamente.', result.meta));
  } catch (err) {
    next(err);
  }
}

export async function getUser(req: Request, res: ExpressResponse, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    const user = await userService.getUserById(id);
    res.status(200).json(ApiResponse.success(200, user, 'Usuario obtenido correctamente.'));
  } catch (err) {
    next(err);
  }
}

export async function createUser(req: Request, res: ExpressResponse, next: NextFunction): Promise<void> {
  try {
    const user = await userService.createUser(req.usuario!.usuarioId, req.body);
    res.status(201).json(ApiResponse.success(201, user, 'Usuario creado correctamente.'));
  } catch (err) {
    next(err);
  }
}

export async function updateUser(req: Request, res: ExpressResponse, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    const user = await userService.updateUser(req.usuario!.usuarioId, id, req.body);
    res.status(200).json(ApiResponse.success(200, user, 'Usuario actualizado correctamente.'));
  } catch (err) {
    next(err);
  }
}

export async function deleteUser(req: Request, res: ExpressResponse, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    await userService.deleteUser(id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
