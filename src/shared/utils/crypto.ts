import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { env } from '../../config/env';

/**
 * Cifrado simetrico reversible para los secretos que el ADMIN configura desde el
 * panel y el backend necesita poder volver a leer en claro (hoy: la contrasena
 * del servidor SMTP de `ConfiguracionNotificacion`).
 *
 * Es el caso OPUESTO al de `password.ts`: una contrasena de usuario se hashea y
 * nunca se recupera, pero la credencial SMTP hay que entregarsela al servidor de
 * correo en cada envio. Por eso aca va AES-256-GCM y no scrypt.
 *
 * Formato almacenado: `aesgcm:<ivHex>:<tagHex>:<cipherHex>` — mismo criterio de
 * "esquema primero" que `scrypt:salt:hash`, para poder rotar el algoritmo mas
 * adelante sin adivinar que tiene guardada cada fila.
 *
 * ⚠️ La clave sale de `CONFIG_ENCRYPTION_KEY`. Si se pierde o se cambia, los
 * secretos ya guardados dejan de poder descifrarse (hay que volver a cargarlos
 * desde el panel). No es una variable obligatoria para arrancar: la app levanta
 * sin ella y recien falla, con mensaje claro, cuando alguien intenta guardar o
 * usar un secreto.
 */

const ESQUEMA = 'aesgcm';
const LONGITUD_IV = 12; // 96 bits, el recomendado para GCM
const LONGITUD_CLAVE = 32; // AES-256
/**
 * Salt fijo a proposito: la clave derivada tiene que ser la MISMA entre
 * reinicios para poder descifrar lo ya guardado, y el material secreto real es
 * `CONFIG_ENCRYPTION_KEY`. El salt aca solo separa el dominio de uso.
 */
const SALT_DERIVACION = 'aguard-config-v1';

export class ClaveCifradoAusenteError extends Error {
  constructor() {
    super(
      'Falta la variable de entorno CONFIG_ENCRYPTION_KEY: sin ella no se pueden guardar ni usar secretos de configuracion (p.ej. la contrasena SMTP).',
    );
  }
}

function derivarClave(): Buffer {
  if (!env.configEncryptionKey) {
    throw new ClaveCifradoAusenteError();
  }
  return scryptSync(env.configEncryptionKey, SALT_DERIVACION, LONGITUD_CLAVE);
}

/** `true` si el backend esta en condiciones de cifrar/descifrar secretos. */
export function cifradoDisponible(): boolean {
  return Boolean(env.configEncryptionKey);
}

export function cifrar(textoPlano: string): string {
  const clave = derivarClave();
  const iv = randomBytes(LONGITUD_IV);
  const cipher = createCipheriv('aes-256-gcm', clave, iv);

  const cifrado = Buffer.concat([cipher.update(textoPlano, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${ESQUEMA}:${iv.toString('hex')}:${tag.toString('hex')}:${cifrado.toString('hex')}`;
}

/**
 * Devuelve el texto en claro. Tira si el payload no tiene el formato esperado o
 * si el tag de autenticacion no valida (dato manipulado o clave distinta a la
 * que cifro). El llamador decide como traducirlo a la respuesta HTTP.
 */
export function descifrar(payload: string): string {
  const clave = derivarClave();
  const [esquema, ivHex, tagHex, cifradoHex] = payload.split(':');

  if (esquema !== ESQUEMA || !ivHex || !tagHex || !cifradoHex) {
    throw new Error('El secreto guardado no tiene el formato `aesgcm:iv:tag:ciphertext`.');
  }

  const decipher = createDecipheriv('aes-256-gcm', clave, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));

  return Buffer.concat([decipher.update(Buffer.from(cifradoHex, 'hex')), decipher.final()]).toString('utf8');
}
