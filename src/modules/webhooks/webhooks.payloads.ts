import { EstadoAlerta, EventoWebhook } from '@prisma/client';
import { env } from '../../config/env';
import { ContextoEvento, etiquetaNivel } from './webhooks.despachador';

/**
 * Armado de los payloads de cada evento, en un solo lugar.
 *
 * Esta separado de los services de dominio a proposito: `alertas.service.ts` no
 * tiene por que saber como se llama cada `{{placeholder}}` ni que forma tiene el
 * JSON que espera un receptor HTTP. Los services solo dicen "paso esto, con estos
 * datos".
 *
 * ⚠️ REGLA DURA: nada de PII. Un reporte se identifica por `codigoPublico`, nunca
 * por el telefono del ciudadano ni por su id interno de `UsuarioCiudadano`. Estos
 * payloads salen del sistema hacia casillas de correo y URLs de terceros.
 */

export interface DatosAlerta {
  id: number;
  nivel: number;
  motivo: string;
  estado: EstadoAlerta;
  latitud: number;
  longitud: number;
  /** `REPORTE` o `PUNTO_CRITICO`. */
  origen: string;
  reporteCodigoPublico?: string | null;
  puntoCriticoId?: number | null;
  /** Ubicacion legible si la geocodificacion inversa la resolvio. */
  ubicacion?: string | null;
}

function base(evento: EventoWebhook): Pick<ContextoEvento, 'evento'> & {
  variables: Record<string, string>;
  cargaUtil: Record<string, unknown>;
} {
  const ahora = new Date();
  return {
    evento,
    variables: {
      evento,
      fecha: ahora.toLocaleString('es-PY'),
      regla: '',
    },
    cargaUtil: {
      evento,
      ocurridoEn: ahora.toISOString(),
      sistema: { nombre: 'AGUARD', entorno: env.nodeEnv },
    },
  };
}

function variablesAlerta(alerta: DatosAlerta): Record<string, string> {
  return {
    alertaId: String(alerta.id),
    nivel: String(alerta.nivel),
    nivelEtiqueta: etiquetaNivel(alerta.nivel),
    motivo: alerta.motivo,
    estado: alerta.estado,
    origen: alerta.origen,
    ubicacion: alerta.ubicacion || 'sin ubicacion resuelta',
    coordenadas: `${alerta.latitud.toFixed(4)}, ${alerta.longitud.toFixed(4)}`,
  };
}

export function contextoAlertaCreada(alerta: DatosAlerta): ContextoEvento {
  const b = base(EventoWebhook.ALERTA_CREADA);
  return {
    ...b,
    nivel: alerta.nivel,
    variables: { ...b.variables, ...variablesAlerta(alerta) },
    cargaUtil: { ...b.cargaUtil, alerta },
  };
}

export function contextoAlertaEscalada(alerta: DatosAlerta, nivelAnterior: number): ContextoEvento {
  const b = base(EventoWebhook.ALERTA_ESCALADA);
  return {
    ...b,
    nivel: alerta.nivel,
    variables: {
      ...b.variables,
      ...variablesAlerta(alerta),
      nivelAnterior: String(nivelAnterior),
    },
    cargaUtil: { ...b.cargaUtil, alerta: { ...alerta, nivelAnterior } },
  };
}

export function contextoAlertaEstadoCambiado(
  alerta: DatosAlerta,
  cambio: { estadoAnterior: EstadoAlerta; estadoNuevo: EstadoAlerta; observacion: string | null; analista: string },
): ContextoEvento {
  const b = base(EventoWebhook.ALERTA_ESTADO_CAMBIADO);
  return {
    ...b,
    // El nivel no se usa como condicion en este evento, pero va en las variables
    // porque el que recibe el aviso igual quiere saber de que gravedad se habla.
    estadoDestino: cambio.estadoNuevo,
    variables: {
      ...b.variables,
      ...variablesAlerta(alerta),
      estadoAnterior: cambio.estadoAnterior,
      estadoNuevo: cambio.estadoNuevo,
      observacion: cambio.observacion || 'sin observacion',
      analista: cambio.analista,
    },
    cargaUtil: { ...b.cargaUtil, alerta, cambio },
  };
}

export interface DatosPuntoCritico {
  id: number;
  nivel: number;
  cantidadReportes: number;
  radioMetros: number;
  latitudCentro: number;
  longitudCentro: number;
  ventanaInicio: Date;
  ventanaFin: Date;
}

export function contextoPuntoCritico(punto: DatosPuntoCritico): ContextoEvento {
  const b = base(EventoWebhook.PUNTO_CRITICO_CONSOLIDADO);
  return {
    ...b,
    nivel: punto.nivel,
    variables: {
      ...b.variables,
      puntoCriticoId: String(punto.id),
      nivel: String(punto.nivel),
      nivelEtiqueta: etiquetaNivel(punto.nivel),
      cantidadReportes: String(punto.cantidadReportes),
      radioMetros: String(punto.radioMetros),
      coordenadas: `${punto.latitudCentro.toFixed(4)}, ${punto.longitudCentro.toFixed(4)}`,
    },
    cargaUtil: {
      ...b.cargaUtil,
      puntoCritico: {
        ...punto,
        ventanaInicio: punto.ventanaInicio.toISOString(),
        ventanaFin: punto.ventanaFin.toISOString(),
      },
    },
  };
}
