/**
 * Texto del SMS con un codigo de verificacion. Modulo puro (sin red ni env) para
 * poder testearlo: lo usa `enviarCodigoVerificacion` de `sms.service.ts`.
 */

const DIGITOS_EN_LETRAS = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve'];

/** A los numeros que empiezan con estos prefijos el codigo se manda en letras. */
const PREFIJOS_CODIGO_EN_LETRAS = ['59599'];

/** `'1203'` -> `'uno dos cero tres'`. Cualquier caracter que no sea digito se descarta. */
export function codigoEnLetras(codigo: string): string {
  return codigo
    .replace(/\D/g, '')
    .split('')
    .map((d) => DIGITOS_EN_LETRAS[Number(d)])
    .join(' ');
}

/**
 * Decide por el prefijo del telefono, normalizado a solo digitos: el numero se
 * guarda como `595...`, pero asi tambien entra `+595...` o con espacios.
 */
export function usaCodigoEnLetras(telefono: string): boolean {
  const digitos = telefono.replace(/\D/g, '');
  return PREFIJOS_CODIGO_EN_LETRAS.some((prefijo) => digitos.startsWith(prefijo));
}

export function mensajeCodigoVerificacion(telefono: string, codigo: string, minutosVigencia: number): string {
  const vence = `Vence en ${minutosVigencia} ${minutosVigencia === 1 ? 'minuto' : 'minutos'}.`;
  if (usaCodigoEnLetras(telefono)) {
    return `Tu pin es ${codigoEnLetras(codigo)}. ${vence}`;
  }
  return `Tu codigo de verificacion es ${codigo}. ${vence}`;
}
