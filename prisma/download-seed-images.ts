/**
 * Descarga (o verifica) las imagenes reales usadas por el seed de reportes
 * ciudadanos sinteticos (Acuifero Patino). Ver docs/seed-reportes-imagenes.md
 * para la trazabilidad completa (fuente, autor, licencia) de cada imagen.
 *
 * Uso:
 *   node --env-file=.env --experimental-strip-types prisma/download-seed-images.ts
 *
 * Es reanudable: si un archivo local ya existe y es una imagen valida, no se
 * vuelve a descargar. Termina con codigo distinto de cero si falta alguna
 * imagen obligatoria del manifiesto.
 */
const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const http = require('node:http');
const sharp = require('sharp');
const { IMAGENES } = require('./seed-data/imagenes.manifest.ts');

const DESTINO_DIR = path.join(process.cwd(), 'uploads', 'seed-reportes');
const USER_AGENT = 'tfg-sat-back-seed/1.0 (+demo dataset acuifero-patino; contacto: proyecto academico)';
const TIMEOUT_MS = 20000;
const MAX_REDIRECTS = 5;
const CONTENT_TYPES_IMAGEN = new Set(['image/jpeg', 'image/png', 'image/webp']);
const DELAY_ENTRE_DESCARGAS_MS = 4500;

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * El 429 de estos servidores es un throttle por IP con Retry-After de varios
 * minutos, no un limite por archivo individual: reintentar de inmediato solo
 * renueva el bloqueo. Por eso, ante un 429 se marca el host completo "en
 * cooldown" hasta que expire el Retry-After, y el resto de archivos de ese
 * mismo host se saltan sin generar trafico nuevo durante esta corrida
 * (quedan pendientes para una proxima ejecucion, el script es reanudable).
 */
const hostsEnCooldownHasta = new Map();

function hostDe(url) {
  return new URL(url).host;
}

function descargarBinario(url, redirectsRestantes = MAX_REDIRECTS) {
  return new Promise((resolve, reject) => {
    const cliente = url.startsWith('https:') ? https : http;

    const request = cliente.get(
      url,
      {
        headers: { 'User-Agent': USER_AGENT, Accept: 'image/*' },
        timeout: TIMEOUT_MS,
      },
      (respuesta) => {
        const { statusCode, headers } = respuesta;

        if (statusCode && statusCode >= 300 && statusCode < 400 && headers.location) {
          respuesta.resume();
          if (redirectsRestantes <= 0) {
            reject(new Error(`Demasiados redirects para ${url}`));
            return;
          }
          const siguienteUrl = new URL(headers.location, url).toString();
          descargarBinario(siguienteUrl, redirectsRestantes - 1).then(resolve, reject);
          return;
        }

        if (statusCode !== 200) {
          respuesta.resume();
          const error = new Error(`HTTP ${statusCode} al descargar ${url}`);
          if (statusCode === 429) {
            const retryAfterHeader = Number(headers['retry-after']);
            error.retryAfterMs = Number.isFinite(retryAfterHeader) ? retryAfterHeader * 1000 : 60000;
          }
          reject(error);
          return;
        }

        const contentType = (headers['content-type'] || '').split(';')[0].trim().toLowerCase();
        if (!CONTENT_TYPES_IMAGEN.has(contentType)) {
          respuesta.resume();
          reject(
            new Error(
              `Content-Type inesperado "${contentType || 'desconocido'}" en ${url} (se esperaba una imagen, no HTML u otro contenido).`,
            ),
          );
          return;
        }

        const chunks = [];
        respuesta.on('data', (chunk) => chunks.push(chunk));
        respuesta.on('end', () => resolve(Buffer.concat(chunks)));
        respuesta.on('error', reject);
      },
    );

    request.on('timeout', () => {
      request.destroy(new Error(`Timeout descargando ${url}`));
    });
    request.on('error', reject);
  });
}

async function esImagenValidaEnDisco(rutaArchivo) {
  if (!fs.existsSync(rutaArchivo)) {
    return false;
  }
  try {
    const metadata = await sharp(rutaArchivo).metadata();
    return Boolean(metadata.width && metadata.height);
  } catch {
    return false;
  }
}

async function procesarImagen(item, indice, total) {
  const rutaDestino = path.join(DESTINO_DIR, item.archivo);
  const etiqueta = `[${indice + 1}/${total}] ${item.archivo}`;

  if (await esImagenValidaEnDisco(rutaDestino)) {
    console.log(`${etiqueta}: OMITIDA (ya existe y es valida)`);
    return { archivo: item.archivo, resultado: 'omitida' };
  }

  if (!item.url) {
    console.error(`${etiqueta}: FALLO (sin URL de origen en el manifiesto)`);
    return { archivo: item.archivo, resultado: 'fallo', error: 'URL de origen vacia' };
  }

  const host = hostDe(item.url);
  const cooldownHasta = hostsEnCooldownHasta.get(host);
  if (cooldownHasta && Date.now() < cooldownHasta) {
    const restanteSeg = Math.ceil((cooldownHasta - Date.now()) / 1000);
    console.log(`${etiqueta}: DIFERIDA (host ${host} en cooldown por rate limit, faltan ~${restanteSeg}s; correr de nuevo mas tarde)`);
    return { archivo: item.archivo, resultado: 'fallo', error: `Host ${host} en cooldown por rate limit (~${restanteSeg}s restantes)` };
  }

  try {
    const buffer = await descargarBinario(item.url);

    const rutaTemporal = `${rutaDestino}.tmp-${process.pid}`;
    const webp = await sharp(buffer)
      .resize({ width: 1600, withoutEnlargement: true })
      .webp({ quality: 78 })
      .toBuffer();

    fs.mkdirSync(DESTINO_DIR, { recursive: true });
    fs.writeFileSync(rutaTemporal, webp);
    fs.renameSync(rutaTemporal, rutaDestino);

    console.log(`${etiqueta}: DESCARGADA (${(webp.length / 1024).toFixed(0)} KB)`);
    return { archivo: item.archivo, resultado: 'descargada' };
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : String(error);

    if (error && error.retryAfterMs) {
      hostsEnCooldownHasta.set(host, Date.now() + error.retryAfterMs);
    }

    console.error(`${etiqueta}: FALLO (${mensaje})`);
    return { archivo: item.archivo, resultado: 'fallo', error: mensaje };
  }
}

async function main() {
  fs.mkdirSync(DESTINO_DIR, { recursive: true });

  const nombresArchivo = new Set();
  for (const item of IMAGENES) {
    if (nombresArchivo.has(item.archivo)) {
      throw new Error(`Nombre de archivo duplicado en el manifiesto: ${item.archivo}`);
    }
    nombresArchivo.add(item.archivo);
  }

  console.log(`Procesando ${IMAGENES.length} imagenes del manifiesto...`);
  console.log(`Destino: ${DESTINO_DIR}`);
  console.log('');

  const resultados = [];
  for (const [indice, item] of IMAGENES.entries()) {
    resultados.push(await procesarImagen(item, indice, IMAGENES.length));
    if (indice < IMAGENES.length - 1) {
      await esperar(DELAY_ENTRE_DESCARGAS_MS);
    }
  }

  const descargadas = resultados.filter((r) => r.resultado === 'descargada').length;
  const omitidas = resultados.filter((r) => r.resultado === 'omitida').length;
  const fallidas = resultados.filter((r) => r.resultado === 'fallo');

  console.log('');
  console.log('Resumen de descarga de imagenes del seed:');
  console.log(`- Descargadas: ${descargadas}`);
  console.log(`- Omitidas (ya existian): ${omitidas}`);
  console.log(`- Fallidas: ${fallidas.length}`);

  if (fallidas.length > 0) {
    console.error('');
    console.error('Imagenes que no se pudieron obtener:');
    for (const f of fallidas) {
      console.error(`  - ${f.archivo}: ${f.error}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log('');
  console.log('Todas las imagenes obligatorias estan disponibles.');
}

main().catch((error) => {
  console.error('Error inesperado descargando imagenes del seed.');
  console.error(error);
  process.exitCode = 1;
});
