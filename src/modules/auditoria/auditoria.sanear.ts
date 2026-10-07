/**
 * Saneado de lo que la bitacora guarda en `datosPrevios`, `datosNuevos` y
 * `metadatos`. Modulo **puro**: no importa Prisma ni nada con estado, igual que
 * `criticidad.engine.ts` frente a su service. Esa separacion no es cosmetica —
 * es lo que permite testearlo (`auditoria.sanear.test.ts`), y esta es justo la
 * pieza que no se puede dejar sin test: decide si un hash de contrasena termina
 * o no dentro de una tabla que puede leer cualquiera con `auditoria.ver`.
 */

/**
 * Claves cuyo VALOR no se guarda nunca, en ningun nivel de anidamiento. Un log de
 * auditoria que copia el hash de una contrasena o el secreto HMAC de un webhook
 * es una filtracion con otro nombre: `auditoria.ver` es un permiso de LECTURA y
 * por eso se reparte con mas soltura que `usuario.editar`.
 *
 * Es una lista por nombre EXACTO (en minusculas) y no por subcadena a proposito:
 * "codigo" tiene que tapar el OTP, pero `codigoPublico` es el identificador que el
 * ciudadano ve en su reporte y taparlo haria la bitacora inutil para rastrear un
 * envio.
 */
const CLAVES_SENSIBLES = new Set([
  'contrasena',
  'contrasenaactual',
  'nuevacontrasena',
  'hashcontrasena',
  'password',
  'codigo',
  'token',
  'accesstoken',
  'refreshtoken',
  'pretoken',
  'preauthtoken',
  'tokenhash',
  'secreto',
  'secretofirma',
  'smtpcontrasena',
  'smtpsecreto',
  'authorization',
  'apikey',
  'turnstiletoken',
  // Valor de una `CabeceraWebhook`: es donde vive el "Authorization: Bearer ..."
  // que el panel guarda cifrado y la API nunca devuelve.
  'valor',
]);

export const MARCA_OCULTO = '[oculto]';

/** Tope de anidamiento. Corta ciclos y estructuras absurdamente profundas. */
const PROFUNDIDAD_MAX = 6;

/** Tope de elementos de un array, para que un payload enorme no ocupe la fila entera. */
const ELEMENTOS_MAX = 50;

/** Tope del JSON guardado. Un `reemplazarContenido` de encuesta con 40 preguntas no entra. */
export const LARGO_MAX_JSON = 20_000;

function esSensible(clave: string): boolean {
  const normalizada = clave.toLowerCase();
  return (
    CLAVES_SENSIBLES.has(normalizada) ||
    normalizada.endsWith('contrasena') ||
    normalizada.endsWith('secreto')
  );
}

/**
 * Tapa los campos sensibles, convierte lo que Prisma devuelve y `JSON` no sabe
 * serializar (`Decimal`, `BigInt`, `Date`) y recorta lo que sea demasiado grande.
 *
 * Lo de la conversion no es un detalle: `JSON.stringify` **tira** `TypeError` con
 * un `BigInt` (el `telegramChatId`) y deja un objeto ilegible con un `Decimal`
 * (la `criticidad`). Sin esto, el INSERT de auditoria falla y, como el registro
 * nunca propaga errores, la entrada se perderia en silencio.
 */
export function sanear(valor: unknown, profundidad = 0): unknown {
  if (valor === null || valor === undefined) {
    return null;
  }

  if (valor instanceof Date) {
    return valor.toISOString();
  }

  if (typeof valor === 'bigint') {
    return valor.toString();
  }

  // `Decimal` de Prisma, detectado por forma y no por `instanceof`: este modulo no
  // importa Prisma, que es lo que lo mantiene testeable.
  if (typeof valor === 'object' && valor !== null && 'toFixed' in valor && typeof valor.toFixed === 'function') {
    return Number(valor.toString());
  }

  if (typeof valor !== 'object') {
    return valor;
  }

  if (profundidad >= PROFUNDIDAD_MAX) {
    return '[demasiado anidado]';
  }

  if (Array.isArray(valor)) {
    const recortado = valor.slice(0, ELEMENTOS_MAX).map((item) => sanear(item, profundidad + 1));
    return valor.length > ELEMENTOS_MAX
      ? [...recortado, `[+${valor.length - ELEMENTOS_MAX} elementos omitidos]`]
      : recortado;
  }

  const salida: Record<string, unknown> = {};
  for (const [clave, item] of Object.entries(valor as Record<string, unknown>)) {
    salida[clave] = esSensible(clave) ? MARCA_OCULTO : sanear(item, profundidad + 1);
  }
  return salida;
}

/**
 * Sanea y, si el resultado no entra en la fila, lo reemplaza por un aviso en vez
 * de perder la entrada entera. `undefined` significa "no guardar esta columna".
 */
export function saneadoParaJson(valor: unknown): unknown {
  if (valor === null || valor === undefined) {
    return undefined;
  }

  const saneado = sanear(valor);
  const serializado = JSON.stringify(saneado);

  if (serializado && serializado.length > LARGO_MAX_JSON) {
    return { omitido: `El detalle supera ${LARGO_MAX_JSON} caracteres y no se guardo.` };
  }

  return saneado;
}

/**
 * Deja el telefono identificable sin guardarlo entero: `+595971123456` queda
 * `+5959****3456`. La bitacora la lee quien tiene `auditoria.ver`, que no es el
 * mismo permiso que habilita ver PII del ciudadano en el panel de reportes
 * (`usuario_ciudadano.ver`).
 */
export function enmascararTelefono(telefono: string | null | undefined): string | null {
  if (!telefono) {
    return null;
  }
  const limpio = telefono.trim();
  if (limpio.length <= 8) {
    return '***';
  }
  return `${limpio.slice(0, 5)}****${limpio.slice(-4)}`;
}
