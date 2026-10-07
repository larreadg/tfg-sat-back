import nodemailer, { Transporter } from 'nodemailer';
import { prisma } from '../../config/prisma';
import { descifrar } from '../utils/crypto';
import { BadRequestError } from '../utils/errors';

/**
 * Canal de salida por correo. La configuracion NO vive en `.env`: vive en la fila
 * unica de `ConfiguracionNotificacion`, editable desde el panel, asi que hay que
 * leerla en cada envio (puede haber cambiado hace un segundo) y no se puede
 * cachear el transport.
 *
 * Dos pantallas distintas la alimentan: el TRANSPORTE (`smtp*`) se configura en
 * Configuracion > Sistema y el REMITENTE (`remitente*`) en Webhooks. A quien se le
 * manda no esta aca: lo decide cada `ReglaWebhook`.
 */

/** Espeja `smtpSeguridad` de `ConfiguracionNotificacion`. */
export type SeguridadSmtp = 'NINGUNA' | 'STARTTLS' | 'SSL_TLS';

export const SEGURIDADES_SMTP: readonly SeguridadSmtp[] = ['NINGUNA', 'STARTTLS', 'SSL_TLS'] as const;

export interface CorreoSaliente {
  para: string | string[];
  asunto: string;
  texto: string;
  html?: string;
}

/**
 * Traduce nuestras tres opciones a los flags de nodemailer, que son dos booleanos
 * poco obvios:
 *  - SSL_TLS   -> conexion cifrada desde el principio (`secure: true`, puerto 465).
 *  - STARTTLS  -> arranca en claro y sube a TLS con el comando STARTTLS, que es lo
 *                 que hacen Gmail/Office365 en el 587. `requireTLS` lo vuelve
 *                 obligatorio: si el servidor no lo ofrece, falla en vez de
 *                 mandar las credenciales en claro sin avisar.
 *  - NINGUNA   -> sin cifrado. Solo tiene sentido para un relay interno o un
 *                 servidor de pruebas (Mailpit/MailHog) en la misma maquina.
 */
function opcionesTls(seguridad: string): { secure: boolean; requireTLS: boolean; ignoreTLS: boolean } {
  switch (seguridad as SeguridadSmtp) {
    case 'SSL_TLS':
      return { secure: true, requireTLS: false, ignoreTLS: false };
    case 'NINGUNA':
      return { secure: false, requireTLS: false, ignoreTLS: true };
    case 'STARTTLS':
    default:
      return { secure: false, requireTLS: true, ignoreTLS: false };
  }
}

interface ConfigSmtpResuelta {
  host: string;
  puerto: number;
  seguridad: string;
  usuario: string;
  /** Ya descifrada. `null` = servidor SMTP sin autenticacion. */
  contrasena: string | null;
  /** Cabecera `From` ya armada. */
  remitente: string;
}

/** Parte `"a@x.com, b@y.com"` en una lista limpia, sin vacios ni duplicados. */
export function parsearDestinatarios(crudo: string): string[] {
  const partes = crudo
    .split(',')
    .map((parte) => parte.trim())
    .filter(Boolean);
  return [...new Set(partes)];
}

/**
 * Lee la config vigente y la deja lista para usar. Tira `BadRequestError` si el
 * correo no esta habilitado o si falta algo imprescindible: es un error del
 * ESTADO de la configuracion, no del servidor SMTP, por eso 400 y no 502.
 */
async function resolverConfig(): Promise<ConfigSmtpResuelta> {
  const config = await prisma.configuracionNotificacion.findUnique({ where: { id: 1 } });

  if (!config || !config.smtpHabilitado) {
    throw new BadRequestError('El envio de correos esta deshabilitado. Activalo en Configuracion > Sistema.');
  }
  if (!config.smtpHost) {
    throw new BadRequestError('Falta indicar la direccion del servidor de correo en Configuracion > Sistema.');
  }

  // El From sale del remitente configurado en Webhooks; si esta vacio cae al
  // usuario SMTP, que es lo que varios servidores (Gmail, Office 365) exigen de
  // todas formas. Si no hay ninguno de los dos no se puede armar un `From` valido.
  const correoFrom = config.remitenteCorreo || config.smtpUsuario;
  if (!correoFrom) {
    throw new BadRequestError(
      'Falta definir el remitente de los correos. Cargalo en Notificaciones, o completá el usuario del servidor de correo en Configuración > Sistema.',
    );
  }

  const remitente = config.remitenteNombre
    ? `"${config.remitenteNombre.replace(/"/g, '')}" <${correoFrom}>`
    : correoFrom;

  return {
    host: config.smtpHost,
    puerto: config.smtpPuerto,
    seguridad: config.smtpSeguridad,
    usuario: config.smtpUsuario,
    contrasena: config.smtpSecreto ? descifrar(config.smtpSecreto) : null,
    remitente,
  };
}

function crearTransport(config: ConfigSmtpResuelta): Transporter {
  const { secure, requireTLS, ignoreTLS } = opcionesTls(config.seguridad);

  return nodemailer.createTransport({
    host: config.host,
    port: config.puerto,
    secure,
    requireTLS,
    ignoreTLS,
    // Un SMTP que no responde no puede colgar la request del panel.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
    ...(config.usuario ? { auth: { user: config.usuario, pass: config.contrasena ?? '' } } : {}),
  });
}

/**
 * Envia un correo con la configuracion vigente. Propaga el error del servidor
 * SMTP tal cual: el llamador decide si lo traduce a 502 o lo registra y sigue.
 */
export async function enviarCorreo(correo: CorreoSaliente): Promise<void> {
  const config = await resolverConfig();
  const transport = crearTransport(config);

  try {
    await transport.sendMail({
      from: config.remitente,
      to: correo.para,
      subject: correo.asunto,
      text: correo.texto,
      ...(correo.html ? { html: correo.html } : {}),
    });
  } finally {
    // El transport abre un pool de conexiones; sin esto el proceso queda con
    // sockets vivos hasta el timeout del servidor.
    transport.close();
  }
}

/**
 * Handshake contra el servidor SMTP sin mandar ningun mensaje: resuelve DNS,
 * negocia TLS y autentica. Sirve para distinguir "la config esta mal" de "la
 * config esta bien pero el destinatario rebota".
 */
export async function verificarConexion(): Promise<void> {
  const config = await resolverConfig();
  const transport = crearTransport(config);

  try {
    await transport.verify();
  } finally {
    transport.close();
  }
}
