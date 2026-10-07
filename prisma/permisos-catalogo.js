/**
 * Catalogo unico de permisos que siembran `seed.ts` y `seed-roles-permisos.ts`.
 *
 * Existe porque los dos seeds tenian su propia copia de estas listas y se
 * desincronizaron: `seed.ts` no incluia `zona_riesgo`, `configuracion_sistema`
 * ni `webhook`, asi que una DB sembrada solo con `npm run db:seed` dejaba al
 * ADMIN sin los permisos de pantallas que ya existen (403 silencioso). Una sola
 * fuente evita que vuelva a pasar; `src/shared/permissions.test.ts` lo verifica.
 *
 * Es CommonJS a proposito: los dos seeds son CJS (`require`, sin `type: module`)
 * y se corren con `--experimental-strip-types`. Un `.js` plano no depende de eso.
 */

/** Recursos con el CRUD completo (`<recurso>.ver|crear|editar|eliminar`). */
const RECURSOS_DOMINIO = [
  'persona',
  'usuario',
  'rol',
  'permiso',
  'rol_permiso',
  'usuario_rol',
  'encuesta',
  'pregunta',
  'pregunta_opcion',
  'encuesta_pregunta',
  'usuario_ciudadano',
  'respuesta',
  'respuesta_archivo',
  'evaluacion_ia',
  'reporte',
  'alerta',
  'punto_critico',
  'zona_riesgo',
  'configuracion_criticidad',
  'configuracion_sistema',
  'webhook',
];

const ACCIONES_BASE = ['ver', 'crear', 'editar', 'eliminar'];

/**
 * Permisos que NO salen del producto cartesiano, porque su accion no es parte
 * del CRUD. Van con nombre y descripcion explicitos.
 */
const PERMISOS_EXTRA = [
  {
    nombre: 'alerta.seguimiento',
    descripcion:
      'Permite comentar, adjuntar archivos y gestionar las tareas de seguimiento de una alerta.',
  },
  /**
   * La bitacora de auditoria es INMUTABLE: nadie la crea a mano, nadie la edita y
   * nadie la borra desde la aplicacion. Por eso `auditoria` no entra en
   * `RECURSOS_DOMINIO`: el cartesiano generaria `auditoria.crear|editar|eliminar`,
   * tres permisos que no corresponden a ningun endpoint y que, peor, sugieren que
   * el log se puede tocar.
   */
  {
    nombre: 'auditoria.ver',
    descripcion: 'Permite consultar la bitacora de auditoria del sistema.',
  },
];

/**
 * Permisos del rol ORGANISMO, por NOMBRE COMPLETO.
 *
 * Antes era una lista de recursos a los que se les pegaba el sufijo `.ver`, lo
 * que hacia imposible darle un permiso que no fuera de lectura. ORGANISMO es el
 * que sale a inspeccionar: lee el panel y documenta su trabajo en la alerta
 * (`alerta.seguimiento`), pero NO mueve la alerta de estado (`alerta.editar`
 * sigue siendo solo del ADMIN).
 */
const ORGANISMO_PERMISOS = [
  'reporte.ver',
  'evaluacion_ia.ver',
  'alerta.ver',
  'punto_critico.ver',
  'encuesta.ver',
  'zona_riesgo.ver',
  'alerta.seguimiento',
];

/** Todos los permisos del catalogo: cartesiano + extras. */
function permisosCatalogo() {
  const cartesiano = RECURSOS_DOMINIO.flatMap((recurso) =>
    ACCIONES_BASE.map((accion) => ({
      nombre: `${recurso}.${accion}`,
      descripcion: `Permite ${accion} registros de ${recurso}.`,
    })),
  );
  return [...cartesiano, ...PERMISOS_EXTRA];
}

module.exports = {
  RECURSOS_DOMINIO,
  ACCIONES_BASE,
  PERMISOS_EXTRA,
  ORGANISMO_PERMISOS,
  permisosCatalogo,
};
