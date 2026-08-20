import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const LONGITUD_SALT = 16;
const LONGITUD_HASH = 64;

/**
 * Genera un hash de contrasena con el esquema `scrypt:salt:hash`.
 * Debe mantenerse compatible con `verifyPassword` y con los scripts de
 * `prisma/seed.ts` / `prisma/reset-password.ts`, que usan el mismo formato.
 */
export function hashPassword(contrasena: string): string {
  const salt = randomBytes(LONGITUD_SALT).toString('hex');
  const hash = scryptSync(contrasena, salt, LONGITUD_HASH).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(contrasena: string, hashContrasena: string): boolean {
  const [esquema, salt, hash] = hashContrasena.split(':');

  if (esquema !== 'scrypt' || !salt || !hash) {
    return false;
  }

  const hashCalculado = scryptSync(contrasena, salt, LONGITUD_HASH);
  const hashAlmacenado = Buffer.from(hash, 'hex');

  return hashCalculado.length === hashAlmacenado.length && timingSafeEqual(hashCalculado, hashAlmacenado);
}
