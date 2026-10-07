const { PrismaClient } = require('@prisma/client');
const { randomBytes, scryptSync } = require('node:crypto');

const prisma = new PrismaClient();

function mostrarAyuda() {
  console.log(`
Uso:
  node --env-file=.env --experimental-strip-types prisma/reset-password.ts --correo="admin@sat.local" --contrasena="NuevaClave123*"

Opciones:
  --correo        Obligatorio. Correo electronico del usuario a resetear.
  --contrasena    Obligatorio. Nueva contrasena en texto plano.
`);
}

function obtenerArgumento(nombre) {
  const prefijo = `--${nombre}=`;
  const argumentoConValor = process.argv.find((argumento) => argumento.startsWith(prefijo));

  if (argumentoConValor) {
    return argumentoConValor.slice(prefijo.length).trim();
  }

  const indice = process.argv.findIndex((argumento) => argumento === `--${nombre}`);
  if (indice >= 0) {
    return process.argv[indice + 1]?.trim();
  }

  return undefined;
}

function obtenerConfiguracion() {
  if (process.argv.includes('--ayuda') || process.argv.includes('--help')) {
    mostrarAyuda();
    process.exit(0);
  }

  const correo = obtenerArgumento('correo');
  const contrasena = obtenerArgumento('contrasena');

  if (!correo || !contrasena) {
    mostrarAyuda();
    throw new Error('Debes indicar --correo y --contrasena.');
  }

  return { correo, contrasena };
}

function generarHashContrasena(contrasena) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(contrasena, salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

async function main() {
  const { correo, contrasena } = obtenerConfiguracion();

  const usuario = await prisma.usuario.findUnique({ where: { correoElectronico: correo } });

  if (!usuario) {
    throw new Error(`No existe un usuario con el correo ${correo}.`);
  }

  const hashContrasena = generarHashContrasena(contrasena);

  await prisma.usuario.update({
    where: { id: usuario.id },
    data: { hashContrasena, usuarioActualizacionId: usuario.id },
  });

  console.log(`Contrasena actualizada correctamente para ${correo}.`);
}

main()
  .catch((error) => {
    console.error('Error reseteando la contrasena.');
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
