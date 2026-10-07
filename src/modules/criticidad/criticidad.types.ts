import type { Canal } from '@prisma/client';

/**
 * Pesos de cada factor (deben sumar 1 en la config, pero el engine renormaliza
 * sobre los factores disponibles).
 */
export interface PesosFactores {
  f1: number;
  f2: number;
  f3: number;
  f4: number;
  f5: number;
}

export interface UmbralesNivel {
  n1: number;
  n2: number;
  n3: number;
}

/**
 * Valor 0-5 de cada factor, o `null` si el factor no esta disponible para este
 * reporte (F4 con IA pendiente/ERROR, F5 sin malla activa, F1/F2/F3 sin dato).
 * Un factor `null` se omite y su peso se renormaliza (ERS §5.1).
 */
export interface Factores {
  f1: number | null;
  f2: number | null;
  f3: number | null;
  f4: number | null;
  f5: number | null;
}

/**
 * Entrada de la funcion pura de combinacion (ERS §5.1). Todo lo que requiere DB
 * (F1 Haversine, F2/F3 desde respuestas, F4 desde la IA) ya viene resuelto.
 */
export interface EntradaCombinacion {
  factores: Factores;
  pesos: PesosFactores;
  umbrales: UmbralesNivel;
  /** Lo que aportaron las reglas especiales de este reporte. */
  efectos: EfectosEspeciales;
}

export interface ResultadoCombinacion {
  /** Criticidad final 0-5 (renormalizada + sumas especiales, redondeada a 2 decimales). */
  criticidad: number;
  /** Nivel 0-3 (ERS §5.3), ya aplicado el nivel minimo de las reglas especiales. */
  nivel: number;
  factores: Factores;
  /** Total sumado a la criticidad por reglas especiales. */
  sumaCriticidad: number;
}

// --- Forma tipada de `ConfiguracionCriticidad.puntajes` (JSON, ERS §5.2) ---

export interface TablaF1 {
  /** Ordenada por `max` creciente; `max: null` = infinito (ultimo tramo). */
  tabla: { max: number | null; valor: number }[];
}

/**
 * F4 = `EvaluacionIa.riesgoScore` / `divisor`. La fuente esta fija en el motor
 * (`calcularF4`), por eso aca solo se versiona el divisor: hoy 1 porque la IA ya
 * devuelve 0-5; seria 20 si migrara a 0-100.
 */
export interface TablaF4 {
  divisor: number;
}

/**
 * Factores que se alimentan del CUESTIONARIO, o sea los unicos que las reglas
 * pueden puntuar. F1 (densidad de reportes cercanos) y F4 (score de la IA) no
 * salen de respuestas, asi que conservan su forma propia (`TablaF1`/`TablaF4`).
 *
 * F5 entra en la lista aunque hoy no se use: con el motor por reglas, empezar a
 * alimentarlo pasa a ser cargar reglas desde el panel, sin tocar codigo. Mientras
 * no tenga reglas devuelve `null` y se renormaliza, igual que hasta ahora.
 */
export type FactorCuestionario = 'f2' | 'f3' | 'f5';

/**
 * Como se combinan los aportes de las reglas de un mismo factor:
 *  - `suma`: los aportes se suman (comportamiento historico de F2 y F3).
 *  - `max`: gana el aporte mas alto; agregar preguntas no infla el factor.
 *  - `promedio`: media de los aportes PRESENTES. A diferencia de `suma`, no
 *    subestima cuando el ciudadano no contesto alguna pregunta del factor.
 */
export type ModoAgregacion = 'suma' | 'max' | 'promedio';

export interface FactorCuestionarioConfig {
  modo: ModoAgregacion;
  /**
   * Tope del factor ya agregado. OPCIONAL y ya no editable: el tope de todo factor
   * es `CRITICIDAD_MAX`, porque los cinco se promedian entre si y solo son
   * comparables en la misma escala. Sigue en el tipo porque las versiones viejas de
   * la configuracion son inmutables y lo tienen guardado.
   */
  tope?: number;
}

/**
 * Una pregunta puntuando un factor. Reemplaza a las viejas `TablaF2`/`TablaF3`,
 * que tenian las preguntas cableadas en las claves (`p04`, `p03`, `p06`, `p07`).
 *
 * Se clava al `codigo` de la pregunta y de la opcion, NO al texto (que el analista
 * puede corregir) ni al id (que cambia en cada version de encuesta, porque el
 * versionado duplica las preguntas). Ver `Pregunta.codigo` en el schema.
 */
export interface ReglaPuntaje {
  preguntaCodigo: string;
  factor: FactorCuestionario;
  /**
   * Multiplicador del aporte de esta regla (default 1). Permite que dentro de un
   * mismo factor una pregunta pese mas que otra sin tocar sus puntajes.
   */
  peso?: number;
  /** `codigo` de la opcion -> puntaje 0-5. */
  opciones: Record<string, number>;
}

/**
 * Que le hace al resultado una regla especial que se activo.
 *  - `nivelMinimo`: el nivel del reporte no puede quedar por debajo de `valor`,
 *    aunque la criticidad calculada de menos. Es un piso, no un salto: si el
 *    calculo ya dio mas, gana el calculo.
 *  - `sumarCriticidad`: suma `valor` puntos a la criticidad (con el tope de 5).
 */
export type EfectoReglaEspecial = 'nivelMinimo' | 'sumarCriticidad';

/**
 * Una regla que no puntua un factor sino que actua sobre el RESULTADO: "si la
 * pregunta X se respondio con alguna de estas opciones, entonces <efecto>".
 *
 * Generaliza lo que antes eran dos reglas fijas y cableadas (el piso de nivel por
 * malestar y el bonus por lugar vulnerable, RN-11 y RN-12 del ERS). Ahora son
 * datos: se pueden crear las que hagan falta, y el analista les pone nombre.
 */
export interface ReglaEspecial {
  /** Nombre que le da el analista ("Piso por malestar"). Solo para mostrar. */
  nombre: string;
  preguntaCodigo: string;
  opcionCodigos: string[];
  efecto: EfectoReglaEspecial;
  /** `nivelMinimo`: un nivel 0-3. `sumarCriticidad`: puntos 0-5. */
  valor: number;
}

/**
 * Resultado de evaluar todas las reglas especiales sobre un reporte. Se acumulan:
 * varias reglas de suma se suman entre si, y de varios niveles minimos gana el mas
 * alto.
 */
export interface EfectosEspeciales {
  sumaCriticidad: number;
  nivelMinimo: number;
}

export interface PuntajesConfig {
  f1: TablaF1;
  f4: TablaF4;
  /** Modo de agregacion y tope de cada factor de cuestionario. */
  factores: Record<FactorCuestionario, FactorCuestionarioConfig>;
  reglas: ReglaPuntaje[];
  /**
   * Reglas que actuan sobre el resultado. Lista vacia = ninguna.
   *
   * Reemplazan a `pisoNivel1` y `bonusVulnerabilidad`, que eran dos ranuras fijas:
   * el monto del bonus vivia ademas en la columna `bonusVulnerable`, asi que una
   * sola regla quedaba partida en dos lugares. Ahora cada regla se describe entera
   * acá, y puede haber mas de dos.
   */
  reglasEspeciales: ReglaEspecial[];
}

/**
 * Respuesta de una pregunta lista para el motor. Por codigo, no por texto.
 * `preguntaCodigo` es nullable porque la columna lo es: una pregunta sin codigo
 * simplemente no puede ser alcanzada por ninguna regla.
 */
export interface RespuestaCriticidad {
  preguntaCodigo: string | null;
  opcionCodigos: string[];
}

export interface ReporteParaCriticidad {
  reporteId: number;
  canal: Canal;
  latitud: number;
  longitud: number;
  respuestas: RespuestaCriticidad[];
  /** riesgoScore 0-5 solo si la IA quedo COMPLETADO; null en cualquier otro caso. */
  riesgoScoreIa: number | null;
  /**
   * Criticidad y nivel que el reporte tenia ANTES de este recalculo (null la
   * primera vez). Solo se usan para auditar el cambio: el calculo no los mira,
   * justamente porque es idempotente y no debe depender de su resultado anterior.
   */
  criticidadPrevia: number | null;
  nivelPrevio: number | null;
}
