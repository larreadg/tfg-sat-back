export interface UserDTO {
  id: number;
  correoElectronico: string;
  telefono: string;
  activo: boolean;
  personaId: number;
  fechaCreacion: Date;
  fechaActualizacion: Date;
}

export const USER_DTO_SELECT = {
  id: true,
  correoElectronico: true,
  telefono: true,
  activo: true,
  personaId: true,
  fechaCreacion: true,
  fechaActualizacion: true,
} as const;

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
