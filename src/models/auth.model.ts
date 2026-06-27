export interface LoginInput {
  correoElectronico: string;
  contrasena: string;
  captcha: string;
}

export interface VerificarDobleFactorInput {
  preAuthToken: string;
  codigo: string;
}

export interface PreAuthPayload {
  usuarioId: number;
  etapa: 'pre-auth';
}
