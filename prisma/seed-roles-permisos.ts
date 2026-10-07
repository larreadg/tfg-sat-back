const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/**
 * Siembra idempotente de ROLES y PERMISOS (sin tocar el usuario admin ni su
 * contrasena). Aplica la decision de alinear los roles al ERS §8:
 *   - Renombra el rol `ADMINISTRADOR` -> `ADMIN` (si existe y no hay ya ADMIN).
 *   - Garantiza el rol `ADMIN` con TODOS los permisos.
 *   - Garantiza el rol `ORGANISMO` con solo los permisos de LECTURA del panel.
 * Tambien asegura los permisos de los recursos nuevos (reporte, alerta, etc.).
 *
 * Correr con: npm run seed:roles
 */
// Catalogo de permisos compartido con `seed.ts`: una sola fuente para que los
// dos seeds no vuelvan a desincronizarse (ver permisos-catalogo.js).
const { permisosCatalogo, ORGANISMO_PERMISOS } = require('./permisos-catalogo.js');

async function asegurarPermisos(tx, actorId) {
  const permisos = [];
  for (const { nombre, descripcion } of permisosCatalogo()) {
    const permiso = await tx.permiso.upsert({
      where: { nombre },
      update: { descripcion, usuarioActualizacionId: actorId },
      create: {
        nombre,
        descripcion,
        usuarioCreacionId: actorId,
        usuarioActualizacionId: actorId,
      },
    });
    permisos.push(permiso);
  }
  return permisos;
}

async function renombrarAdministrador(tx) {
  const viejo = await tx.rol.findUnique({ where: { nombre: 'ADMINISTRADOR' } });
  const nuevo = await tx.rol.findUnique({ where: { nombre: 'ADMIN' } });
  if (viejo && !nuevo) {
    await tx.rol.update({ where: { id: viejo.id }, data: { nombre: 'ADMIN' } });
    console.log('Rol "ADMINISTRADOR" renombrado a "ADMIN".');
  }
}

async function asegurarRol(tx, nombre, descripcion, actorId) {
  return tx.rol.upsert({
    where: { nombre },
    update: { descripcion, usuarioActualizacionId: actorId },
    create: { nombre, descripcion, usuarioCreacionId: actorId, usuarioActualizacionId: actorId },
  });
}

async function asignarPermisos(tx, rolId, permisos, actorId) {
  for (const permiso of permisos) {
    await tx.rolPermiso.upsert({
      where: { rolId_permisoId: { rolId, permisoId: permiso.id } },
      update: { usuarioActualizacionId: actorId },
      create: { rolId, permisoId: permiso.id, usuarioCreacionId: actorId, usuarioActualizacionId: actorId },
    });
  }
}

async function main() {
  const resultado = await prisma.$transaction(async (tx) => {
    const actor = await tx.usuario.findFirst({ orderBy: { id: 'asc' } });
    const actorId = actor ? actor.id : null;

    const permisos = await asegurarPermisos(tx, actorId);

    await renombrarAdministrador(tx);

    const rolAdmin = await asegurarRol(
      tx,
      'ADMIN',
      'Rol administrador con acceso completo a todos los recursos del dominio.',
      actorId,
    );
    await asignarPermisos(tx, rolAdmin.id, permisos, actorId);

    const rolOrganismo = await asegurarRol(
      tx,
      'ORGANISMO',
      'Organismo: acceso de solo lectura al panel (reportes, evaluaciones, alertas, puntos criticos, encuestas).',
      actorId,
    );
    // Por NOMBRE COMPLETO, no por sufijo `.ver`: ORGANISMO tambien tiene
    // `alerta.seguimiento`, que no es un permiso de lectura.
    const permisosVer = permisos.filter((p) => ORGANISMO_PERMISOS.includes(p.nombre));
    await asignarPermisos(tx, rolOrganismo.id, permisosVer, actorId);

    return {
      permisos: permisos.length,
      admin: rolAdmin.nombre,
      organismoPermisos: permisosVer.length,
    };
  });

  console.log('Seed de roles/permisos ejecutado correctamente.');
  console.log(`Permisos asegurados: ${resultado.permisos}`);
  console.log(`Rol ADMIN: todos los permisos.`);
  console.log(`Rol ORGANISMO: ${resultado.organismoPermisos} permisos de lectura.`);
}

main()
  .catch((error) => {
    console.error('Error sembrando roles/permisos.');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
