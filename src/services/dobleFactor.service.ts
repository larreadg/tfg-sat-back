import { prisma } from '../config/prisma';
import { enviarSms } from './sms.service';
import { NotFoundError, BadRequestError, TooManyRequestsError } from '../utils/errors';
import { generarCodigoNumerico } from '../utils/otp';

const LONGITUD_CODIGO = 6;
const EXPIRACION_MINUTOS = 5;
const MAX_INTENTOS = 5;

export async function solicitarDobleFactor(usuarioId: number): Promise<void> {
  const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId } });

  if (!usuario) {
    throw new NotFoundError(`Usuario con id ${usuarioId} no encontrado`);
  }

  const codigo = generarCodigoNumerico(LONGITUD_CODIGO);
  const expiracion = new Date(Date.now() + EXPIRACION_MINUTOS * 60 * 1000);

  await prisma.$transaction([
    prisma.dobleFactor.deleteMany({ where: { usuarioId } }),
    prisma.dobleFactor.create({ data: { usuarioId, codigo, expiracion } }),
  ]);

  await enviarSms(usuario.telefono, `Tu codigo de verificacion es ${codigo}. Vence en ${EXPIRACION_MINUTOS} minutos.`);
}

export async function verificarDobleFactor(usuarioId: number, codigo: string): Promise<void> {
  const registro = await prisma.dobleFactor.findFirst({
    where: { usuarioId },
    orderBy: { fechaCreacion: 'desc' },
  });

  if (!registro) {
    throw new BadRequestError('No existe un codigo de verificacion vigente. Solicita uno nuevo.');
  }

  if (registro.expiracion < new Date()) {
    await prisma.dobleFactor.delete({ where: { id: registro.id } });
    throw new BadRequestError('El codigo de verificacion ha expirado. Solicita uno nuevo.');
  }

  if (registro.intentos >= MAX_INTENTOS) {
    await prisma.dobleFactor.delete({ where: { id: registro.id } });
    throw new TooManyRequestsError('Se supero el numero maximo de intentos. Solicita un nuevo codigo.');
  }

  if (registro.codigo !== codigo) {
    await prisma.dobleFactor.update({
      where: { id: registro.id },
      data: { intentos: registro.intentos + 1 },
    });
    throw new BadRequestError('El codigo de verificacion es incorrecto.');
  }

  await prisma.dobleFactor.delete({ where: { id: registro.id } });
}
