import { Prisma } from '@prisma/client';

/**
 * Autor de la version. Se muestra en el historial del panel para saber quien
 * cambio los parametros del motor (auditoria ERS §4.1).
 */
export const INCLUDE_AUTOR = {
  usuarioCreacion: {
    select: {
      id: true,
      correoElectronico: true,
      persona: { select: { nombres: true, apellidos: true } },
    },
  },
} as const;

export type ConfiguracionConAutor = Prisma.ConfiguracionCriticidadGetPayload<{
  include: typeof INCLUDE_AUTOR;
}>;

export interface AutorDTO {
  id: number;
  nombreCompleto: string;
  correoElectronico: string;
}

export interface ConfiguracionDTO {
  id: number;
  version: number;
  pesos: Prisma.JsonValue;
  puntajes: Prisma.JsonValue;
  umbralesNivel: Prisma.JsonValue;
  radioMetros: number;
  ventanaDias: number;
  minReportes: number;
  limitesAntiabuso: Prisma.JsonValue;
  bonusVulnerable: number;
  activa: boolean;
  autor: AutorDTO | null;
  fechaCreacion: Date;
}

export interface ListarVersionesParams {
  page?: number;
  limit?: number;
}

export interface ResultadoPaginado<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

/**
 * Estado operativo del sistema para el tab "Sistema" del panel: SOLO LECTURA y
 * SOLO datos derivados de `config/env.ts` + DB.
 *
 * ⚠️ Nunca sumar aca `openaiApiKey`, `telegramBotToken`, `telegramWebhookSecret`,
 * `jwtSecret`, `jwtRefreshSecret`, `jwtCiudadanoSecret`, `turnstileSecret` ni
 * `databaseUrl`, tampoco enmascarados. Por eso este DTO enumera campos uno por
 * uno en vez de serializar el objeto `env`: agregar una variable de entorno
 * nueva no la filtra sola.
 */
export interface EstadoSistemaDTO {
  entorno: string;
  version: string;
  canales: {
    web: boolean;
    telegram: boolean;
    whatsapp: boolean;
  };
  ia: {
    modelo: string;
    cronExpr: string;
    batchSize: number;
    maxIntentos: number;
  };
  encuestaActiva: {
    id: number;
    version: number;
    nombre: string;
    fotosMin: number;
    fotosMax: number;
  } | null;
  configuracionActiva: {
    id: number;
    version: number;
  } | null;
}

/**
 * TRANSPORTE SMTP y nada mas (tab Configuracion > Sistema).
 *
 * A proposito NO incluye remitente ni destinatarios: esta pantalla configura
 * "con que servidor se manda", no "que se manda ni a quien". El remitente se
 * edita en la pantalla Webhooks (`/webhooks/remitente`) y los destinatarios son
 * parte de cada `ReglaWebhook`.
 *
 * ⚠️ Tampoco incluye `smtpSecreto` ni ninguna forma enmascarada de el. La
 * contrasena entra por el PUT y nunca sale: el panel solo sabe, por
 * `tieneContrasena`, si hay una guardada. Si se agrega un campo secreto al
 * modelo, NO sumarlo aca.
 */
export interface ConfiguracionNotificacionDTO {
  smtpHabilitado: boolean;
  smtpHost: string;
  smtpPuerto: number;
  smtpSeguridad: string;
  smtpUsuario: string;
  /** Hay una contrasena guardada (cifrada). El valor nunca se expone. */
  tieneContrasena: boolean;
  /**
   * `false` si falta `CONFIG_ENCRYPTION_KEY` en el backend. El panel lo usa para
   * avisar que no se puede guardar una contrasena nueva todavia.
   */
  cifradoDisponible: boolean;
  /**
   * El From con el que saldria un correo hoy, calculado (remitente configurado en
   * Webhooks, o `smtpUsuario` como fallback). Solo informativo: esta pantalla no
   * lo edita, pero el envio de prueba lo usa y conviene mostrarlo.
   */
  remitenteEfectivo: string;
  actualizadoPor: { id: number; nombreCompleto: string; correoElectronico: string } | null;
  fechaActualizacion: string | null;
}

/** Resultado de un envio de prueba (`POST .../notificaciones/pruebas`). */
export interface ResultadoPruebaCorreoDTO {
  destinatario: string;
  duracionMs: number;
}
