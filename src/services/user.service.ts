import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import {
  CreateUserInput,
  GetUsersParams,
  PaginatedResult,
  UpdateUserInput,
  UserDTO,
  USER_DTO_SELECT,
  USER_SORT_FIELDS,
  UserSortField,
} from '../models/user.model';
import { NotFoundError, ConflictError, BadRequestError } from '../utils/errors';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export async function getAllUsers(params: GetUsersParams): Promise<PaginatedResult<UserDTO>> {
  const page = params.page && params.page > 0 ? Math.floor(params.page) : 1;
  const limit = params.limit && params.limit > 0 ? Math.min(Math.floor(params.limit), MAX_LIMIT) : DEFAULT_LIMIT;
  const where: Prisma.UsuarioWhereInput | undefined =
    params.activo !== undefined ? { activo: params.activo } : undefined;
  const orderBy = parseSort(params.sort);

  const [data, total] = await prisma.$transaction([
    prisma.usuario.findMany({ where, orderBy, skip: (page - 1) * limit, take: limit, select: USER_DTO_SELECT }),
    prisma.usuario.count({ where }),
  ]);

  return {
    data,
    meta: { page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) },
  };
}

function parseSort(sort?: string): Prisma.UsuarioOrderByWithRelationInput {
  if (!sort) {
    return { fechaCreacion: 'desc' };
  }

  const direccion = sort.startsWith('-') ? 'desc' : 'asc';
  const campo = sort.replace(/^-/, '');

  if (!USER_SORT_FIELDS.includes(campo as UserSortField)) {
    throw new BadRequestError(
      `Campo de orden invalido: "${campo}". Valores permitidos: ${USER_SORT_FIELDS.join(', ')}.`,
    );
  }

  return { [campo]: direccion };
}

export async function getUserById(id: number): Promise<UserDTO> {
  const user = await prisma.usuario.findUnique({ where: { id }, select: USER_DTO_SELECT });

  if (!user) {
    throw new NotFoundError(`Usuario con id ${id} no encontrado`);
  }

  return user;
}

export async function createUser(data: CreateUserInput): Promise<UserDTO> {
  const existing = await prisma.usuario.findUnique({
    where: { correoElectronico: data.correoElectronico },
  });

  if (existing) {
    throw new ConflictError(`Ya existe un usuario con correo ${data.correoElectronico}`);
  }

  return prisma.usuario.create({ data, select: USER_DTO_SELECT });
}

export async function updateUser(id: number, data: UpdateUserInput): Promise<UserDTO> {
  await getUserById(id);

  return prisma.usuario.update({ where: { id }, data, select: USER_DTO_SELECT });
}

export async function deleteUser(id: number): Promise<void> {
  await getUserById(id);

  await prisma.usuario.delete({ where: { id } });
}
