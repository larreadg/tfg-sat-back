import { prisma } from '../../config/prisma';
import { enviarSms } from '../../shared/services/sms.service';
import { NotFoundError, BadRequestError, TooManyRequestsError } from '../../shared/utils/errors';
import { generarCodigoNumerico, hashCodigo, verificarCodigo } from '../../shared/utils/otp';

/**
 * Codigo SMS de 6 digitos. El del ciudadano sigue en 4: ese codigo valida un
 * telefono para un reporte, este protege una cuenta con permisos.
 */
export const LONGITUD_CODIGO = 6;
const EXPIRACION_MINUTOS = 5;
/** Fallas permitidas antes de invalidar el codigo y obligar a pedir otro. */
const MAX_INTENTOS = 3;
/**
 * Codigos que un usuario puede pedir por ventana. Sin este tope, quien ya tiene
 * la contrasena puede pedir codigo tras codigo y probar 3 veces cada uno: el
 * limitador por IP no alcanza, porque se reparte entre muchas IPs.
 */
const MAX_CODIGOS_POR_VENTANA = 5;
const VENTANA_MINUTOS = 60;

export async function solicitarDobleFactor(usuarioId: number): Promise<void> {
  const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId } });

  if (!usuario) {
    throw new NotFoundError(`Usuario con id ${usuarioId} no encontrado`);
  }

  // Las filas de la ventana NO se borran al pedir otro codigo: son el contador.
  // Solo la mas reciente es valida (`verificarDobleFactor` lee esa).
  const inicioVentana = new Date(Date.now() - VENTANA_MINUTOS * 60 * 1000);
  await prisma.dobleFactor.deleteMany({ where: { usuarioId, fechaCreacion: { lt: inicioVentana } } });

  const recientes = await prisma.dobleFactor.findMany({
    where: { usuarioId },
    orderBy: { fechaCreacion: 'asc' },
    select: { fechaCreacion: true },
  });

  if (recientes.length >= MAX_CODIGOS_POR_VENTANA) {
    const liberaEn = recientes[0].fechaCreacion.getTime() + VENTANA_MINUTOS * 60 * 1000;
    const minutos = Math.max(1, Math.ceil((liberaEn - Date.now()) / 60000));
    throw new TooManyRequestsError(
      `Se pidieron demasiados codigos de verificacion. Intenta de nuevo en ${minutos} ${minutos === 1 ? 'minuto' : 'minutos'}.`,
    );
  }

  const codigo = generarCodigoNumerico(LONGITUD_CODIGO);
  const expiracion = new Date(Date.now() + EXPIRACION_MINUTOS * 60 * 1000);

  await prisma.dobleFactor.create({ data: { usuarioId, codigo: hashCodigo(codigo), expiracion } });

  await enviarSms(usuario.telefono, `Tu codigo de verificacion es ${codigo}. Vence en ${EXPIRACION_MINUTOS} minutos.`);
}

export async function verificarDobleFactor(usuarioId: number, codigo: string): Promise<void> {
  const registro = await prisma.dobleFactor.findFirst({
    where: { usuarioId },
    orderBy: { fechaCreacion: 'desc' },
  });

  // Un codigo con los intentos agotados se trata como inexistente. No se borra:
  // la fila sigue contando para el tope de `solicitarDobleFactor`.
  if (!registro || registro.intentos >= MAX_INTENTOS) {
    throw new BadRequestError('No existe un codigo de verificacion vigente. Solicita uno nuevo.');
  }

  if (registro.expiracion < new Date()) {
    throw new BadRequestError('El codigo de verificacion ha expirado. Solicita uno nuevo.');
  }

  if (!verificarCodigo(codigo, registro.codigo)) {
    const intentos = registro.intentos + 1;
    const restantes = MAX_INTENTOS - intentos;

    await prisma.dobleFactor.update({ where: { id: registro.id }, data: { intentos } });

    // Agotados los intentos, el codigo queda invalidado en el acto: no se deja
    // vivo para que el bloqueo aparezca recien en el intento siguiente.
    if (restantes <= 0) {
      throw new TooManyRequestsError(
        `Se supero el maximo de ${MAX_INTENTOS} intentos. Solicita un nuevo codigo.`,
      );
    }

    throw new BadRequestError(
      `El codigo de verificacion es incorrecto. Te ${restantes === 1 ? 'queda 1 intento' : `quedan ${restantes} intentos`}.`,
    );
  }

  // Login completo: se limpia todo, asi el tope no le cuenta los codigos de
  // esta sesion a quien si es el dueno de la cuenta.
  await prisma.dobleFactor.deleteMany({ where: { usuarioId } });
}
