import { randomBytes, randomInt, scryptSync, timingSafeEqual } from 'node:crypto';

const LONGITUD_SALT = 16;
const LONGITUD_HASH = 64;

/**
 * Genera un codigo numerico de `longitud` digitos con una fuente de
 * aleatoriedad criptografica (`crypto.randomInt`), no `Math.random` (que no es
 * apta para secretos).
 */
export function generarCodigoNumerico(longitud: number): string {
  let codigo = '';
  for (let i = 0; i < longitud; i++) {
    codigo += randomInt(0, 10).toString();
  }
  return codigo;
}

/**
 * Hashea un codigo OTP / 2FA con el esquema `scrypt:salt:hash`. Los codigos de
 * verificacion NUNCA se persisten en texto plano (ERS §4.5). El formato es
 * independiente del de contrasenas (`shared/utils/password.ts`): comparten
 * algoritmo pero se tunean por separado.
 */
export function hashCodigo(codigo: string): string {
  const salt = randomBytes(LONGITUD_SALT).toString('hex');
  const hash = scryptSync(codigo, salt, LONGITUD_HASH).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

/**
 * Compara en tiempo constante un codigo en claro contra su hash almacenado.
 * Devuelve false ante cualquier formato inesperado (p.ej. codigos viejos que
 * quedaron en texto plano antes de la migracion de seguridad).
 */
export function verificarCodigo(codigo: string, hashAlmacenado: string): boolean {
  const [esquema, salt, hash] = hashAlmacenado.split(':');

  if (esquema !== 'scrypt' || !salt || !hash) {
    return false;
  }

  const hashCalculado = scryptSync(codigo, salt, LONGITUD_HASH);
  const hashEsperado = Buffer.from(hash, 'hex');

  return hashCalculado.length === hashEsperado.length && timingSafeEqual(hashCalculado, hashEsperado);
}
