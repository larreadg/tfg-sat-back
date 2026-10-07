import { Prisma } from '@prisma/client';

/**
 * Campos que se leen de `Usuario`. Incluye `persona` y `roles` porque el panel
 * (tab Usuarios) lista nombre y roles: traerlos aca evita una consulta por fila.
 * `hashContrasena` nunca entra en el select.
 */
export const USER_DTO_SELECT = {
  id: true,
  correoElectronico: true,
  telefono: true,
  activo: true,
  personaId: true,
  persona: { select: { nombres: true, apellidos: true, documento: true } },
  roles: { select: { rol: { select: { id: true, nombre: true } } } },
  fechaCreacion: true,
  fechaActualizacion: true,
} as const;

/** Forma cruda que devuelve Prisma: `roles` viene anidado en la tabla puente. */
export type UsuarioSeleccionado = Prisma.UsuarioGetPayload<{ select: typeof USER_DTO_SELECT }>;

export interface PersonaDTO {
  nombres: string;
  apellidos: string;
  documento: string;
}

export interface RolResumenDTO {
  id: number;
  nombre: string;
}

/** DTO publico del usuario, con `roles` ya aplanado. */
export interface UserDTO {
  id: number;
  correoElectronico: string;
  telefono: string;
  activo: boolean;
  personaId: number;
  persona: PersonaDTO;
  roles: RolResumenDTO[];
  fechaCreacion: Date;
  fechaActualizacion: Date;
}

export const USER_SORT_FIELDS = [
  'correoElectronico',
  'telefono',
  'activo',
  'fechaCreacion',
  'fechaActualizacion',
] as const;

export type UserSortField = (typeof USER_SORT_FIELDS)[number];

export interface GetUsersParams {
  page?: number;
  limit?: number;
  sort?: string;
  activo?: boolean;
  /** Texto libre: busca en correo, nombres, apellidos y documento. */
  q?: string;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
