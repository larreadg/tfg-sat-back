const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const ENCUESTA = {
  nombre: 'Aguard Encuesta',
  descripcion: 'Cuestionario de alerta temprana - Calidad de agua',
};

const PREGUNTAS = [
  {
    texto: '¿Qué tipo de fuente o lugar estás reportando?',
    tipo: 'ELECCION_UNICA',
    opciones: ['Canilla / grifo', 'Pozo', 'Tanque o reservorio', 'Otro', 'No sé'],
  },
  {
    texto: '¿Qué color o aspecto tiene el agua?',
    tipo: 'ELECCION_UNICA',
    opciones: [
      'Normal / sin cambios',
      'Amarilla o marrón (hierro o sedimento)',
      'Verde (algas)',
      'Oscura, negra o gris (manganeso o sulfuros)',
      'Blanquecina o lechosa (turbidez o aire)',
      'Otro',
    ],
  },
  {
    texto: '¿El agua tiene algún olor distinto al habitual?',
    tipo: 'ELECCION_UNICA',
    opciones: [
      'No, sin olor raro',
      'A cloro fuerte',
      'A huevo podrido / azufre',
      'A cloaca o desagüe',
      'A combustible o químico',
      'A tierra o moho',
      'Otro',
    ],
  },
  {
    texto: '¿Notaste que el sabor del agua sea distinto al habitual?',
    tipo: 'ELECCION_UNICA',
    opciones: ['Sí, sabor raro', 'Sí, sabor salado', 'No, igual que siempre', 'No lo probé'],
  },
  {
    texto: '¿Alguien tuvo malestar después del contacto o consumo?',
    tipo: 'ELECCION_UNICA',
    opciones: ['Sí', 'No', 'No sé'],
  },
  {
    texto: '¿Desde cuándo observa el problema?',
    tipo: 'ELECCION_UNICA',
    opciones: [
      'Recién lo noté hoy',
      'Hace unos días',
      'Hace una semana o más',
      'Ya me había pasado antes / es recurrente',
      'No sé',
    ],
  },
  {
    texto: 'Fotos (hasta 3)',
    tipo: 'FOTO',
    opciones: [],
  },
];

function mostrarAyuda() {
  console.log(`
Uso:
  node --env-file=.env --experimental-strip-types prisma/seed-encuesta-agua.ts

Opciones:
  --correo-admin   Opcional. Correo del usuario que se registrara como creador/actualizador de los registros.

Ejemplo:
  node --env-file=.env --experimental-strip-types prisma/seed-encuesta-agua.ts --correo-admin="admin@sat.local"
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

async function obtenerUsuarioId(tx) {
  if (process.argv.includes('--ayuda') || process.argv.includes('--help')) {
    mostrarAyuda();
    process.exit(0);
  }

  const correoAdmin = obtenerArgumento('correo-admin');
  if (!correoAdmin) {
    return null;
  }

  const usuario = await tx.usuario.findUnique({ where: { correoElectronico: correoAdmin } });
  if (!usuario) {
    throw new Error(`No existe un usuario con el correo ${correoAdmin}.`);
  }

  return usuario.id;
}

async function sembrarEncuesta(tx, usuarioId) {
  let encuesta = await tx.encuesta.findFirst({ where: { nombre: ENCUESTA.nombre } });

  if (encuesta) {
    encuesta = await tx.encuesta.update({
      where: { id: encuesta.id },
      data: {
        descripcion: ENCUESTA.descripcion,
        usuarioActualizacionId: usuarioId,
      },
    });
  } else {
    encuesta = await tx.encuesta.create({
      data: {
        nombre: ENCUESTA.nombre,
        descripcion: ENCUESTA.descripcion,
        usuarioCreacionId: usuarioId,
        usuarioActualizacionId: usuarioId,
      },
    });
  }

  return encuesta;
}

async function sembrarPregunta(tx, definicionPregunta, usuarioId) {
  let pregunta = await tx.pregunta.findFirst({ where: { texto: definicionPregunta.texto } });

  if (pregunta) {
    pregunta = await tx.pregunta.update({
      where: { id: pregunta.id },
      data: {
        tipo: definicionPregunta.tipo,
        usuarioActualizacionId: usuarioId,
      },
    });
  } else {
    pregunta = await tx.pregunta.create({
      data: {
        texto: definicionPregunta.texto,
        tipo: definicionPregunta.tipo,
        usuarioCreacionId: usuarioId,
        usuarioActualizacionId: usuarioId,
      },
    });
  }

  return pregunta;
}

async function sembrarOpciones(tx, preguntaId, textosOpciones, usuarioId) {
  for (const [indice, textoOpcion] of textosOpciones.entries()) {
    const opcionExistente = await tx.preguntaOpcion.findFirst({
      where: { preguntaId, texto: textoOpcion },
    });

    if (opcionExistente) {
      await tx.preguntaOpcion.update({
        where: { id: opcionExistente.id },
        data: {
          orden: indice,
          usuarioActualizacionId: usuarioId,
        },
      });
    } else {
      await tx.preguntaOpcion.create({
        data: {
          preguntaId,
          texto: textoOpcion,
          orden: indice,
          usuarioCreacionId: usuarioId,
          usuarioActualizacionId: usuarioId,
        },
      });
    }
  }
}

async function sembrarEncuestaPregunta(tx, encuestaId, preguntaId, orden) {
  await tx.encuestaPregunta.upsert({
    where: {
      encuestaId_preguntaId: {
        encuestaId,
        preguntaId,
      },
    },
    update: { orden },
    create: { encuestaId, preguntaId, orden },
  });
}

async function eliminarPreguntasObsoletas(tx, encuestaId, preguntaIdsVigentes) {
  const relacionesObsoletas = await tx.encuestaPregunta.findMany({
    where: { encuestaId, preguntaId: { notIn: preguntaIdsVigentes } },
  });

  await tx.encuestaPregunta.deleteMany({
    where: { encuestaId, preguntaId: { notIn: preguntaIdsVigentes } },
  });

  for (const relacion of relacionesObsoletas) {
    const usadaEnOtraEncuesta = await tx.encuestaPregunta.findFirst({
      where: { preguntaId: relacion.preguntaId },
    });
    if (usadaEnOtraEncuesta) {
      continue;
    }

    const tieneRespuestas = await tx.respuesta.findFirst({ where: { preguntaId: relacion.preguntaId } });
    if (tieneRespuestas) {
      console.warn(`Pregunta id ${relacion.preguntaId} tiene respuestas registradas, no se elimina.`);
      continue;
    }

    await tx.preguntaOpcion.deleteMany({ where: { preguntaId: relacion.preguntaId } });
    await tx.pregunta.delete({ where: { id: relacion.preguntaId } });
  }
}

async function main() {
  const resultado = await prisma.$transaction(async (tx) => {
    const usuarioId = await obtenerUsuarioId(tx);
    const encuesta = await sembrarEncuesta(tx, usuarioId);

    const preguntaIdsVigentes = [];
    for (const [indice, definicionPregunta] of PREGUNTAS.entries()) {
      const pregunta = await sembrarPregunta(tx, definicionPregunta, usuarioId);
      await sembrarOpciones(tx, pregunta.id, definicionPregunta.opciones, usuarioId);
      await sembrarEncuestaPregunta(tx, encuesta.id, pregunta.id, indice);
      preguntaIdsVigentes.push(pregunta.id);
    }

    await eliminarPreguntasObsoletas(tx, encuesta.id, preguntaIdsVigentes);

    return { encuesta, totalPreguntas: PREGUNTAS.length };
  });

  console.log('Seed de encuesta ejecutado correctamente.');
  console.log(`Encuesta: ${resultado.encuesta.nombre} (id: ${resultado.encuesta.id})`);
  console.log(`Preguntas aseguradas: ${resultado.totalPreguntas}`);
}

main()
  .catch((error) => {
    console.error('Error ejecutando el seed de encuesta.');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
