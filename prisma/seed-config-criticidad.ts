const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/**
 * Siembra la ConfiguracionCriticidad version 1 ACTIVA con los defaults de ERS
 * §5 (motor de criticidad). Todo parametro es dato versionado, nunca hardcode.
 *
 * `puntajes` esta claveado por el `codigo` de cada pregunta y opcion (los que
 * siembra `seed-encuesta-agua.ts`), NO por su texto: asi renombrar una pregunta o
 * versionar la encuesta no deja al motor sin encontrarla.
 *
 * Que preguntas alimentan F2 y F3 es un DATO de esta configuracion, no algo
 * cableado en el codigo: agregar una pregunta puntuada es sumar una regla.
 * F4: la IA ya devuelve riesgoScore en escala 0-5 (no 0-100), por eso `divisor=1`
 * (si se migrara a 0-100, pasar a 20).
 */
const CONFIG_V1 = {
  version: 1,
  pesos: { f1: 0.25, f2: 0.25, f3: 0.2, f4: 0.2, f5: 0.1 },
  umbralesNivel: { n1: 1.5, n2: 2.75, n3: 4.0 },
  radioMetros: 500,
  ventanaDias: 7,
  minReportes: 3,
  limitesAntiabuso: { otpPorHora: 3, reportesPor24h: 3 },
  bonusVulnerable: 0.5,
  puntajes: {
    f1: {
      tabla: [
        { max: 0, valor: 0 },
        { max: 1, valor: 1 },
        { max: 2, valor: 2 },
        { max: 3, valor: 3 },
        { max: 5, valor: 4 },
        { max: null, valor: 5 },
      ],
    },
    // La IA ya devuelve riesgoScore en escala 0-5, por eso divisor=1 (seria 20
    // si migrara a 0-100). La fuente del dato esta fija en `calcularF4`.
    f4: { divisor: 1 },
    // Como agrega cada factor los aportes de sus reglas. `suma` reproduce el
    // comportamiento historico de F2 y F3; `promedio` seria mas robusto ante
    // preguntas sin responder, pero cambiaria los numeros del ERS.
    //
    // El `tope` ya no se configura desde el panel: es CRITICIDAD_MAX para todos los
    // factores, porque los cinco se promedian entre si y solo son comparables en la
    // misma escala 0-5. Se sigue escribiendo por compatibilidad con las versiones
    // guardadas. La contracara es que cada factor tiene que PODER llegar a 5: con
    // estos puntajes F2 alcanza 6 y F3 alcanza 7, asi que los dos pueden saturar
    // (ver `alcanceDeFactor` en criticidad.engine.ts).
    factores: {
      f2: { modo: 'suma', tope: 5 },
      f3: { modo: 'suma', tope: 5 },
      // F5 (malla de riesgo) no tiene reglas todavia: queda `null` y se
      // renormaliza. Cuando se implemente, alcanza con cargarle reglas.
      f5: { modo: 'suma', tope: 5 },
    },
    reglas: [
      // F2 = aspecto del agua (antes P-04 base + P-05 bonus, cableado en el motor).
      {
        preguntaCodigo: 'AGUA_COLOR',
        factor: 'f2',
        opciones: {
          NORMAL: 0,
          OTRO: 1,
          BLANQUECINA: 2,
          AMARILLA_MARRON: 3,
          VERDE_ALGAS: 4,
          OSCURA: 5,
        },
      },
      { preguntaCodigo: 'AGUA_PARTICULAS', factor: 'f2', opciones: { SI: 1, NO: 0 } },

      // F3 = antiguedad + sabor + malestar.
      {
        preguntaCodigo: 'AGUA_ANTIGUEDAD',
        factor: 'f3',
        opciones: { AHORA: 1, HOY: 1, VARIOS_DIAS: 2, SEMANAS: 2, RECURRENTE: 3, NO_SABE: 0 },
      },
      {
        preguntaCodigo: 'AGUA_SABOR',
        factor: 'f3',
        opciones: { SABOR_RARO: 2, SABOR_SALADO: 1, IGUAL: 0, NO_PROBE: 0 },
      },
      {
        preguntaCodigo: 'AGUA_MALESTAR',
        factor: 'f3',
        opciones: { SI: 2, NO: 0, NO_SABE: 0 },
      },
    ],
    // Reglas que actuan sobre el RESULTADO, no sobre un factor. Antes eran dos
    // constantes en el codigo del motor (RN-11 y RN-12 del ERS); ahora son datos y
    // se pueden crear las que hagan falta.
    reglasEspeciales: [
      {
        nombre: 'Piso de nivel por malestar reportado',
        preguntaCodigo: 'AGUA_MALESTAR',
        opcionCodigos: ['SI'],
        efecto: 'nivelMinimo',
        valor: 1,
      },
      {
        nombre: 'Suma por lugar sensible',
        preguntaCodigo: 'LUGAR_REPORTE',
        opcionCodigos: ['ESCUELA', 'HOSPITAL'],
        efecto: 'sumarCriticidad',
        valor: 0.5,
      },
    ],
  },
};

async function main() {
  const config = await prisma.configuracionCriticidad.upsert({
    where: { version: CONFIG_V1.version },
    update: {
      pesos: CONFIG_V1.pesos,
      puntajes: CONFIG_V1.puntajes,
      umbralesNivel: CONFIG_V1.umbralesNivel,
      radioMetros: CONFIG_V1.radioMetros,
      ventanaDias: CONFIG_V1.ventanaDias,
      minReportes: CONFIG_V1.minReportes,
      limitesAntiabuso: CONFIG_V1.limitesAntiabuso,
      bonusVulnerable: CONFIG_V1.bonusVulnerable,
      activa: true,
    },
    create: {
      version: CONFIG_V1.version,
      pesos: CONFIG_V1.pesos,
      puntajes: CONFIG_V1.puntajes,
      umbralesNivel: CONFIG_V1.umbralesNivel,
      radioMetros: CONFIG_V1.radioMetros,
      ventanaDias: CONFIG_V1.ventanaDias,
      minReportes: CONFIG_V1.minReportes,
      limitesAntiabuso: CONFIG_V1.limitesAntiabuso,
      bonusVulnerable: CONFIG_V1.bonusVulnerable,
      activa: true,
    },
  });

  // Garantiza a lo sumo una version activa.
  await prisma.configuracionCriticidad.updateMany({
    where: { id: { not: config.id } },
    data: { activa: false },
  });

  console.log(`ConfiguracionCriticidad v${config.version} sembrada y activa (id ${config.id}).`);
}

main()
  .catch((error) => {
    console.error('Error sembrando la ConfiguracionCriticidad.');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
