import { Request, Response as ExpressResponse, NextFunction } from 'express';
import * as userService from '../services/user.service';
import { Response as ApiResponse } from '../utils/response';

export async function getUsers(req: Request, res: ExpressResponse, next: NextFunction): Promise<void> {
  try {
    const { page, limit, sort, activo } = req.query;

    const result = await userService.getAllUsers({
      page: page !== undefined ? Number(page) : undefined,
      limit: limit !== undefined ? Number(limit) : undefined,
      sort: typeof sort === 'string' ? sort : undefined,
      activo: activo !== undefined ? activo === 'true' : undefined,
    });

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
    const user = await userService.createUser(req.body);
    res.status(201).json(ApiResponse.success(201, user, 'Usuario creado correctamente.'));
  } catch (err) {
    next(err);
  }
}

export async function updateUser(req: Request, res: ExpressResponse, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    const user = await userService.updateUser(id, req.body);
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
