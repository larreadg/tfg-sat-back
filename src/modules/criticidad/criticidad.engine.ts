import type {
  EfectosEspeciales,
  EntradaCombinacion,
  FactorCuestionario,
  FactorCuestionarioConfig,
  Factores,
  ModoAgregacion,
  PesosFactores,
  PuntajesConfig,
  ReglaEspecial,
  ReglaPuntaje,
  ResultadoCombinacion,
  UmbralesNivel,
} from './criticidad.types';

/**
 * Tope de la escala de criticidad, y por lo tanto el tope de TODOS los factores:
 * los cinco se promedian entre si (`renormalizar`), asi que solo son comparables
 * si comparten la escala 0-5. Por eso no es configurable por factor.
 */
export const CRITICIDAD_MAX = 5;

/**
 * Los factores que las reglas pueden alimentar. Vive aca y no en
 * `criticidad.types.ts` porque ese archivo tiene que quedar solo con tipos: un
 * import de VALOR desde el engine obligaria a poner la extension `.ts` en el
 * import para que `node --test --experimental-strip-types` lo resuelva.
 */
const FACTORES_CUESTIONARIO: FactorCuestionario[] = ['f2', 'f3', 'f5'];

function redondear2(valor: number): number {
  return Math.round(valor * 100) / 100;
}

/**
 * Respuestas del reporte listas para evaluar reglas: `codigo` de pregunta ->
 * `codigo`s de las opciones elegidas (varias si la pregunta es ELECCION_MULTIPLE).
 */
export type MapaRespuestas = Map<string, Set<string>>;

/**
 * Evalua las reglas de la configuracion sobre las respuestas y devuelve los
 * factores de cuestionario (F2/F3/F5). Funcion PURA: reemplaza a las viejas
 * `calcularF2`/`calcularF3`, que tenian las preguntas cableadas por texto.
 *
 * Reglas de disponibilidad, alineadas con la renormalizacion del ERS §5.1:
 *  - Una regla cuya pregunta no fue respondida, o cuyas opciones elegidas no estan
 *    en su tabla, NO aporta (y no cuenta para el promedio).
 *  - Un factor sin ningun aporte queda `null`, no 0: asi `combinarFactores` lo
 *    omite y renormaliza en vez de castigar al reporte con un cero.
 *
 * Diferencia deliberada con el motor viejo: antes, si faltaba P-04, F2 entero se
 * caia a `null` aunque P-05 estuviera respondida. Ahora cada regla aporta lo que
 * puede. Es la unica forma coherente cuando la cantidad de preguntas por factor es
 * configurable.
 */
export function evaluarReglas(
  respuestas: MapaRespuestas,
  puntajes: PuntajesConfig,
): Pick<Factores, FactorCuestionario> {
  const factores = {} as Pick<Factores, FactorCuestionario>;

  for (const factor of FACTORES_CUESTIONARIO) {
    const reglas = puntajes.reglas.filter((regla) => regla.factor === factor);
    const aportes = reglas
      .map((regla) => aporteDeRegla(respuestas, regla))
      .filter((aporte): aporte is Aporte => aporte !== null);

    factores[factor] = agregar(aportes, puntajes.factores[factor]);
  }

  return factores;
}

interface Aporte {
  valor: number;
  peso: number;
}

/**
 * Puntaje que aporta una regla, o `null` si no aplica a este reporte. Las opciones
 * elegidas se SUMAN entre si: para ELECCION_UNICA es indistinto, y para
 * ELECCION_MULTIPLE es la lectura natural ("marco tres sintomas, suman tres").
 */
function aporteDeRegla(respuestas: MapaRespuestas, regla: ReglaPuntaje): Aporte | null {
  const elegidas = respuestas.get(regla.preguntaCodigo);
  if (!elegidas || elegidas.size === 0) {
    return null;
  }

  let valor = 0;
  let algunaConocida = false;

  for (const codigo of elegidas) {
    const puntaje = regla.opciones[codigo];
    if (puntaje === undefined) {
      continue;
    }
    valor += puntaje;
    algunaConocida = true;
  }

  // Ninguna de las opciones elegidas esta tabulada: la regla no tiene nada que
  // decir sobre este reporte. Devolver 0 seria afirmar "riesgo nulo", que es
  // distinto de "no se".
  if (!algunaConocida) {
    return null;
  }

  const peso = regla.peso ?? 1;
  return { valor: valor * peso, peso };
}

function agregar(aportes: Aporte[], config: FactorCuestionarioConfig | undefined): number | null {
  if (aportes.length === 0) {
    return null;
  }

  // Un factor con reglas pero sin entrada en `factores` seria un JSON invalido; el
  // schema zod lo rechaza. Aca se elige el modo historico en vez de tirar, porque
  // este codigo corre dentro del flujo del ciudadano.
  const modo = config?.modo ?? 'suma';
  const tope = config?.tope ?? CRITICIDAD_MAX;

  let valor: number;
  switch (modo) {
    case 'max':
      valor = Math.max(...aportes.map((aporte) => aporte.valor));
      break;
    case 'promedio': {
      const sumaPesos = aportes.reduce((acumulado, aporte) => acumulado + aporte.peso, 0);
      const sumaValores = aportes.reduce((acumulado, aporte) => acumulado + aporte.valor, 0);
      valor = sumaPesos === 0 ? 0 : sumaValores / sumaPesos;
      break;
    }
    default:
      valor = aportes.reduce((acumulado, aporte) => acumulado + aporte.valor, 0);
  }

  return redondear2(Math.min(valor, tope));
}

/**
 * Tipo de una pregunta, en lo que le importa al alcance: si el ciudadano puede
 * elegir una sola opcion o varias. (`FOTO` no se puntua, asi que no entra.)
 */
export type TipoPreguntaPuntuable = 'ELECCION_UNICA' | 'ELECCION_MULTIPLE';

/**
 * Valor mas alto que una regla puede aportar: el peor caso posible de esa pregunta.
 * En `ELECCION_UNICA` es la opcion mas alta (se elige una); en `ELECCION_MULTIPLE`
 * es la suma de todas, porque `aporteDeRegla` suma las elegidas y se pueden marcar
 * todas.
 */
function aporteMaximo(regla: ReglaPuntaje, tipo: TipoPreguntaPuntuable): number {
  const valores = Object.values(regla.opciones);
  if (valores.length === 0) {
    return 0;
  }

  const base =
    tipo === 'ELECCION_MULTIPLE'
      ? valores.reduce((acumulado, valor) => acumulado + valor, 0)
      : Math.max(...valores);

  return base * (regla.peso ?? 1);
}

/**
 * Valor mas alto que un factor puede alcanzar si el ciudadano responde TODAS sus
 * preguntas con la peor opcion. `null` si el factor no tiene reglas (esta apagado:
 * devuelve `null` en `evaluarReglas` y se renormaliza).
 *
 * Existe para poder exigir, al guardar la configuracion, que cada factor pueda
 * llegar a `CRITICIDAD_MAX`. Un factor que como maximo da 3 entra a la media
 * ponderada con su peso completo pero sin poder nunca llegar al rojo: su peso
 * configurado pasa a ser una mentira y el reporte mas grave posible queda
 * subclasificado, sin que nada falle ni avise.
 *
 * Funcion PURA, y espeja a `agregar()` modo por modo: si una cambia, la otra
 * tambien. El front reimplementa esta formula (`motor-criticidad.form.ts`) para
 * avisar mientras se edita; los dos lados tienen que dar el mismo numero.
 *
 * Nota sobre `promedio`: devuelve la media con TODAS las preguntas respondidas.
 * El maximo teorico es mas alto (quien responde solo la peor pregunta saca mas,
 * porque la media es sobre las presentes), pero el peor caso completo es el unico
 * numero que el analista puede razonar mirando la pantalla.
 */
export function alcanceDeFactor(
  reglas: ReglaPuntaje[],
  modo: ModoAgregacion,
  tipos: Map<string, TipoPreguntaPuntuable>,
): number | null {
  if (reglas.length === 0) {
    return null;
  }

  // Una pregunta que la encuesta activa ya no tiene se asume de eleccion unica: es
  // la lectura conservadora (da el alcance mas bajo). De todas formas una regla asi
  // no se puede guardar, la rechaza `validarReglasContraEncuestaActiva`.
  const maximos = reglas.map((regla) => aporteMaximo(regla, tipos.get(regla.preguntaCodigo) ?? 'ELECCION_UNICA'));

  switch (modo) {
    case 'max':
      return redondear2(Math.max(...maximos));
    case 'promedio': {
      const sumaPesos = reglas.reduce((acumulado, regla) => acumulado + (regla.peso ?? 1), 0);
      if (sumaPesos === 0) {
        return 0;
      }
      return redondear2(maximos.reduce((acumulado, maximo) => acumulado + maximo, 0) / sumaPesos);
    }
    default:
      return redondear2(maximos.reduce((acumulado, maximo) => acumulado + maximo, 0));
  }
}

/** `true` si la pregunta de la regla se respondio con alguna de sus opciones. */
export function reglaEspecialSeActiva(respuestas: MapaRespuestas, regla: ReglaEspecial): boolean {
  const elegidas = respuestas.get(regla.preguntaCodigo);
  if (!elegidas) {
    return false;
  }
  return regla.opcionCodigos.some((codigo) => elegidas.has(codigo));
}

/**
 * Acumula el efecto de todas las reglas especiales activadas por el reporte.
 * Funcion PURA.
 *
 * Varias sumas se suman entre si; de varios niveles minimos gana el mas alto. Asi,
 * agregar una regla nunca puede BAJAR el resultado, que es lo que se espera de algo
 * llamado "piso" o "bonus".
 */
export function evaluarReglasEspeciales(
  respuestas: MapaRespuestas,
  reglas: ReglaEspecial[] | undefined,
): EfectosEspeciales & { activadas: ReglaEspecial[] } {
  const activadas = (reglas ?? []).filter((regla) => reglaEspecialSeActiva(respuestas, regla));

  let sumaCriticidad = 0;
  let nivelMinimo = 0;

  for (const regla of activadas) {
    if (regla.efecto === 'sumarCriticidad') {
      sumaCriticidad += regla.valor;
    } else {
      nivelMinimo = Math.max(nivelMinimo, regla.valor);
    }
  }

  return { sumaCriticidad: redondear2(sumaCriticidad), nivelMinimo, activadas };
}

/**
 * Combina los factores F1..F5 en la criticidad final y el nivel (ERS §5.1, §5.3).
 * Funcion PURA (sin DB ni IO): todo lo que requiere consultas ya viene resuelto
 * en `entrada`. Esto la hace unitariamente testeable (ver criticidad.engine.test.ts).
 *
 * Reglas:
 *  - Un factor `null` se omite y su peso se renormaliza para que los presentes
 *    sumen 1 (ERS §5.1). Si NO hay ningun factor disponible, la criticidad base
 *    es 0 (solo puede subir por las reglas especiales).
 *  - Se suma `efectos.sumaCriticidad` a la criticidad (tope 5).
 *  - Nivel por `umbrales` (n1<n2<n3), y despues `nivel = max(nivel, nivelMinimo)`.
 */
export function combinarFactores(entrada: EntradaCombinacion): ResultadoCombinacion {
  const { factores, pesos, umbrales, efectos } = entrada;

  const criticidadBase = renormalizar(factores, pesos);
  const criticidad = redondear2(Math.min(criticidadBase + efectos.sumaCriticidad, CRITICIDAD_MAX));

  // El nivel minimo es un PISO: si el calculo ya dio mas, gana el calculo.
  const nivel = Math.max(nivelPorUmbrales(criticidad, umbrales), efectos.nivelMinimo);

  return { criticidad, nivel, factores, sumaCriticidad: efectos.sumaCriticidad };
}

/**
 * Media ponderada de los factores presentes, con renormalizacion de pesos
 * (ERS §5.1). Devuelve un valor 0-5 (sin bonus).
 */
function renormalizar(factores: Factores, pesos: PesosFactores): number {
  const componentes: { valor: number | null; peso: number }[] = [
    { valor: factores.f1, peso: pesos.f1 },
    { valor: factores.f2, peso: pesos.f2 },
    { valor: factores.f3, peso: pesos.f3 },
    { valor: factores.f4, peso: pesos.f4 },
    { valor: factores.f5, peso: pesos.f5 },
  ];

  let sumaPesos = 0;
  let sumaPonderada = 0;

  for (const { valor, peso } of componentes) {
    if (valor === null || valor === undefined) {
      continue;
    }
    sumaPonderada += valor * peso;
    sumaPesos += peso;
  }

  if (sumaPesos === 0) {
    return 0;
  }

  return sumaPonderada / sumaPesos;
}

function nivelPorUmbrales(criticidad: number, umbrales: UmbralesNivel): number {
  if (criticidad < umbrales.n1) {
    return 0;
  }
  if (criticidad < umbrales.n2) {
    return 1;
  }
  if (criticidad < umbrales.n3) {
    return 2;
  }
  return 3;
}
