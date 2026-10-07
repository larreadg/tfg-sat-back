/**
 * Deteccion del tipo REAL de un adjunto leyendo sus bytes, no el `mimetype` que
 * declaro el cliente (que se falsea trivialmente). Es la misma idea que
 * `modules/reportes/upload.ts:validarFormatoReal`, extendida a los formatos que
 * acepta el seguimiento de alertas: imagen, PDF y OOXML (docx/xlsx).
 *
 * Todo lo de este archivo es puro sobre `Buffer`: se testea sin DB ni HTTP, que
 * es el unico tipo de test que corre el proyecto (`npm test`).
 *
 * Las imagenes NO se validan aca: eso lo hace `sharp` decodificando el
 * contenido (ver `alertas.adjuntos.ts`), que es mas fuerte que mirar una firma.
 */

/** Familias de adjunto que acepta el seguimiento. */
export type FamiliaAdjunto = 'imagen' | 'pdf' | 'docx' | 'xlsx';

/** Un PDF empieza con `%PDF-` en el offset 0. */
export function esPdf(buffer: Buffer): boolean {
  return buffer.subarray(0, 5).toString('latin1') === '%PDF-';
}

/** Local file header de un ZIP: `PK\x03\x04`. */
const ZIP_LOCAL_HEADER = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

/**
 * Firma de contenedor ZIP. Es condicion NECESARIA de un docx/xlsx, no
 * suficiente: un .jar o un .zip cualquiera tambien la cumplen.
 */
export function esZip(buffer: Buffer): boolean {
  return buffer.subarray(0, 4).equals(ZIP_LOCAL_HEADER);
}

/**
 * Distingue docx de xlsx sin dependencias nuevas. Todo paquete OOXML es un ZIP
 * que contiene `[Content_Types].xml` y nombra sus partes con el prefijo de su
 * tipo (`word/` o `xl/`). Los nombres de las entradas van en claro en el ZIP,
 * asi que alcanza con buscarlos como texto.
 *
 * NO es un parser de ZIP y no pretende serlo: su trabajo es descartar un .exe,
 * un .html o un .jar renombrados. Un ZIP armado a mano con esos nombres adentro
 * pasaria; se acepta, porque el archivo nunca se abre en el servidor y nunca se
 * sirve con un tipo que el navegador pueda interpretar (ver el endpoint de
 * contenido: `nosniff` + CSP + `attachment` para Office).
 */
export function detectarOoxml(buffer: Buffer): 'docx' | 'xlsx' | null {
  if (!esZip(buffer)) {
    return null;
  }
  if (buffer.indexOf('[Content_Types].xml', 0, 'latin1') === -1) {
    return null;
  }
  if (buffer.indexOf('word/document.xml', 0, 'latin1') !== -1) {
    return 'docx';
  }
  if (buffer.indexOf('xl/workbook.xml', 0, 'latin1') !== -1) {
    return 'xlsx';
  }
  return null;
}

/**
 * Tipos MIME aceptados y su extension en disco. El mapa es server-side a
 * proposito: la extension del archivo que sube la persona NUNCA participa de la
 * ruta (ahi viven el path traversal y el null byte).
 *
 * SVG queda afuera DELIBERADAMENTE: es XML y puede traer `<script>`, o sea XSS
 * almacenado servido desde el origen de la API. No agregarlo.
 */
export const MIME_EXTENSIONES: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
};

const MIME_FAMILIA: Record<string, FamiliaAdjunto> = {
  'image/jpeg': 'imagen',
  'image/png': 'imagen',
  'image/webp': 'imagen',
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
};

/** Familia a la que dice pertenecer el archivo, o null si el MIME no se acepta. */
export function familiaDeclarada(mimetype: string): FamiliaAdjunto | null {
  return MIME_FAMILIA[mimetype] ?? null;
}

/** Formatos que `sharp` puede reportar y que se aceptan como imagen. */
export const FORMATOS_IMAGEN_PERMITIDOS = new Set(['jpeg', 'png', 'webp']);

/** El formato que reporta sharp tiene que ser el mismo que declaro el cliente. */
export function formatoImagenCoincide(mimetype: string, formatoSharp: string | undefined): boolean {
  if (!formatoSharp || !FORMATOS_IMAGEN_PERMITIDOS.has(formatoSharp)) {
    return false;
  }
  // sharp dice 'jpeg' para image/jpeg; el resto coincide con el subtipo.
  return mimetype === `image/${formatoSharp}`;
}
