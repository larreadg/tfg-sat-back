import axios from 'axios';
import { env } from '../../config/env';
import { mensajeCodigoVerificacion } from '../utils/sms-codigo';

export async function enviarSms(numero: string, mensaje: string): Promise<void> {
  await axios.get(env.smsApiUrl, {
    params: { message: mensaje, number: numero },
  });
}

/**
 * SMS con un codigo de verificacion (2FA del panel y OTP del ciudadano). El
 * texto depende del numero: ver `mensajeCodigoVerificacion`.
 */
export async function enviarCodigoVerificacion(numero: string, codigo: string, minutosVigencia: number): Promise<void> {
  await enviarSms(numero, mensajeCodigoVerificacion(numero, codigo, minutosVigencia));
}
