import axios from 'axios';
import { env } from '../config/env';

export async function enviarSms(numero: string, mensaje: string): Promise<void> {
  await axios.get(env.smsApiUrl, {
    params: { message: mensaje, number: numero },
  });
}
