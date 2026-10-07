import { OperacionAuditoria } from '@prisma/client';

/**
 * Catalogo de acciones auditables. Es la fuente de verdad de QUE se audita y la
 * unica cosa que hay que tocar para sumar una accion nueva.
 *
 * Vive en codigo y no en un enum de Prisma (como si pasa con `EventoWebhook`) por
 * una razon concreta: sumar una accion auditable es algo que va a pasar cada vez
 * que se agregue un endpoint de escritura, y encadenar eso a una migracion de
 * base garantiza que alguien, alguna vez, no la haga y deje la accion sin
 * registrar. `AuditoriaLog.accion` es texto; este objeto es el contrato.
 *
 * El front **no** conoce esta lista: la pide por `GET /admin/auditoria/acciones`
 * para armar el filtro, igual que hace con el catalogo de eventos de webhooks.
 *
 * ## Que NO se audita (decidido, no olvidado)
 * Hay escrituras que se dejan afuera a proposito porque son ruido puro y
 * taparian lo que importa:
 *   - `GeocodificacionCache` — cache de un servicio externo, no dato de dominio.
 *   - `TelegramUpdateProcesado` / `TelegramConversacion` — estado efimero de una
 *     conversacion del bot. Lo que importa de ese flujo es el reporte que sale,
 *     y eso se audita como `reporte.crear` con canal TELEGRAM.
 *   - Rotacion de `RefreshToken` — ocurre cada pocos minutos por usuario
 *     conectado. Si se auditara, el log seria 95% refresh. Si se audita el
 *     RECHAZO de un refresh (`sesion.refresh_rechazado`), que es la senal de
 *     seguridad: un token revocado que alguien intenta reusar.
 *   - `DobleFactor` / `ValidacionSms` como filas — lo que se audita es el intento
 *     de login y de verificacion OTP, no el alta del codigo.
 *   - `EntregaWebhook` — ya ES una bitacora, con su propia pantalla y su propio
 *     detalle (la carga util exacta que se envio). Copiarla aca seria tener el
 *     mismo hecho en dos tablas que pueden discrepar. Lo que si se audita del
 *     modulo es quien CONFIGURO la regla y quien la probo a mano.
 */

/** Grupos del catalogo. Ordenan el filtro del panel. */
export const GRUPOS_ACCION = [
  'Sesion y acceso',
  'Usuarios y roles',
  'Encuestas',
  'Reportes ciudadanos',
  'Alertas',
  'Seguimiento de alertas',
  'Mapa de riesgo',
  'Configuracion',
  'Notificaciones',
  'Procesos automaticos',
] as const;

export type GrupoAccion = (typeof GRUPOS_ACCION)[number];

export interface DefinicionAccion {
  /** `<recurso>.<accion>`. Lo que se guarda en `AuditoriaLog.accion`. */
  accion: string;
  operacion: OperacionAuditoria;
  /** Modelo Prisma afectado. Texto: `AuditoriaLog` no tiene FK a la entidad. */
  entidad: string;
  /** Lo que lee la persona en el panel. Sin jerga tecnica. */
  etiqueta: string;
  grupo: GrupoAccion;
}

/**
 * Las acciones, por clave. La clave es lo que usan los services
 * (`registrarAuditoria({ accion: 'USUARIO_CREAR', ... })`), asi que un typo no
 * compila.
 */
export const ACCIONES = {
  // --- Sesion y acceso ---
  SESION_LOGIN: {
    accion: 'sesion.login',
    operacion: 'ACCESO',
    entidad: 'Usuario',
    etiqueta: 'Inicio de sesion',
    grupo: 'Sesion y acceso',
  },
  SESION_DOBLE_FACTOR: {
    accion: 'sesion.doble_factor',
    operacion: 'ACCESO',
    entidad: 'Usuario',
    etiqueta: 'Verificacion en dos pasos',
    grupo: 'Sesion y acceso',
  },
  SESION_CIERRE: {
    accion: 'sesion.cierre',
    operacion: 'ACCESO',
    entidad: 'Usuario',
    etiqueta: 'Cierre de sesion',
    grupo: 'Sesion y acceso',
  },
  SESION_REFRESH_RECHAZADO: {
    accion: 'sesion.refresh_rechazado',
    operacion: 'ACCESO',
    entidad: 'RefreshToken',
    etiqueta: 'Renovacion de sesion rechazada',
    grupo: 'Sesion y acceso',
  },
  CIUDADANO_OTP_SOLICITAR: {
    accion: 'ciudadano.otp_solicitar',
    operacion: 'ACCESO',
    entidad: 'ValidacionSms',
    etiqueta: 'Pedido de codigo por SMS',
    grupo: 'Sesion y acceso',
  },
  CIUDADANO_OTP_VERIFICAR: {
    accion: 'ciudadano.otp_verificar',
    operacion: 'ACCESO',
    entidad: 'ValidacionSms',
    etiqueta: 'Verificacion de codigo por SMS',
    grupo: 'Sesion y acceso',
  },

  // --- Usuarios y roles ---
  USUARIO_CREAR: {
    accion: 'usuario.crear',
    operacion: 'CREAR',
    entidad: 'Usuario',
    etiqueta: 'Alta de usuario',
    grupo: 'Usuarios y roles',
  },
  USUARIO_EDITAR: {
    accion: 'usuario.editar',
    operacion: 'ACTUALIZAR',
    entidad: 'Usuario',
    etiqueta: 'Edicion de usuario',
    grupo: 'Usuarios y roles',
  },
  USUARIO_ELIMINAR: {
    accion: 'usuario.eliminar',
    operacion: 'ELIMINAR',
    entidad: 'Usuario',
    etiqueta: 'Baja de usuario',
    grupo: 'Usuarios y roles',
  },
  ROL_CREAR: {
    accion: 'rol.crear',
    operacion: 'CREAR',
    entidad: 'Rol',
    etiqueta: 'Alta de rol',
    grupo: 'Usuarios y roles',
  },
  ROL_EDITAR: {
    accion: 'rol.editar',
    operacion: 'ACTUALIZAR',
    entidad: 'Rol',
    etiqueta: 'Edicion de rol',
    grupo: 'Usuarios y roles',
  },
  ROL_ELIMINAR: {
    accion: 'rol.eliminar',
    operacion: 'ELIMINAR',
    entidad: 'Rol',
    etiqueta: 'Baja de rol',
    grupo: 'Usuarios y roles',
  },

  // --- Encuestas ---
  ENCUESTA_CREAR: {
    accion: 'encuesta.crear',
    operacion: 'CREAR',
    entidad: 'Encuesta',
    etiqueta: 'Alta de encuesta',
    grupo: 'Encuestas',
  },
  ENCUESTA_VERSION_CREAR: {
    accion: 'encuesta.version_crear',
    operacion: 'CREAR',
    entidad: 'Encuesta',
    etiqueta: 'Nueva version de encuesta',
    grupo: 'Encuestas',
  },
  ENCUESTA_EDITAR: {
    accion: 'encuesta.editar',
    operacion: 'ACTUALIZAR',
    entidad: 'Encuesta',
    etiqueta: 'Edicion de encuesta',
    grupo: 'Encuestas',
  },
  ENCUESTA_CONTENIDO_REEMPLAZAR: {
    accion: 'encuesta.contenido_reemplazar',
    operacion: 'ACTUALIZAR',
    entidad: 'Encuesta',
    etiqueta: 'Reemplazo de preguntas de la encuesta',
    grupo: 'Encuestas',
  },
  ENCUESTA_ELIMINAR: {
    accion: 'encuesta.eliminar',
    operacion: 'ELIMINAR',
    entidad: 'Encuesta',
    etiqueta: 'Baja de encuesta',
    grupo: 'Encuestas',
  },
  PREGUNTA_CREAR: {
    accion: 'pregunta.crear',
    operacion: 'CREAR',
    entidad: 'Pregunta',
    etiqueta: 'Alta de pregunta',
    grupo: 'Encuestas',
  },
  PREGUNTA_EDITAR: {
    accion: 'pregunta.editar',
    operacion: 'ACTUALIZAR',
    entidad: 'Pregunta',
    etiqueta: 'Edicion de pregunta',
    grupo: 'Encuestas',
  },
  PREGUNTA_ELIMINAR: {
    accion: 'pregunta.eliminar',
    operacion: 'ELIMINAR',
    entidad: 'Pregunta',
    etiqueta: 'Baja de pregunta',
    grupo: 'Encuestas',
  },

  // --- Reportes ciudadanos ---
  REPORTE_CREAR: {
    accion: 'reporte.crear',
    operacion: 'CREAR',
    entidad: 'Reporte',
    etiqueta: 'Envio de reporte ciudadano',
    grupo: 'Reportes ciudadanos',
  },

  // --- Alertas ---
  ALERTA_CREAR: {
    accion: 'alerta.crear',
    operacion: 'CREAR',
    entidad: 'Alerta',
    etiqueta: 'Generacion de alerta',
    grupo: 'Alertas',
  },
  ALERTA_ESCALAR: {
    accion: 'alerta.escalar',
    operacion: 'ACTUALIZAR',
    entidad: 'Alerta',
    etiqueta: 'Escalamiento de alerta',
    grupo: 'Alertas',
  },
  ALERTA_ESTADO_CAMBIAR: {
    accion: 'alerta.estado_cambiar',
    operacion: 'ACTUALIZAR',
    entidad: 'Alerta',
    etiqueta: 'Cambio de estado de alerta',
    grupo: 'Alertas',
  },

  // --- Seguimiento de alertas ---
  ALERTA_COMENTARIO_CREAR: {
    accion: 'alerta.comentario_crear',
    operacion: 'CREAR',
    entidad: 'ComentarioAlerta',
    etiqueta: 'Comentario en alerta',
    grupo: 'Seguimiento de alertas',
  },
  ALERTA_ADJUNTO_SUBIR: {
    accion: 'alerta.adjunto_subir',
    operacion: 'CREAR',
    entidad: 'AdjuntoAlerta',
    etiqueta: 'Carga de archivo en alerta',
    grupo: 'Seguimiento de alertas',
  },
  /**
   * No escribe nada, pero se audita igual: es la descarga de un documento interno
   * del organismo (un acta de inspeccion), y saber quien se lo llevo es
   * justamente para lo que sirve una auditoria.
   */
  ALERTA_ADJUNTO_DESCARGAR: {
    accion: 'alerta.adjunto_descargar',
    operacion: 'ACCESO',
    entidad: 'AdjuntoAlerta',
    etiqueta: 'Descarga de archivo de alerta',
    grupo: 'Seguimiento de alertas',
  },
  ALERTA_ADJUNTO_ELIMINAR: {
    accion: 'alerta.adjunto_eliminar',
    operacion: 'ELIMINAR',
    entidad: 'AdjuntoAlerta',
    etiqueta: 'Baja de archivo de alerta',
    grupo: 'Seguimiento de alertas',
  },
  ALERTA_TAREA_CREAR: {
    accion: 'alerta.tarea_crear',
    operacion: 'CREAR',
    entidad: 'TareaAlerta',
    etiqueta: 'Alta de tarea de alerta',
    grupo: 'Seguimiento de alertas',
  },
  ALERTA_TAREA_EDITAR: {
    accion: 'alerta.tarea_editar',
    operacion: 'ACTUALIZAR',
    entidad: 'TareaAlerta',
    etiqueta: 'Edicion de tarea de alerta',
    grupo: 'Seguimiento de alertas',
  },
  ALERTA_TAREA_ELIMINAR: {
    accion: 'alerta.tarea_eliminar',
    operacion: 'ELIMINAR',
    entidad: 'TareaAlerta',
    etiqueta: 'Baja de tarea de alerta',
    grupo: 'Seguimiento de alertas',
  },

  // --- Mapa de riesgo ---
  ZONA_RIESGO_CREAR: {
    accion: 'zona_riesgo.crear',
    operacion: 'CREAR',
    entidad: 'ZonaRiesgo',
    etiqueta: 'Alta de zona de riesgo',
    grupo: 'Mapa de riesgo',
  },
  ZONA_RIESGO_EDITAR: {
    accion: 'zona_riesgo.editar',
    operacion: 'ACTUALIZAR',
    entidad: 'ZonaRiesgo',
    etiqueta: 'Edicion de zona de riesgo',
    grupo: 'Mapa de riesgo',
  },
  ZONA_RIESGO_ELIMINAR: {
    accion: 'zona_riesgo.eliminar',
    operacion: 'ELIMINAR',
    entidad: 'ZonaRiesgo',
    etiqueta: 'Baja de zona de riesgo',
    grupo: 'Mapa de riesgo',
  },

  // --- Configuracion ---
  CONFIGURACION_CRITICIDAD_VERSION_CREAR: {
    accion: 'configuracion_criticidad.version_crear',
    operacion: 'CREAR',
    entidad: 'ConfiguracionCriticidad',
    etiqueta: 'Nueva version de los parametros de criticidad',
    grupo: 'Configuracion',
  },
  CONFIGURACION_SISTEMA_EDITAR: {
    accion: 'configuracion_sistema.editar',
    operacion: 'ACTUALIZAR',
    entidad: 'ConfiguracionNotificacion',
    etiqueta: 'Edicion del envio de correos',
    grupo: 'Configuracion',
  },
  CONFIGURACION_SISTEMA_CORREO_PRUEBA: {
    accion: 'configuracion_sistema.correo_prueba',
    operacion: 'ACCESO',
    entidad: 'ConfiguracionNotificacion',
    etiqueta: 'Envio de correo de prueba',
    grupo: 'Configuracion',
  },

  // --- Notificaciones (reglas de webhook) ---
  WEBHOOK_CREAR: {
    accion: 'webhook.crear',
    operacion: 'CREAR',
    entidad: 'ReglaWebhook',
    etiqueta: 'Alta de regla de notificacion',
    grupo: 'Notificaciones',
  },
  WEBHOOK_EDITAR: {
    accion: 'webhook.editar',
    operacion: 'ACTUALIZAR',
    entidad: 'ReglaWebhook',
    etiqueta: 'Edicion de regla de notificacion',
    grupo: 'Notificaciones',
  },
  WEBHOOK_ELIMINAR: {
    accion: 'webhook.eliminar',
    operacion: 'ELIMINAR',
    entidad: 'ReglaWebhook',
    etiqueta: 'Baja de regla de notificacion',
    grupo: 'Notificaciones',
  },
  WEBHOOK_PRUEBA: {
    accion: 'webhook.prueba',
    operacion: 'ACCESO',
    entidad: 'ReglaWebhook',
    etiqueta: 'Prueba de regla de notificacion',
    grupo: 'Notificaciones',
  },
  WEBHOOK_REMITENTE_EDITAR: {
    accion: 'webhook.remitente_editar',
    operacion: 'ACTUALIZAR',
    entidad: 'ConfiguracionNotificacion',
    etiqueta: 'Edicion del remitente de los avisos',
    grupo: 'Notificaciones',
  },

  // --- Procesos automaticos (actor SISTEMA) ---
  EVALUACION_IA_COMPLETAR: {
    accion: 'evaluacion_ia.completar',
    operacion: 'ACTUALIZAR',
    entidad: 'EvaluacionIa',
    etiqueta: 'Analisis de IA completado',
    grupo: 'Procesos automaticos',
  },
  EVALUACION_IA_ERROR: {
    accion: 'evaluacion_ia.error',
    operacion: 'ACTUALIZAR',
    entidad: 'EvaluacionIa',
    etiqueta: 'Analisis de IA con error',
    grupo: 'Procesos automaticos',
  },
  CRITICIDAD_RECALCULAR: {
    accion: 'reporte.criticidad_recalcular',
    operacion: 'ACTUALIZAR',
    entidad: 'Reporte',
    etiqueta: 'Recalculo de criticidad',
    grupo: 'Procesos automaticos',
  },
  PUNTO_CRITICO_CONSOLIDAR: {
    accion: 'punto_critico.consolidar',
    operacion: 'CREAR',
    entidad: 'PuntoCritico',
    etiqueta: 'Consolidacion de punto critico',
    grupo: 'Procesos automaticos',
  },
  TELEGRAM_LIMPIEZA: {
    accion: 'telegram.limpieza',
    operacion: 'ELIMINAR',
    entidad: 'TelegramConversacion',
    etiqueta: 'Limpieza de conversaciones del bot',
    grupo: 'Procesos automaticos',
  },
} as const satisfies Record<string, DefinicionAccion>;

export type ClaveAccion = keyof typeof ACCIONES;

/** Definicion de una accion por su clave. */
export function definicionAccion(clave: ClaveAccion): DefinicionAccion {
  return ACCIONES[clave];
}

/** Todos los nombres de accion validos (para el `enum` del filtro de la API). */
export const NOMBRES_ACCION: string[] = Object.values(ACCIONES).map((definicion) => definicion.accion);

/** Todas las entidades auditables, sin repetir (para el filtro por entidad). */
export const ENTIDADES_AUDITABLES: string[] = [
  ...new Set(Object.values(ACCIONES).map((definicion) => definicion.entidad)),
].sort();
