import type { EstadoAlerta } from '@prisma/client';

/**
 * Maquina de estados de una alerta (ERS §5.4), validada en backend. Cada clave
 * es el estado actual; el arreglo, los estados a los que puede transicionar.
 * `CERRADA` y `DESCARTADA` son terminales (sin salidas).
 *
 *   NUEVA -> EN_REVISION
 *   EN_REVISION -> DERIVADA | CERRADA | DESCARTADA
 *   DERIVADA -> CERRADA
 *
 * Se tipa con `import type` (sin cargar el runtime de Prisma): los literales
 * coinciden con los valores del enum `EstadoAlerta`.
 */
export const TRANSICIONES_ALERTA: Record<EstadoAlerta, EstadoAlerta[]> = {
  NUEVA: ['EN_REVISION'],
  EN_REVISION: ['DERIVADA', 'CERRADA', 'DESCARTADA'],
  DERIVADA: ['CERRADA'],
  CERRADA: [],
  DESCARTADA: [],
};

export function esTransicionValida(actual: EstadoAlerta, nuevo: EstadoAlerta): boolean {
  return TRANSICIONES_ALERTA[actual].includes(nuevo);
}

export function esEstadoTerminal(estado: EstadoAlerta): boolean {
  return TRANSICIONES_ALERTA[estado].length === 0;
}

/**
 * Nombre legible de cada estado. El valor del enum ('EN_REVISION') no se muestra
 * nunca a una persona: los mensajes de error que ve el analista usan esto.
 */
export const ETIQUETAS_ESTADO_ALERTA: Record<EstadoAlerta, string> = {
  NUEVA: 'Nueva',
  EN_REVISION: 'En revision',
  DERIVADA: 'Derivada',
  CERRADA: 'Cerrada',
  DESCARTADA: 'Descartada',
};

export function etiquetaEstado(estado: EstadoAlerta): string {
  return ETIQUETAS_ESTADO_ALERTA[estado];
}
