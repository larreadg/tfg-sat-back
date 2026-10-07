import test from 'node:test';
import assert from 'node:assert/strict';
import {
  alcanceDeFactor,
  combinarFactores,
  CRITICIDAD_MAX,
  evaluarReglas,
  evaluarReglasEspeciales,
  type MapaRespuestas,
  type TipoPreguntaPuntuable,
} from './criticidad.engine.ts';
import type {
  EfectosEspeciales,
  Factores,
  PesosFactores,
  PuntajesConfig,
  ReglaEspecial,
  ReglaPuntaje,
  UmbralesNivel,
} from './criticidad.types.ts';

/** Sin reglas especiales activadas. */
const SIN_EFECTOS: EfectosEspeciales = { sumaCriticidad: 0, nivelMinimo: 0 };

// Defaults de la ConfiguracionCriticidad v1 (ERS §5 / seed-config-criticidad).
const PESOS: PesosFactores = { f1: 0.25, f2: 0.25, f3: 0.2, f4: 0.2, f5: 0.1 };
const UMBRALES: UmbralesNivel = { n1: 1.5, n2: 2.75, n3: 4.0 };

function factores(f: Partial<Factores>): Factores {
  return { f1: null, f2: null, f3: null, f4: null, f5: null, ...f };
}

test('todos los factores presentes: media ponderada sin renormalizar', () => {
  const r = combinarFactores({
    factores: factores({ f1: 2, f2: 3, f3: 2, f4: 4, f5: 0 }),
    pesos: PESOS,
    umbrales: UMBRALES,
    efectos: SIN_EFECTOS,
  });
  // 0.25*2 + 0.25*3 + 0.20*2 + 0.20*4 + 0.10*0 = 2.45
  assert.equal(r.criticidad, 2.45);
  assert.equal(r.nivel, 1); // 1.5 <= 2.45 < 2.75
});

test('renormalizacion: F4 y F5 ausentes (criticidad preliminar post-envio)', () => {
  const r = combinarFactores({
    factores: factores({ f1: 2, f2: 3, f3: 2 }),
    pesos: PESOS,
    umbrales: UMBRALES,
    efectos: SIN_EFECTOS,
  });
  // (0.25*2 + 0.25*3 + 0.20*2) / (0.25+0.25+0.20) = 1.65 / 0.70 = 2.357... -> 2.36
  assert.equal(r.criticidad, 2.36);
  assert.equal(r.nivel, 1);
});

test('regla especial de nivel minimo: sube el nivel aunque la criticidad de Nivel 0', () => {
  const r = combinarFactores({
    factores: factores({ f1: 0, f2: 0, f3: 2, f4: 0, f5: 0 }),
    pesos: PESOS,
    umbrales: UMBRALES,
    efectos: { sumaCriticidad: 0, nivelMinimo: 1 },
  });
  assert.equal(r.criticidad, 0.4); // < 1.5 => Nivel 0 por umbrales
  assert.equal(r.nivel, 1); // piso de la regla especial
});

test('regla especial de suma: sube la criticidad y puede escalar el nivel', () => {
  const r = combinarFactores({
    factores: factores({ f1: 2, f2: 3, f3: 2, f4: 4, f5: 0 }),
    pesos: PESOS,
    umbrales: UMBRALES,
    efectos: { sumaCriticidad: 0.5, nivelMinimo: 0 },
  });
  assert.equal(r.criticidad, 2.95); // 2.45 + 0.5
  assert.equal(r.nivel, 2); // 2.75 <= 2.95 < 4.0 => genera alerta (Fase C)
});

test('la criticidad se topea en 5 tras sumar las reglas especiales', () => {
  const r = combinarFactores({
    factores: factores({ f1: 5, f2: 5, f3: 5, f4: 5, f5: 5 }),
    pesos: PESOS,
    umbrales: UMBRALES,
    efectos: { sumaCriticidad: 0.5, nivelMinimo: 0 },
  });
  assert.equal(r.criticidad, 5); // min(5 + 0.5, 5)
  assert.equal(r.nivel, 3);
});

test('sin ningun factor disponible: criticidad base 0 (solo las reglas especiales pueden subirla)', () => {
  const r = combinarFactores({
    factores: factores({}),
    pesos: PESOS,
    umbrales: UMBRALES,
    efectos: SIN_EFECTOS,
  });
  assert.equal(r.criticidad, 0);
  assert.equal(r.nivel, 0);
});

test('umbral inferior: criticidad exactamente en n1 cae en Nivel 1', () => {
  const r = combinarFactores({
    factores: factores({ f3: 1.5 }), // unico factor presente => criticidad = 1.5
    pesos: PESOS,
    umbrales: UMBRALES,
    efectos: SIN_EFECTOS,
  });
  assert.equal(r.criticidad, 1.5);
  assert.equal(r.nivel, 1); // n1 <= c => Nivel 1 (limite inclusivo)
});

// ---------------------------------------------------------------------------
// Motor por reglas: `evaluarReglas` / `evaluarReglasEspeciales`. Reemplazan a las
// viejas `calcularF2`/`calcularF3` y a las dos reglas fijas del motor.
// ---------------------------------------------------------------------------

function respuestas(entradas: Record<string, string[]>): MapaRespuestas {
  return new Map(Object.entries(entradas).map(([pregunta, opciones]) => [pregunta, new Set(opciones)]));
}

/** Espeja la config v1 real: F2 = color + particulas, F3 = antiguedad + sabor + malestar. */
function puntajes(overrides: Partial<PuntajesConfig> = {}): PuntajesConfig {
  return {
    f1: { tabla: [{ max: null, valor: 0 }] },
    f4: { divisor: 1 },
    factores: {
      f2: { modo: 'suma', tope: 5 },
      f3: { modo: 'suma', tope: 5 },
      f5: { modo: 'suma', tope: 5 },
    },
    reglas: [
      { preguntaCodigo: 'AGUA_COLOR', factor: 'f2', opciones: { NORMAL: 0, VERDE_ALGAS: 4, OSCURA: 5 } },
      { preguntaCodigo: 'AGUA_PARTICULAS', factor: 'f2', opciones: { SI: 1, NO: 0 } },
      { preguntaCodigo: 'AGUA_ANTIGUEDAD', factor: 'f3', opciones: { AHORA: 1, RECURRENTE: 3 } },
      { preguntaCodigo: 'AGUA_SABOR', factor: 'f3', opciones: { SABOR_RARO: 2, IGUAL: 0 } },
      { preguntaCodigo: 'AGUA_MALESTAR', factor: 'f3', opciones: { SI: 2, NO: 0 } },
    ],
    reglasEspeciales: [],
    ...overrides,
  };
}

test('reglas: F2 suma base + bonus, F3 suma sus tres preguntas', () => {
  const r = evaluarReglas(
    respuestas({
      AGUA_COLOR: ['VERDE_ALGAS'],
      AGUA_PARTICULAS: ['SI'],
      AGUA_ANTIGUEDAD: ['RECURRENTE'],
      AGUA_SABOR: ['SABOR_RARO'],
      AGUA_MALESTAR: ['NO'],
    }),
    puntajes(),
  );
  assert.equal(r.f2, 5); // 4 + 1
  assert.equal(r.f3, 5); // 3 + 2 + 0
  assert.equal(r.f5, null); // sin reglas para F5
});

test('reglas: el tope del factor se respeta', () => {
  const r = evaluarReglas(respuestas({ AGUA_COLOR: ['OSCURA'], AGUA_PARTICULAS: ['SI'] }), puntajes());
  assert.equal(r.f2, 5); // min(5 + 1, tope 5)
});

test('reglas: factor sin ningun aporte queda null, no 0 (se renormaliza)', () => {
  const r = evaluarReglas(respuestas({ AGUA_COLOR: ['NORMAL'] }), puntajes());
  assert.equal(r.f2, 0); // respondio, y su puntaje es 0
  assert.equal(r.f3, null); // no respondio NINGUNA pregunta de F3
});

test('reglas: una opcion que no esta tabulada no aporta (distinto de aportar 0)', () => {
  // `OTRO` no esta en la tabla de AGUA_COLOR; la unica regla de F2 que aporta es
  // la de particulas.
  const r = evaluarReglas(respuestas({ AGUA_COLOR: ['OTRO'], AGUA_PARTICULAS: ['SI'] }), puntajes());
  assert.equal(r.f2, 1);
});

test('reglas: pregunta que la encuesta activa ya no tiene => su regla no aporta', () => {
  // El escenario del versionado: la config puntua AGUA_SABOR, la version nueva no
  // la trae. F3 sigue calculandose con las otras dos, no se cae a null.
  const r = evaluarReglas(
    respuestas({ AGUA_ANTIGUEDAD: ['AHORA'], AGUA_MALESTAR: ['SI'] }),
    puntajes(),
  );
  assert.equal(r.f3, 3); // 1 + 2, sin el aporte de sabor
});

test('reglas: modo max toma el aporte mas alto en vez de sumar', () => {
  const config = puntajes();
  config.factores.f3 = { modo: 'max', tope: 5 };
  const r = evaluarReglas(
    respuestas({ AGUA_ANTIGUEDAD: ['RECURRENTE'], AGUA_SABOR: ['SABOR_RARO'], AGUA_MALESTAR: ['SI'] }),
    config,
  );
  assert.equal(r.f3, 3); // max(3, 2, 2)
});

test('reglas: modo promedio no subestima cuando faltan preguntas del factor', () => {
  const config = puntajes();
  config.factores.f3 = { modo: 'promedio', tope: 5 };

  const completo = evaluarReglas(
    respuestas({ AGUA_ANTIGUEDAD: ['RECURRENTE'], AGUA_SABOR: ['SABOR_RARO'], AGUA_MALESTAR: ['SI'] }),
    config,
  );
  const parcial = evaluarReglas(respuestas({ AGUA_ANTIGUEDAD: ['RECURRENTE'] }), config);

  assert.equal(completo.f3, 2.33); // (3+2+2)/3
  assert.equal(parcial.f3, 3); // con `suma` habria dado 3 igual, pero aca es la media de lo presente
});

test('reglas: peso multiplica el aporte de una regla', () => {
  const config = puntajes();
  config.reglas = [
    { preguntaCodigo: 'AGUA_SABOR', factor: 'f3', peso: 2, opciones: { SABOR_RARO: 2 } },
  ];
  const r = evaluarReglas(respuestas({ AGUA_SABOR: ['SABOR_RARO'] }), config);
  assert.equal(r.f3, 4); // 2 * 2
});

test('reglas: ELECCION_MULTIPLE suma las opciones elegidas', () => {
  const config = puntajes();
  config.reglas = [
    { preguntaCodigo: 'SINTOMAS', factor: 'f3', opciones: { DIARREA: 2, VOMITOS: 2, FIEBRE: 1 } },
  ];
  const r = evaluarReglas(respuestas({ SINTOMAS: ['DIARREA', 'FIEBRE'] }), config);
  assert.equal(r.f3, 3);
});

test('reglas especiales: se activan solo con las opciones configuradas', () => {
  const reglas: ReglaEspecial[] = [
    {
      nombre: 'Piso por malestar',
      preguntaCodigo: 'AGUA_MALESTAR',
      opcionCodigos: ['SI'],
      efecto: 'nivelMinimo',
      valor: 1,
    },
  ];

  assert.equal(evaluarReglasEspeciales(respuestas({ AGUA_MALESTAR: ['SI'] }), reglas).nivelMinimo, 1);
  assert.equal(evaluarReglasEspeciales(respuestas({ AGUA_MALESTAR: ['NO'] }), reglas).nivelMinimo, 0);
  assert.equal(evaluarReglasEspeciales(respuestas({}), reglas).nivelMinimo, 0);
});

test('reglas especiales: la de suma acepta cualquiera de sus opciones', () => {
  const reglas: ReglaEspecial[] = [
    {
      nombre: 'Lugar sensible',
      preguntaCodigo: 'LUGAR_REPORTE',
      opcionCodigos: ['ESCUELA', 'HOSPITAL'],
      efecto: 'sumarCriticidad',
      valor: 0.5,
    },
  ];

  assert.equal(evaluarReglasEspeciales(respuestas({ LUGAR_REPORTE: ['HOSPITAL'] }), reglas).sumaCriticidad, 0.5);
  assert.equal(evaluarReglasEspeciales(respuestas({ LUGAR_REPORTE: ['VIVIENDA'] }), reglas).sumaCriticidad, 0);
});

test('reglas especiales: varias sumas se acumulan y de los niveles gana el mas alto', () => {
  const reglas: ReglaEspecial[] = [
    { nombre: 'A', preguntaCodigo: 'LUGAR_REPORTE', opcionCodigos: ['ESCUELA'], efecto: 'sumarCriticidad', valor: 0.5 },
    { nombre: 'B', preguntaCodigo: 'AGUA_MALESTAR', opcionCodigos: ['SI'], efecto: 'sumarCriticidad', valor: 0.25 },
    { nombre: 'C', preguntaCodigo: 'AGUA_MALESTAR', opcionCodigos: ['SI'], efecto: 'nivelMinimo', valor: 1 },
    { nombre: 'D', preguntaCodigo: 'LUGAR_REPORTE', opcionCodigos: ['ESCUELA'], efecto: 'nivelMinimo', valor: 2 },
  ];

  const r = evaluarReglasEspeciales(respuestas({ LUGAR_REPORTE: ['ESCUELA'], AGUA_MALESTAR: ['SI'] }), reglas);
  assert.equal(r.sumaCriticidad, 0.75);
  assert.equal(r.nivelMinimo, 2);
  assert.equal(r.activadas.length, 4);
});

test('reglas especiales: el nivel minimo es un piso, no pisa un calculo mas alto', () => {
  const r = combinarFactores({
    factores: factores({ f1: 5, f2: 5, f3: 5, f4: 5, f5: 5 }),
    pesos: PESOS,
    umbrales: UMBRALES,
    efectos: { sumaCriticidad: 0, nivelMinimo: 1 },
  });
  assert.equal(r.nivel, 3); // el calculo dio 3; el piso de 1 no lo baja
});

test('reglas especiales: sin reglas, no hay efecto', () => {
  const r = evaluarReglasEspeciales(respuestas({ AGUA_MALESTAR: ['SI'] }), []);
  assert.equal(r.sumaCriticidad, 0);
  assert.equal(r.nivelMinimo, 0);
});

// --- alcanceDeFactor: el peor caso que un factor puede producir (ERS §5.2) ---

/** Todas las preguntas de eleccion unica, que es como esta la encuesta de agua. */
function unicas(...codigos: string[]): Map<string, TipoPreguntaPuntuable> {
  return new Map(codigos.map((codigo) => [codigo, 'ELECCION_UNICA' as TipoPreguntaPuntuable]));
}

/** Las reglas de un factor dentro de una `PuntajesConfig`. */
function reglasDe(config: PuntajesConfig, factor: 'f2' | 'f3' | 'f5'): ReglaPuntaje[] {
  return config.reglas.filter((regla) => regla.factor === factor);
}

test('alcance: factor sin reglas devuelve null (esta apagado, se renormaliza)', () => {
  assert.equal(alcanceDeFactor([], 'suma', new Map()), null);
});

test('alcance: modo suma acumula la peor opcion de cada pregunta', () => {
  const config = puntajes();
  const tipos = unicas('AGUA_COLOR', 'AGUA_PARTICULAS');
  // max(0,4,5) + max(1,0) = 5 + 1
  assert.equal(alcanceDeFactor(reglasDe(config, 'f2'), 'suma', tipos), 6);
});

test('alcance: modo max toma la peor pregunta, no la suma', () => {
  const config = puntajes();
  const tipos = unicas('AGUA_ANTIGUEDAD', 'AGUA_SABOR', 'AGUA_MALESTAR');
  assert.equal(alcanceDeFactor(reglasDe(config, 'f3'), 'max', tipos), 3); // max(3, 2, 2)
});

test('alcance: modo promedio pondera por los pesos de las reglas', () => {
  const reglas: ReglaPuntaje[] = [
    { preguntaCodigo: 'A', factor: 'f3', peso: 3, opciones: { X: 4 } },
    { preguntaCodigo: 'B', factor: 'f3', peso: 1, opciones: { X: 0 } },
  ];
  // (4*3 + 0*1) / (3+1) = 3
  assert.equal(alcanceDeFactor(reglas, 'promedio', unicas('A', 'B')), 3);
});

test('alcance: ELECCION_MULTIPLE suma todas sus opciones (se pueden marcar todas)', () => {
  const reglas: ReglaPuntaje[] = [
    { preguntaCodigo: 'SINTOMAS', factor: 'f3', opciones: { DIARREA: 2, VOMITOS: 2, FIEBRE: 1 } },
  ];
  const multiple = new Map<string, TipoPreguntaPuntuable>([['SINTOMAS', 'ELECCION_MULTIPLE']]);
  assert.equal(alcanceDeFactor(reglas, 'suma', multiple), 5);
  // La misma regla como eleccion unica solo puede dar la opcion mas alta.
  assert.equal(alcanceDeFactor(reglas, 'suma', unicas('SINTOMAS')), 2);
});

test('alcance: el peso de la regla multiplica el peor caso', () => {
  const reglas: ReglaPuntaje[] = [
    { preguntaCodigo: 'AGUA_SABOR', factor: 'f3', peso: 2, opciones: { SABOR_RARO: 2, IGUAL: 0 } },
  ];
  assert.equal(alcanceDeFactor(reglas, 'suma', unicas('AGUA_SABOR')), 4);
});

test('alcance: todas las opciones en 0 da 0, no null (hay reglas, no puntuan nada)', () => {
  const reglas: ReglaPuntaje[] = [{ preguntaCodigo: 'A', factor: 'f2', opciones: { X: 0, Y: 0 } }];
  assert.equal(alcanceDeFactor(reglas, 'suma', unicas('A')), 0);
});

/**
 * La propiedad que justifica toda la validacion: si el alcance llega a
 * CRITICIDAD_MAX, existe una respuesta real que hace que el factor de 5; y si no
 * llega, NINGUNA respuesta lo logra.
 */
test('alcance: es el maximo real que evaluarReglas puede devolver', () => {
  const config = puntajes();
  const tipos = unicas('AGUA_ANTIGUEDAD', 'AGUA_SABOR', 'AGUA_MALESTAR');

  // F3 de la v1 recortada del test: 3 + 2 + 2 = 7, por encima del tope.
  assert.equal(alcanceDeFactor(reglasDe(config, 'f3'), 'suma', tipos), 7);
  const peor = evaluarReglas(
    respuestas({ AGUA_ANTIGUEDAD: ['RECURRENTE'], AGUA_SABOR: ['SABOR_RARO'], AGUA_MALESTAR: ['SI'] }),
    config,
  );
  assert.equal(peor.f3, CRITICIDAD_MAX); // el tope lo recorta a 5

  // Bajando los puntajes por debajo del tope, el peor caso ya no llega a 5 y el
  // alcance lo anticipa exactamente.
  config.reglas = [
    { preguntaCodigo: 'AGUA_ANTIGUEDAD', factor: 'f3', opciones: { AHORA: 1, RECURRENTE: 2 } },
    { preguntaCodigo: 'AGUA_SABOR', factor: 'f3', opciones: { SABOR_RARO: 1, IGUAL: 0 } },
  ];
  assert.equal(alcanceDeFactor(reglasDe(config, 'f3'), 'suma', unicas('AGUA_ANTIGUEDAD', 'AGUA_SABOR')), 3);
  const nuevoPeor = evaluarReglas(
    respuestas({ AGUA_ANTIGUEDAD: ['RECURRENTE'], AGUA_SABOR: ['SABOR_RARO'] }),
    config,
  );
  assert.equal(nuevoPeor.f3, 3); // nunca 5, haga lo que haga el ciudadano
});

test('alcance: un factor sin tope configurado igual se mide contra CRITICIDAD_MAX', () => {
  // `agregar()` usa CRITICIDAD_MAX cuando falta `tope`, asi que el alcance que se
  // exige es el mismo con o sin la clave guardada.
  const config = puntajes();
  delete (config.factores as Record<string, unknown>)['f2'];
  const r = evaluarReglas(respuestas({ AGUA_COLOR: ['OSCURA'], AGUA_PARTICULAS: ['SI'] }), config);
  assert.equal(r.f2, CRITICIDAD_MAX);
});
