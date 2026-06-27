export interface CreateCaptchaInput {
  ip: string;
  captcha: string;
}

export interface CaptchaDTO {
  id: number;
  ip: string;
  captcha: string;
  fechaCreacion: Date;
}
