/**
 * Catalogo de permisos que consume la autorizacion server-side
 * (`requirePermiso`). Los nombres DEBEN coincidir con los que siembran
 * `prisma/seed.ts` y `prisma/seed-roles-permisos.ts`, que leen las dos listas de
 * `prisma/permisos-catalogo.js`: el producto cartesiano `<recurso>.<accion>`
 * (ver, crear, editar, eliminar), que va entero al rol ADMIN, y los permisos
 * EXTRA cuya accion no es CRUD (hoy `alerta.seguimiento`). Estos valores viajan
 * en el `permisos` del access token. Si un permiso aca no existe en el seed,
 * `requirePermiso` dara 403 aunque el rol "deberia" tenerlo; `permissions.test.ts`
 * verifica que no pase.
 */
export const PERMISOS = {
  USUARIOS_VER: 'usuario.ver',
  USUARIOS_CREAR: 'usuario.crear',
  USUARIOS_EDITAR: 'usuario.editar',
  USUARIOS_ELIMINAR: 'usuario.eliminar',

  ROLES_VER: 'rol.ver',
  ROLES_CREAR: 'rol.crear',
  ROLES_EDITAR: 'rol.editar',
  ROLES_ELIMINAR: 'rol.eliminar',

  PERMISOS_VER: 'permiso.ver',

  REPORTES_VER: 'reporte.ver',
  EVALUACIONES_VER: 'evaluacion_ia.ver',
  // PII del ciudadano (telefono). Lo tiene ADMIN; ORGANISMO no.
  USUARIOS_CIUDADANOS_VER: 'usuario_ciudadano.ver',

  ENCUESTAS_VER: 'encuesta.ver',
  ENCUESTAS_CREAR: 'encuesta.crear',
  ENCUESTAS_EDITAR: 'encuesta.editar',
  ENCUESTAS_ELIMINAR: 'encuesta.eliminar',

  PREGUNTAS_CREAR: 'pregunta.crear',
  PREGUNTAS_EDITAR: 'pregunta.editar',
  PREGUNTAS_ELIMINAR: 'pregunta.eliminar',

  ALERTAS_VER: 'alerta.ver',
  ALERTAS_EDITAR: 'alerta.editar',
  /**
   * Operar el seguimiento de una alerta: comentar, adjuntar archivos y
   * crear/editar las tareas de su checklist. Lo tienen ADMIN y ORGANISMO.
   * LEER el seguimiento alcanza con `alerta.ver`; mover la alerta de ESTADO
   * sigue siendo `alerta.editar` (solo ADMIN). No sale del cartesiano del seed:
   * es un permiso extra explicito de `prisma/permisos-catalogo.js`.
   */
  ALERTAS_SEGUIMIENTO: 'alerta.seguimiento',

  PUNTOS_CRITICOS_VER: 'punto_critico.ver',

  // Mapa de riesgo (fuente de F5). Separado de `configuracion_criticidad`: dibujar
  // zonas en el mapa es trabajo de campo del analista, no tocar el motor.
  ZONAS_RIESGO_VER: 'zona_riesgo.ver',
  ZONAS_RIESGO_CREAR: 'zona_riesgo.crear',
  ZONAS_RIESGO_EDITAR: 'zona_riesgo.editar',
  ZONAS_RIESGO_ELIMINAR: 'zona_riesgo.eliminar',

  CONFIGURACION_VER: 'configuracion_criticidad.ver',
  CONFIGURACION_EDITAR: 'configuracion_criticidad.editar',

  // Estado operativo + canales de salida (tab Sistema). Deliberadamente SEPARADO
  // de `configuracion_criticidad`: tocar el motor de riesgo y tocar la credencial
  // del servidor de correo no son la misma responsabilidad.
  CONFIGURACION_SISTEMA_VER: 'configuracion_sistema.ver',
  CONFIGURACION_SISTEMA_EDITAR: 'configuracion_sistema.editar',

  // Reglas de notificacion (pantalla Webhooks). Recurso propio: define a QUIEN se
  // le avisa de que, que es una decision operativa distinta de la infraestructura.
  WEBHOOKS_VER: 'webhook.ver',
  WEBHOOKS_CREAR: 'webhook.crear',
  WEBHOOKS_EDITAR: 'webhook.editar',
  WEBHOOKS_ELIMINAR: 'webhook.eliminar',

  /**
   * Leer la bitacora de auditoria. Unico permiso del recurso: el log no se crea,
   * no se edita y no se borra desde la aplicacion (ver `PERMISOS_EXTRA` en
   * `prisma/permisos-catalogo.js`). Lo tiene ADMIN; ORGANISMO no, porque la
   * bitacora muestra la actividad de todos los usuarios del panel.
   */
  AUDITORIA_VER: 'auditoria.ver',
} as const;

export type Permiso = (typeof PERMISOS)[keyof typeof PERMISOS];
