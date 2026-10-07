/**
 * Sustitucion de `{{variables}}` en las plantillas que escribe el ADMIN (asunto,
 * cuerpo del correo, cuerpo del POST).
 *
 * El punto de este archivo es que **el escape depende del contexto donde cae el
 * valor**, y hacerlo mal no da un error visible: da un correo con etiquetas rotas
 * o un POST con JSON invalido que el receptor rechaza. Los valores no son todos
 * "de la casa": `observacion` es texto libre que escribio un analista, y ahi puede
 * haber un `<`, un `&` o una comilla.
 *
 *   - `texto` -> sin escape (asunto, cuerpo plano).
 *   - `html`  -> escapa `& < > " '` para que el valor no cierre una etiqueta.
 *   - `json`  -> escapa comillas, backslashes y control chars, SIN agregar las
 *                comillas externas; asi `"nivel": {{nivel}}` puede quedar como
 *                numero y `"motivo": "{{motivo}}"` como string valido.
 */

export type ContextoPlantilla = 'texto' | 'html' | 'json';

const ESCAPES_HTML: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escaparHtml(valor: string): string {
  return valor.replace(/[&<>"']/g, (caracter) => ESCAPES_HTML[caracter]);
}

/**
 * Escapa para contexto de string JSON sin envolver en comillas. Se delega a
 * `JSON.stringify` (que ya resuelve bien los control chars y el unicode) y se le
 * quitan las comillas externas que agrega.
 */
function escaparJson(valor: string): string {
  const serializado = JSON.stringify(valor);
  return serializado.slice(1, -1);
}

function escapar(valor: string, contexto: ContextoPlantilla): string {
  switch (contexto) {
    case 'html':
      return escaparHtml(valor);
    case 'json':
      return escaparJson(valor);
    case 'texto':
    default:
      return valor;
  }
}

/**
 * Reemplaza `{{clave}}` por su valor escapado segun el contexto. Un placeholder
 * que no existe se deja TAL CUAL, a la vista: es mas facil de diagnosticar que un
 * hueco vacio o un "undefined".
 */
export function aplicarPlantilla(
  plantilla: string,
  variables: Record<string, string>,
  contexto: ContextoPlantilla = 'texto',
): string {
  return plantilla.replace(/\{\{\s*(\w+)\s*\}\}/g, (coincidencia, clave: string) =>
    clave in variables ? escapar(variables[clave], contexto) : coincidencia,
  );
}

/**
 * Version texto plano de un cuerpo HTML, para el campo `text` del correo.
 *
 * No es un conversor HTML->texto completo y no pretende serlo: cubre lo que genera
 * el editor del panel (parrafos, saltos, listas, enlaces, negritas). Existe porque
 * mandar `html` sin `text` hace que varios filtros de spam penalicen el mensaje y
 * que los clientes en modo texto lo muestren vacio.
 */
export function htmlATextoPlano(html: string): string {
  return (
    html
      // Los bloques se vuelven saltos de linea antes de borrar etiquetas.
      .replace(/<\s*br\s*\/?\s*>/gi, '\n')
      .replace(/<\/\s*(p|div|h[1-6]|tr)\s*>/gi, '\n\n')
      .replace(/<\s*li[^>]*>/gi, '\n• ')
      .replace(/<\/\s*(ul|ol)\s*>/gi, '\n')
      // Resto de etiquetas fuera.
      .replace(/<[^>]+>/g, '')
      // Entidades que el editor genera con mas frecuencia.
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      // Normalizar el espaciado resultante.
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

/**
 * Comprueba que la plantilla JSON produzca JSON valido una vez sustituida. Se usa
 * al GUARDAR la regla, con los valores de ejemplo del catalogo: asi el error se ve
 * al configurar y no cuando se pierde la primera alerta real.
 *
 * Devuelve el mensaje de error, o `null` si esta bien.
 */
export function validarPlantillaJson(
  plantilla: string,
  variablesDeEjemplo: Record<string, string>,
): string | null {
  if (!plantilla.trim()) {
    return null;
  }

  const sustituida = aplicarPlantilla(plantilla, variablesDeEjemplo, 'json');

  try {
    const parseado: unknown = JSON.parse(sustituida);
    if (parseado === null || typeof parseado !== 'object') {
      return 'El cuerpo tiene que ser un objeto o un arreglo JSON.';
    }
    return null;
  } catch (err) {
    const detalle = err instanceof Error ? err.message : 'JSON invalido';
    return `El contenido queda mal armado al reemplazar las variables: ${detalle}`;
  }
}
