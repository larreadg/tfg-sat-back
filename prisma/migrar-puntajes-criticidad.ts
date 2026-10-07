const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/**
 * Traduce el JSON `ConfiguracionCriticidad.puntajes` del formato VIEJO (tablas
 * cerradas claveadas por TEXTO de opcion: `f2.p04`, `f3.p03/p06/p07`) al formato
 * por REGLAS claveadas por `codigo` de pregunta y opcion.
 *
 * Idempotente: una config que ya tiene `reglas` se saltea, asi que se puede correr
 * las veces que sea. No cambia ningun numero — solo la forma en que se direccionan
 * las preguntas y las opciones. Los valores salen de la config existente, no de los
 * defaults del seed: si alguien habia ajustado un puntaje, se conserva.
 *
 * Uso:
 *   node --env-file=.env --experimental-strip-types prisma/migrar-puntajes-criticidad.ts
 */

/**
 * De que pregunta era cada tabla del formato viejo. Es la unica parte que no se
 * puede deducir del JSON: las tablas viejas no decian a que pregunta pertenecian,
 * estaba implicito en el nombre de la clave.
 */
const PREGUNTA_DE_TABLA = {
  p04: 'AGUA_COLOR',
  p05: 'AGUA_PARTICULAS',
  p03: 'AGUA_ANTIGUEDAD',
  p06: 'AGUA_SABOR',
  p07: 'AGUA_MALESTAR',
};

/** RN-12: los lugares vulnerables eran una constante de codigo, no config. */
const LUGARES_VULNERABLES_CODIGOS = ['ESCUELA', 'HOSPITAL'];

/**
 * `codigo de pregunta -> (texto de opcion -> codigo de opcion)`, para traducir las
 * claves de las tablas viejas. Se arma sobre TODAS las preguntas con codigo: una
 * config vieja puede referenciar opciones de una version de encuesta ya archivada.
 */
async function construirTraductor() {
  const preguntas = await prisma.pregunta.findMany({
    where: { codigo: { not: null } },
    select: { codigo: true, opciones: { select: { texto: true, codigo: true } } },
  });

  const traductor = new Map();
  for (const pregunta of preguntas) {
    const porTexto = traductor.get(pregunta.codigo) ?? new Map();
    for (const opcion of pregunta.opciones) {
      if (opcion.codigo && !porTexto.has(opcion.texto)) {
        porTexto.set(opcion.texto, opcion.codigo);
      }
    }
    traductor.set(pregunta.codigo, porTexto);
  }
  return traductor;
}

/** Convierte `{texto: puntaje}` en `{codigo: puntaje}`. */
function traducirTabla(tabla, preguntaCodigo, traductor, avisos) {
  const porTexto = traductor.get(preguntaCodigo);
  const resultado = {};

  for (const [texto, puntaje] of Object.entries(tabla ?? {})) {
    const codigo = porTexto?.get(texto);
    if (!codigo) {
      avisos.push(`  ! ${preguntaCodigo}: no encontre la opcion "${texto}" en la DB; se descarta.`);
      continue;
    }
    resultado[codigo] = puntaje;
  }

  return resultado;
}

function convertir(puntajes, traductor, avisos, bonusVulnerable) {
  const reglas = [];

  // F2: base por color + bonus por particulas. El bonus era "si la opcion elegida
  // es exactamente `p05Texto`, sumar `p05SiBonus`", que como regla es una tabla de
  // dos entradas.
  const p04 = traducirTabla(puntajes.f2?.p04, PREGUNTA_DE_TABLA.p04, traductor, avisos);
  if (Object.keys(p04).length > 0) {
    reglas.push({ preguntaCodigo: PREGUNTA_DE_TABLA.p04, factor: 'f2', opciones: p04 });
  }

  const p05Codigo = traductor.get(PREGUNTA_DE_TABLA.p05)?.get(puntajes.f2?.p05Texto);
  if (p05Codigo && puntajes.f2?.p05SiBonus) {
    reglas.push({
      preguntaCodigo: PREGUNTA_DE_TABLA.p05,
      factor: 'f2',
      opciones: { [p05Codigo]: puntajes.f2.p05SiBonus },
    });
  } else if (puntajes.f2?.p05Texto) {
    avisos.push(`  ! F2: no pude ubicar la opcion de bonus "${puntajes.f2.p05Texto}"; la regla no se crea.`);
  }

  // F3: las tres tablas se suman, igual que antes.
  for (const clave of ['p03', 'p06', 'p07']) {
    const preguntaCodigo = PREGUNTA_DE_TABLA[clave];
    const opciones = traducirTabla(puntajes.f3?.[clave], preguntaCodigo, traductor, avisos);
    if (Object.keys(opciones).length > 0) {
      reglas.push({ preguntaCodigo, factor: 'f3', opciones });
    }
  }

  // El motor viejo comparaba contra la opcion "Si" de P-07 para el piso de nivel.
  const codigoSi = traductor.get(PREGUNTA_DE_TABLA.p07)?.get('Sí');
  const reglasEspeciales = [];

  if (codigoSi) {
    reglasEspeciales.push({
      nombre: 'Piso de nivel por malestar reportado',
      preguntaCodigo: PREGUNTA_DE_TABLA.p07,
      opcionCodigos: [codigoSi],
      efecto: 'nivelMinimo',
      valor: 1,
    });
  } else {
    avisos.push('  ! No encontre la opcion "Sí" de malestar; el piso de nivel queda sin regla.');
  }

  reglasEspeciales.push({
    nombre: 'Suma por lugar sensible',
    preguntaCodigo: 'LUGAR_REPORTE',
    opcionCodigos: LUGARES_VULNERABLES_CODIGOS,
    efecto: 'sumarCriticidad',
    // El monto vivia aparte, en la columna `bonusVulnerable`; ahora es de la regla.
    valor: bonusVulnerable,
  });

  return {
    f1: puntajes.f1,
    f4: puntajes.f4 ?? { divisor: 1 },
    factores: {
      f2: { modo: 'suma', tope: puntajes.f2?.tope ?? 5 },
      f3: { modo: 'suma', tope: puntajes.f3?.tope ?? 5 },
      f5: { modo: 'suma', tope: 5 },
    },
    reglas,
    reglasEspeciales,
  };
}

/**
 * Convierte una config que ya esta por reglas pero todavia usa las dos ranuras
 * fijas (`pisoNivel1` / `bonusVulnerabilidad`) al formato de reglas especiales.
 */
function convertirMarcadores(puntajes, bonusVulnerable) {
  const reglasEspeciales = [];

  if (puntajes.pisoNivel1) {
    reglasEspeciales.push({
      nombre: 'Piso de nivel por malestar reportado',
      preguntaCodigo: puntajes.pisoNivel1.preguntaCodigo,
      opcionCodigos: puntajes.pisoNivel1.opcionCodigos,
      efecto: 'nivelMinimo',
      valor: 1,
    });
  }

  if (puntajes.bonusVulnerabilidad) {
    reglasEspeciales.push({
      nombre: 'Suma por lugar sensible',
      preguntaCodigo: puntajes.bonusVulnerabilidad.preguntaCodigo,
      opcionCodigos: puntajes.bonusVulnerabilidad.opcionCodigos,
      efecto: 'sumarCriticidad',
      valor: bonusVulnerable,
    });
  }

  const { pisoNivel1, bonusVulnerabilidad, ...resto } = puntajes;
  return { ...resto, reglasEspeciales };
}

async function main() {
  const configs = await prisma.configuracionCriticidad.findMany({ orderBy: { version: 'asc' } });
  const traductor = await construirTraductor();

  let migradas = 0;
  let salteadas = 0;

  for (const config of configs) {
    const puntajes = config.puntajes;
    const bonusVulnerable = Number(config.bonusVulnerable ?? 0.5);

    if (puntajes && Array.isArray(puntajes.reglasEspeciales)) {
      console.log(`v${config.version}: ya esta en el formato actual; se saltea.`);
      salteadas += 1;
      continue;
    }

    const avisos = [];
    // Dos saltos posibles: del formato original (tablas por texto) o del
    // intermedio (ya por reglas, pero con las dos ranuras fijas).
    const nuevos =
      puntajes && Array.isArray(puntajes.reglas)
        ? convertirMarcadores(puntajes, bonusVulnerable)
        : convertir(puntajes ?? {}, traductor, avisos, bonusVulnerable);

    await prisma.configuracionCriticidad.update({
      where: { id: config.id },
      data: { puntajes: nuevos },
    });

    console.log(
      `v${config.version}: migrada (${nuevos.reglas.length} reglas de puntaje, ` +
        `${nuevos.reglasEspeciales.length} regla(s) especial(es)).`,
    );
    for (const aviso of avisos) {
      console.log(aviso);
    }
    migradas += 1;
  }

  console.log(`\nListo. ${migradas} migrada(s), ${salteadas} ya estaban en el formato nuevo.`);
}

main()
  .catch((error) => {
    console.error('Error migrando los puntajes de criticidad.');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
