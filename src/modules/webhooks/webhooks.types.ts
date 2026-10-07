import { AccionWebhook, EstadoAlerta, EventoWebhook, Prisma } from '@prisma/client';

export const INCLUDE_AUTORES = {
  cabeceras: { orderBy: { nombre: 'asc' } },
  usuarioCreacion: {
    select: {
      id: true,
      correoElectronico: true,
      persona: { select: { nombres: true, apellidos: true } },
    },
  },
  usuarioActualizacion: {
    select: {
      id: true,
      correoElectronico: true,
      persona: { select: { nombres: true, apellidos: true } },
    },
  },
} as const;

export type ReglaConAutores = Prisma.ReglaWebhookGetPayload<{ include: typeof INCLUDE_AUTORES }>;

export interface AutorDTO {
  id: number;
  nombreCompleto: string;
  correoElectronico: string;
}

/**
 * Una cabecera como la devuelve la API: **sin el valor**. Igual que el secreto de
 * firma, es una credencial; el panel solo sabe que existe.
 */
export interface CabeceraWebhookDTO {
  nombre: string;
  tieneValor: boolean;
}

/**
 * Una regla tal como la devuelve la API.
 *
 * ⚠️ NO incluye `secretoFirma` ni el valor de las cabeceras, ni enmascarados:
 * igual que la contrasena SMTP, entran por el POST/PUT y nunca salen. El panel
 * solo sabe, por `tieneSecretoFirma` y `cabeceras[].tieneValor`, que existen.
 */
export interface ReglaWebhookDTO {
  id: number;
  nombre: string;
  evento: EventoWebhook;
  accion: AccionWebhook;
  activa: boolean;
  nivelMinimo: number | null;
  estadosDestino: EstadoAlerta[];
  destinatarios: string[];
  asunto: string;
  /** Plantilla HTML. Vacio = cuerpo autogenerado. */
  cuerpoCorreo: string;
  url: string;
  tieneSecretoFirma: boolean;
  /** Plantilla JSON. Vacio = el payload completo de AGUARD. */
  cuerpoHttp: string;
  cabeceras: CabeceraWebhookDTO[];
  /**
   * Por que esta regla no puede ejecutarse ahora mismo (SMTP apagado, sin
   * remitente...). `null` = esta lista. Se calcula al leer, no se guarda: el panel
   * necesita avisar antes de que el evento ocurra, no despues de que fallo.
   */
  advertencia: string | null;
  /** Resultado del ultimo intento de entrega, para la columna de estado del listado. */
  ultimaEntrega: EntregaWebhookDTO | null;
  autor: AutorDTO | null;
  editor: AutorDTO | null;
  fechaCreacion: Date;
  fechaActualizacion: Date;
}

export interface EntregaWebhookDTO {
  id: number;
  evento: EventoWebhook;
  exito: boolean;
  detalle: string;
  duracionMs: number;
  cargaUtil: Prisma.JsonValue;
  esPrueba: boolean;
  fechaCreacion: Date;
}

/**
 * Identidad del remitente de los correos. Vive en la misma fila que el transporte
 * SMTP (`ConfiguracionNotificacion`) pero se edita desde aca: ver el comentario del
 * modelo en `schema.prisma`.
 */
export interface RemitenteDTO {
  remitenteNombre: string;
  remitenteCorreo: string;
  /** El From real que se usaria hoy (cae a `smtpUsuario` si no hay remitente). */
  remitenteEfectivo: string;
  /** Contexto del transporte, para poder avisar en la UI sin pedir otro endpoint. */
  smtpHabilitado: boolean;
  smtpUsuario: string;
}

export interface ListarReglasParams {
  page?: number;
  limit?: number;
  evento?: EventoWebhook;
  activa?: boolean;
}

export interface ResultadoPaginado<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}
