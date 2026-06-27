import { prisma } from '../config/prisma';
import { CreateUserInput, UpdateUserInput, UserDTO } from '../models/user.model';
import { NotFoundError, ConflictError } from '../utils/errors';

export async function getAllUsers(): Promise<UserDTO[]> {
  return prisma.usuario.findMany();
}

export async function getUserById(id: number): Promise<UserDTO> {
  const user = await prisma.usuario.findUnique({ where: { id } });

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

  return prisma.usuario.create({ data });
}

export async function updateUser(id: number, data: UpdateUserInput): Promise<UserDTO> {
  await getUserById(id);

  return prisma.usuario.update({ where: { id }, data });
}

export async function deleteUser(id: number): Promise<void> {
  await getUserById(id);

  await prisma.usuario.delete({ where: { id } });
}
