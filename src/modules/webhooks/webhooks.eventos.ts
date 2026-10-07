import { AccionWebhook, EstadoAlerta, EventoWebhook } from '@prisma/client';

/**
 * CATALOGO: la fuente de verdad de que se puede configurar en una regla.
 *
 * OJO: `label` y `descripcion` se muestran TAL CUAL en el panel. Son textos para
 * una persona que configura avisos, no para quien programa: sin nombres de
 * archivos, sin enums crudos, sin referencias a la ERS.
 *
 * Es el archivo que hace que la pantalla de Webhooks sea dinamica de verdad. El
 * frontend NO tiene cableado que campos mostrar para cada evento: pide este
 * catalogo (`GET /admin/webhooks/eventos`) y arma el formulario con lo que
 * recibe. Agregar un evento nuevo = agregar una entrada aca + emitirlo desde el
 * service correspondiente; el panel lo ofrece solo, sin tocar codigo Angular.
 *
 * Tambien es lo que valida `webhooks.validation.ts`: que condiciones acepta cada
 * evento y que campos exige cada accion salen de aca, no de una lista repetida.
 */

/** Condiciones que una regla puede imponer antes de disparar. */
export type CondicionWebhook = 'nivelMinimo' | 'estadosDestino';

/** Campos que una accion necesita para poder ejecutarse. */
export type CampoAccion =
  | 'destinatarios'
  | 'asunto'
  | 'cuerpoCorreo'
  | 'url'
  | 'secretoFirma'
  | 'cuerpoHttp'
  | 'cabeceras';

export interface VariablePlantilla {
  clave: string;
  descripcion: string;
  ejemplo: string;
}

export interface DefinicionEvento {
  valor: EventoWebhook;
  label: string;
  descripcion: string;
  condiciones: CondicionWebhook[];
  variables: VariablePlantilla[];
}

export interface DefinicionAccion {
  valor: AccionWebhook;
  label: string;
  descripcion: string;
  campos: CampoAccion[];
}

/** Variables presentes en TODOS los eventos. */
const VARIABLES_COMUNES: VariablePlantilla[] = [
  { clave: 'evento', descripcion: 'Que fue lo que paso', ejemplo: 'Alerta creada' },
  { clave: 'fecha', descripcion: 'Fecha y hora del evento', ejemplo: '01/10/2026 14:32' },
  { clave: 'regla', descripcion: 'Nombre de la regla que se disparo', ejemplo: 'Alerta critica a guardia' },
];

const VARIABLES_ALERTA: VariablePlantilla[] = [
  { clave: 'alertaId', descripcion: 'Numero de la alerta', ejemplo: '42' },
  { clave: 'nivel', descripcion: 'Nivel de la alerta (0 a 3)', ejemplo: '3' },
  { clave: 'nivelEtiqueta', descripcion: 'Nivel en palabras', ejemplo: 'Alto' },
  { clave: 'motivo', descripcion: 'Motivo con el que se genero', ejemplo: 'Reporte AG-000123 alcanzo Nivel 3.' },
  { clave: 'estado', descripcion: 'Estado actual de la alerta', ejemplo: 'Nueva' },
  { clave: 'origen', descripcion: 'Si viene de un reporte suelto o de un punto critico', ejemplo: 'Reporte' },
  { clave: 'ubicacion', descripcion: 'Direccion aproximada, si se pudo determinar', ejemplo: 'Barrio San Jorge, Asuncion' },
  { clave: 'coordenadas', descripcion: 'Latitud y longitud', ejemplo: '-25.2867, -57.3333' },
];

export const EVENTOS: DefinicionEvento[] = [
  {
    valor: EventoWebhook.ALERTA_CREADA,
    label: 'Alerta creada',
    descripcion:
      'Se genero una alerta nueva: un reporte alcanzo Nivel 2 o mas, o se consolido un punto critico.',
    condiciones: ['nivelMinimo'],
    variables: [...VARIABLES_COMUNES, ...VARIABLES_ALERTA],
  },
  {
    valor: EventoWebhook.ALERTA_ESCALADA,
    label: 'Alerta escalada de nivel',
    descripcion:
      'Una alerta que ya estaba activa subio de nivel porque entraron mas reportes cerca. Es el momento en que la situacion empeora.',
    condiciones: ['nivelMinimo'],
    variables: [
      ...VARIABLES_COMUNES,
      ...VARIABLES_ALERTA,
      { clave: 'nivelAnterior', descripcion: 'Nivel que tenia antes de escalar', ejemplo: '2' },
    ],
  },
  {
    valor: EventoWebhook.ALERTA_ESTADO_CAMBIADO,
    label: 'Alerta cambio de estado',
    descripcion:
      'Un analista movio la alerta de estado: la puso en revision, la derivo, la cerro o la descarto.',
    condiciones: ['estadosDestino'],
    variables: [
      ...VARIABLES_COMUNES,
      ...VARIABLES_ALERTA,
      { clave: 'estadoAnterior', descripcion: 'Estado del que venia', ejemplo: 'Nueva' },
      { clave: 'estadoNuevo', descripcion: 'Estado al que paso', ejemplo: 'Derivada' },
      { clave: 'observacion', descripcion: 'Observacion que escribio el analista', ejemplo: 'Derivada a ESSAP.' },
      { clave: 'analista', descripcion: 'Quien hizo el cambio', ejemplo: 'Ana Gimenez' },
    ],
  },
  {
    valor: EventoWebhook.PUNTO_CRITICO_CONSOLIDADO,
    label: 'Punto critico consolidado',
    descripcion:
      'Varios reportes cercanos en el tiempo y en el espacio formaron un punto critico, o hicieron subir uno que ya existia.',
    condiciones: ['nivelMinimo'],
    variables: [
      ...VARIABLES_COMUNES,
      { clave: 'puntoCriticoId', descripcion: 'Numero del punto critico', ejemplo: '7' },
      { clave: 'nivel', descripcion: 'Nivel del punto critico', ejemplo: '3' },
      { clave: 'nivelEtiqueta', descripcion: 'Nivel en palabras', ejemplo: 'Alto' },
      { clave: 'cantidadReportes', descripcion: 'Reportes que lo formaron', ejemplo: '5' },
      { clave: 'radioMetros', descripcion: 'Distancia dentro de la que se agruparon los reportes', ejemplo: '500' },
      { clave: 'coordenadas', descripcion: 'Centro del punto critico', ejemplo: '-25.2867, -57.3333' },
    ],
  },
];

export const ACCIONES: DefinicionAccion[] = [
  {
    valor: AccionWebhook.CORREO,
    label: 'Enviar un correo',
    descripcion:
      'Manda un correo a las personas que indiques. Hace falta que el envio de correos este habilitado en Configuracion > Sistema.',
    campos: ['destinatarios', 'asunto', 'cuerpoCorreo'],
  },
  {
    valor: AccionWebhook.HTTP,
    label: 'Avisar a otro sistema',
    descripcion:
      'Avisa automaticamente a otra aplicacion (Slack, Teams o un sistema propio) enviandole los datos del evento. Hace falta la direccion web que te haya dado ese sistema.',
    campos: ['url', 'cuerpoHttp', 'cabeceras', 'secretoFirma'],
  },
];

/** Estados destino ofrecibles para `ALERTA_ESTADO_CAMBIADO`. */
export const ESTADOS_ALERTA: EstadoAlerta[] = [
  EstadoAlerta.NUEVA,
  EstadoAlerta.EN_REVISION,
  EstadoAlerta.DERIVADA,
  EstadoAlerta.CERRADA,
  EstadoAlerta.DESCARTADA,
];

export function definicionEvento(evento: EventoWebhook): DefinicionEvento {
  const definicion = EVENTOS.find((candidato) => candidato.valor === evento);
  if (!definicion) {
    // Solo pasa si se agrego un valor al enum de Prisma y se olvido el catalogo.
    throw new Error(`Evento sin definicion en el catalogo: ${evento}`);
  }
  return definicion;
}

export function definicionAccion(accion: AccionWebhook): DefinicionAccion {
  const definicion = ACCIONES.find((candidato) => candidato.valor === accion);
  if (!definicion) {
    throw new Error(`Accion sin definicion en el catalogo: ${accion}`);
  }
  return definicion;
}

/** `true` si ese evento admite esa condicion (lo usa zod y el panel). */
export function admiteCondicion(evento: EventoWebhook, condicion: CondicionWebhook): boolean {
  return definicionEvento(evento).condiciones.includes(condicion);
}

/** Etiquetas de nivel (RNF-14): describen PRIORIDAD de atencion, no el estado del agua. */
export const ETIQUETAS_NIVEL: Record<number, string> = {
  0: 'Informativo',
  1: 'Bajo',
  2: 'Medio',
  3: 'Alto',
};
