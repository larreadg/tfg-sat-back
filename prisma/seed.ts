const { PrismaClient } = require('@prisma/client');
const { randomBytes, scryptSync } = require('node:crypto');

const prisma = new PrismaClient();

const MODELOS_INICIALES = ['persona', 'usuario', 'rol', 'permiso', 'rol_permiso'];
const ACCIONES_BASE = ['ver', 'crear', 'editar', 'eliminar'];

const CONFIGURACION_POR_DEFECTO = {
  correoAdmin: 'admin@sat.local',
  telefonoAdmin: '0000000000',
  documentoAdmin: 'ADMIN-001',
  nombresAdmin: 'Administrador',
  apellidosAdmin: 'General',
  nombreRolAdmin: 'ADMINISTRADOR',
};

function mostrarAyuda() {
  console.log(`
Uso:
  npm run db:seed -- --contrasena-admin="TuClaveSegura"

Opciones:
  --contrasena-admin   Obligatoria. Contrasena del usuario administrador inicial.
  --correo-admin       Opcional. Default: ${CONFIGURACION_POR_DEFECTO.correoAdmin}
  --telefono-admin     Opcional. Default: ${CONFIGURACION_POR_DEFECTO.telefonoAdmin}
  --documento-admin    Opcional. Default: ${CONFIGURACION_POR_DEFECTO.documentoAdmin}
  --nombres-admin      Opcional. Default: ${CONFIGURACION_POR_DEFECTO.nombresAdmin}
  --apellidos-admin    Opcional. Default: ${CONFIGURACION_POR_DEFECTO.apellidosAdmin}
  --rol-admin          Opcional. Default: ${CONFIGURACION_POR_DEFECTO.nombreRolAdmin}

Ejemplo:
  npm run db:seed -- --contrasena-admin="Admin123*" --correo-admin="admin@tuapp.com"

Ejemplo completo:
  npm run db:seed -- --contrasena-admin="ClaveSegura123*" --correo-admin="admin@empresa.com" --telefono-admin="595971111111" --documento-admin="1234567" --nombres-admin="Juan" --apellidos-admin="Perez" --rol-admin="Admin"
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

  const contrasenaAdmin = obtenerArgumento('contrasena-admin');
  if (!contrasenaAdmin) {
    throw new Error('Debes indicar --contrasena-admin para crear o actualizar el usuario administrador.');
  }

  return {
    contrasenaAdmin,
    correoAdmin: obtenerArgumento('correo-admin') || CONFIGURACION_POR_DEFECTO.correoAdmin,
    telefonoAdmin: obtenerArgumento('telefono-admin') || CONFIGURACION_POR_DEFECTO.telefonoAdmin,
    documentoAdmin: obtenerArgumento('documento-admin') || CONFIGURACION_POR_DEFECTO.documentoAdmin,
    nombresAdmin: obtenerArgumento('nombres-admin') || CONFIGURACION_POR_DEFECTO.nombresAdmin,
    apellidosAdmin: obtenerArgumento('apellidos-admin') || CONFIGURACION_POR_DEFECTO.apellidosAdmin,
    nombreRolAdmin: obtenerArgumento('rol-admin') || CONFIGURACION_POR_DEFECTO.nombreRolAdmin,
  };
}

function generarHashContrasena(contrasena) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(contrasena, salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

function construirPermisosBase() {
  return MODELOS_INICIALES.flatMap((modelo) =>
    ACCIONES_BASE.map((accion) => ({
      nombre: `${modelo}.${accion}`,
      descripcion: `Permite ${accion} registros de ${modelo}.`,
    })),
  );
}

async function crearOActualizarAdmin(tx, configuracion) {
  const hashContrasena = generarHashContrasena(configuracion.contrasenaAdmin);

  const usuarioExistente = await tx.usuario.findUnique({
    where: { correoElectronico: configuracion.correoAdmin },
    include: { persona: true },
  });

  if (usuarioExistente) {
    const personaConDocumento = await tx.persona.findUnique({
      where: { documento: configuracion.documentoAdmin },
    });

    if (personaConDocumento && personaConDocumento.id !== usuarioExistente.personaId) {
      throw new Error(
        `Ya existe una persona con documento ${configuracion.documentoAdmin} asociada a otro usuario.`,
      );
    }

    const personaActualizada = await tx.persona.update({
      where: { id: usuarioExistente.personaId },
      data: {
        nombres: configuracion.nombresAdmin,
        apellidos: configuracion.apellidosAdmin,
        documento: configuracion.documentoAdmin,
      },
    });

    const usuarioActualizado = await tx.usuario.update({
      where: { id: usuarioExistente.id },
      data: {
        correoElectronico: configuracion.correoAdmin,
        telefono: configuracion.telefonoAdmin,
        hashContrasena,
        activo: true,
        usuarioActualizacionId: usuarioExistente.id,
        persona: {
          connect: { id: personaActualizada.id },
        },
      },
      include: { persona: true },
    });

    await tx.persona.update({
      where: { id: personaActualizada.id },
      data: {
        usuarioActualizacionId: usuarioActualizado.id,
      },
    });

    return usuarioActualizado;
  }

  let persona = await tx.persona.findUnique({
    where: { documento: configuracion.documentoAdmin },
  });

  if (persona) {
    const usuarioVinculado = await tx.usuario.findUnique({
      where: { personaId: persona.id },
    });

    if (usuarioVinculado) {
      throw new Error(
        `La persona con documento ${configuracion.documentoAdmin} ya esta vinculada a otro usuario.`,
      );
    }

    persona = await tx.persona.update({
      where: { id: persona.id },
      data: {
        nombres: configuracion.nombresAdmin,
        apellidos: configuracion.apellidosAdmin,
      },
    });
  } else {
    persona = await tx.persona.create({
      data: {
        nombres: configuracion.nombresAdmin,
        apellidos: configuracion.apellidosAdmin,
        documento: configuracion.documentoAdmin,
      },
    });
  }

  const usuarioCreado = await tx.usuario.create({
    data: {
      correoElectronico: configuracion.correoAdmin,
      telefono: configuracion.telefonoAdmin,
      hashContrasena,
      activo: true,
      personaId: persona.id,
    },
    include: { persona: true },
  });

  await tx.usuario.update({
    where: { id: usuarioCreado.id },
    data: {
      usuarioCreacionId: usuarioCreado.id,
      usuarioActualizacionId: usuarioCreado.id,
    },
  });

  await tx.persona.update({
    where: { id: persona.id },
    data: {
      usuarioCreacionId: usuarioCreado.id,
      usuarioActualizacionId: usuarioCreado.id,
    },
  });

  return usuarioCreado;
}

async function sembrarPermisos(tx, adminId) {
  const permisosBase = construirPermisosBase();
  const permisos = [];

  for (const permisoBase of permisosBase) {
    const permiso = await tx.permiso.upsert({
      where: { nombre: permisoBase.nombre },
      update: {
        descripcion: permisoBase.descripcion,
        usuarioActualizacionId: adminId,
      },
      create: {
        nombre: permisoBase.nombre,
        descripcion: permisoBase.descripcion,
        usuarioCreacionId: adminId,
        usuarioActualizacionId: adminId,
      },
    });

    permisos.push(permiso);
  }

  return permisos;
}

async function sembrarRolAdministrador(tx, adminId, nombreRolAdmin) {
  return tx.rol.upsert({
    where: {
      usuarioId_nombre: {
        usuarioId: adminId,
        nombre: nombreRolAdmin,
      },
    },
    update: {
      descripcion: 'Rol administrador con acceso completo a los modelos iniciales.',
      usuarioActualizacionId: adminId,
    },
    create: {
      nombre: nombreRolAdmin,
      descripcion: 'Rol administrador con acceso completo a los modelos iniciales.',
      usuarioId: adminId,
      usuarioCreacionId: adminId,
      usuarioActualizacionId: adminId,
    },
  });
}

async function sembrarRolPermiso(tx, rolId, permisoId, adminId) {
  return tx.rolPermiso.upsert({
    where: {
      rolId_permisoId: {
        rolId,
        permisoId,
      },
    },
    update: {
      usuarioActualizacionId: adminId,
    },
    create: {
      rolId,
      permisoId,
      usuarioCreacionId: adminId,
      usuarioActualizacionId: adminId,
    },
  });
}

async function main() {
  const configuracion = obtenerConfiguracion();

  const resultado = await prisma.$transaction(async (tx) => {
    const admin = await crearOActualizarAdmin(tx, configuracion);
    const permisos = await sembrarPermisos(tx, admin.id);
    const rolAdministrador = await sembrarRolAdministrador(tx, admin.id, configuracion.nombreRolAdmin);

    for (const permiso of permisos) {
      await sembrarRolPermiso(tx, rolAdministrador.id, permiso.id, admin.id);
    }

    return {
      admin,
      rolAdministrador,
      permisosCreados: permisos.length,
    };
  });

  console.log('Seed ejecutado correctamente.');
  console.log(`Administrador: ${resultado.admin.correoElectronico}`);
  console.log(`Rol asignado: ${resultado.rolAdministrador.nombre}`);
  console.log(`Permisos asegurados: ${resultado.permisosCreados}`);
}

main()
  .catch((error) => {
    console.error('Error ejecutando el seed.');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
