import { Prisma } from '@prisma/client';

/**
 * Secuencia de Postgres que numera los codigos (ver migracion
 * `codigo_publico_secuencial`). Las comillas dobles son parte del valor a
 * proposito: `nextval` resuelve el nombre como identificador y, sin comillas,
 * lo pasaria a minusculas y no encontraria la secuencia.
 */
const SECUENCIA = '"Reporte_codigoPublico_seq"';

/** Digitos con los que se rellena el numero: AGD-0000001. */
const DIGITOS = 7;

/**
 * Da formato al codigo publico a partir de su numero (`7` -> `AGD-0000007`).
 * Si algun dia se pasan los 7 digitos, el numero se escribe completo: nunca se
 * trunca (dos reportes distintos no pueden terminar con el mismo codigo).
 */
export function formatearCodigoPublico(numero: number | bigint): string {
  return `AGD-${numero.toString().padStart(DIGITOS, '0')}`;
}

/**
 * Genera el codigo publico de seguimiento de un reporte, secuencial y sin
 * huecos previsibles (`AGD-0000001`, `AGD-0000002`, ...). Es el identificador
 * que se le entrega al ciudadano y que consulta el endpoint publico de estado;
 * no expone informacion personal ni el id interno.
 *
 * El numero lo da `nextval`, que es atomico: dos envios simultaneos nunca
 * reciben el mismo codigo (a diferencia de un MAX()+1, que necesitaria lock).
 * Como `nextval` no se revierte, una transaccion que falle despues de pedir el
 * numero deja un hueco en la numeracion; es lo esperable en una numeracion de
 * tickets y es preferible a arriesgar duplicados.
 *
 * Recibe el cliente de la transaccion para pedir el numero dentro del mismo
 * flujo que crea el reporte.
 */
export async function generarCodigoPublico(tx: Prisma.TransactionClient): Promise<string> {
  const filas = await tx.$queryRaw<{ numero: bigint }[]>`SELECT nextval(${SECUENCIA}) AS numero`;
  const numero = filas[0]?.numero;
  if (numero === undefined) {
    throw new Error('No se pudo obtener el numero del codigo publico.');
  }
  return formatearCodigoPublico(numero);
}
