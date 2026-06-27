import { scryptSync, timingSafeEqual } from 'node:crypto';

export function verifyPassword(contrasena: string, hashContrasena: string): boolean {
  const [esquema, salt, hash] = hashContrasena.split(':');

  if (esquema !== 'scrypt' || !salt || !hash) {
    return false;
  }

  const hashCalculado = scryptSync(contrasena, salt, 64);
  const hashAlmacenado = Buffer.from(hash, 'hex');

  return hashCalculado.length === hashAlmacenado.length && timingSafeEqual(hashCalculado, hashAlmacenado);
}
