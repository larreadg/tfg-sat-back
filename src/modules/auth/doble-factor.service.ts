import { prisma } from '../../config/prisma';
import { enviarSms } from '../../shared/services/sms.service';
import { NotFoundError, BadRequestError, TooManyRequestsError } from '../../shared/utils/errors';
import { generarCodigoNumerico, hashCodigo, verificarCodigo } from '../../shared/utils/otp';

/** Codigo SMS de 4 digitos (mismo formato que el flujo del ciudadano). */
export const LONGITUD_CODIGO = 4;
const EXPIRACION_MINUTOS = 5;
/** Fallas permitidas antes de invalidar el codigo y obligar a pedir otro. */
const MAX_INTENTOS = 3;

export async function solicitarDobleFactor(usuarioId: number): Promise<void> {
  const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId } });

  if (!usuario) {
    throw new NotFoundError(`Usuario con id ${usuarioId} no encontrado`);
  }

  const codigo = generarCodigoNumerico(LONGITUD_CODIGO);
  const expiracion = new Date(Date.now() + EXPIRACION_MINUTOS * 60 * 1000);

  await prisma.$transaction([
    prisma.dobleFactor.deleteMany({ where: { usuarioId } }),
    prisma.dobleFactor.create({ data: { usuarioId, codigo: hashCodigo(codigo), expiracion } }),
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

  if (!verificarCodigo(codigo, registro.codigo)) {
    const intentos = registro.intentos + 1;
    const restantes = MAX_INTENTOS - intentos;

    // Agotados los intentos, el codigo se invalida en el acto: no se deja vivo
    // para que el bloqueo aparezca recien en el intento siguiente.
    if (restantes <= 0) {
      await prisma.dobleFactor.delete({ where: { id: registro.id } });
      throw new TooManyRequestsError(
        `Se supero el maximo de ${MAX_INTENTOS} intentos. Solicita un nuevo codigo.`,
      );
    }

    await prisma.dobleFactor.update({ where: { id: registro.id }, data: { intentos } });
    throw new BadRequestError(
      `El codigo de verificacion es incorrecto. Te ${restantes === 1 ? 'queda 1 intento' : `quedan ${restantes} intentos`}.`,
    );
  }

  await prisma.dobleFactor.delete({ where: { id: registro.id } });
}
