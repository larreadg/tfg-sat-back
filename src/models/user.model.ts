export interface CreateUserInput {
  correoElectronico: string;
  telefono: string;
  hashContrasena: string;
  personaId: number;
  activo?: boolean;
}

export interface UpdateUserInput {
  correoElectronico?: string;
  telefono?: string;
  hashContrasena?: string;
  personaId?: number;
  activo?: boolean;
}

export interface UserDTO {
  id: number;
  correoElectronico: string;
  telefono: string;
  hashContrasena: string;
  activo: boolean;
  personaId: number;
  fechaCreacion: Date;
  fechaActualizacion: Date;
}
