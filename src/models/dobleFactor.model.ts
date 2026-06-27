export interface DobleFactorDTO {
  id: number;
  usuarioId: number;
  codigo: string;
  intentos: number;
  expiracion: Date;
  fechaCreacion: Date;
}
