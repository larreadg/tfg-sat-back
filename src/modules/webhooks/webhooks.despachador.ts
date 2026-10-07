import { createHmac, randomUUID } from 'node:crypto';
import dns from 'node:dns/promises';
import net from 'node:net';
import axios from 'axios';
import {
  AccionWebhook,
  CabeceraWebhook,
  EstadoAlerta,
  EventoWebhook,
  Prisma,
  ReglaWebhook,
} from '@prisma/client';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { descifrar } from '../../shared/utils/crypto';
import { enviarCorreo, parsearDestinatarios } from '../../shared/services/email.service';
import { definicionEvento, ETIQUETAS_NIVEL } from './webhooks.eventos';
import { aplicarPlantilla, htmlATextoPlano } from './webhooks.plantillas';

/**
 * MOTOR DE ENTREGA. Resuelve que reglas aplican a un evento y las ejecuta.
 *
 * Regla de oro: **nunca tira**. Se lo llama desde el pipeline post-reporte y desde
 * el cambio de estado de una alerta; que una URL este caida o que el SMTP rechace
 * no puede romper el flujo del ciudadano ni la operacion del analista. Todo fallo
 * se registra como `EntregaWebhook` con `exito: false` y se sigue.
 *
 * Tampoco se espera a las entregas: `emitir()` se lanza y el llamador no la
 * aguarda (ver los puntos de emision en `alertas.service.ts`). Un webhook HTTP
 * lento no debe sumarse al tiempo de respuesta de nada.
 */

const TIMEOUT_HTTP_MS = 10_000;

/**
 * Una regla con sus cabeceras cargadas. El despachador SIEMPRE necesita las
 * cabeceras, asi que se tipan como obligatorias: si una consulta se olvida el
 * `include`, falla al compilar y no en runtime mandando la request sin autenticar.
 */
export type ReglaConCabeceras = ReglaWebhook & { cabeceras: CabeceraWebhook[] };

/** Lo que el service de dominio le pasa al motor cuando algo pasa. */
export interface ContextoEvento {
  evento: EventoWebhook;
  /** Para la condicion `nivelMinimo`. Si el evento no la admite, se ignora. */
  nivel?: number;
  /** Para la condicion `estadosDestino`. Idem. */
  estadoDestino?: EstadoAlerta;
  /** Valores planos para los `{{placeholders}}` del asunto. */
  variables: Record<string, string>;
  /** El objeto que viaja como JSON en la accion HTTP. NUNCA con PII. */
  cargaUtil: Record<string, unknown>;
}

export function etiquetaNivel(nivel: number | null | undefined): string {
  return nivel == null ? 'sin nivel' : ETIQUETAS_NIVEL[nivel] ?? `Nivel ${nivel}`;
}

/**
 * ¿Esta regla aplica a este evento concreto?
 *
 * Las condiciones se chequean contra el catalogo: si el evento no admite una
 * condicion, el valor guardado en la fila se ignora (puede haber quedado de cuando
 * la regla apuntaba a otro evento). Sin esto, cambiar el evento de una regla vieja
 * la dejaria filtrando por algo que ya no tiene sentido.
 */
function aplica(regla: ReglaWebhook, ctx: ContextoEvento): boolean {
  const condiciones = definicionEvento(ctx.evento).condiciones;

  if (condiciones.includes('nivelMinimo') && regla.nivelMinimo != null) {
    if (ctx.nivel == null || ctx.nivel < regla.nivelMinimo) {
      return false;
    }
  }

  if (condiciones.includes('estadosDestino') && regla.estadosDestino.length > 0) {
    if (!ctx.estadoDestino || !regla.estadosDestino.includes(ctx.estadoDestino)) {
      return false;
    }
  }

  return true;
}

// --- Proteccion SSRF --------------------------------------------------------

const RANGOS_BLOQUEADOS_V4 = [
  { red: '10.0.0.0', bits: 8 },
  { red: '172.16.0.0', bits: 12 },
  { red: '192.168.0.0', bits: 16 },
  { red: '127.0.0.0', bits: 8 },
  // Link-local. Incluye 169.254.169.254, el endpoint de metadatos de las nubes.
  { red: '169.254.0.0', bits: 16 },
  { red: '0.0.0.0', bits: 8 },
  { red: '100.64.0.0', bits: 10 },
];

function aEntero(ip: string): number {
  return ip.split('.').reduce((acumulado, octeto) => (acumulado << 8) + Number(octeto), 0) >>> 0;
}

function esPrivadaV4(ip: string): boolean {
  const valor = aEntero(ip);
  return RANGOS_BLOQUEADOS_V4.some(({ red, bits }) => {
    const mascara = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (valor & mascara) === (aEntero(red) & mascara);
  });
}

function esPrivadaV6(ip: string): boolean {
  const normalizada = ip.toLowerCase();
  return (
    normalizada === '::1' ||
    normalizada === '::' ||
    normalizada.startsWith('fc') || // unique local
    normalizada.startsWith('fd') ||
    normalizada.startsWith('fe80') // link-local
  );
}

/**
 * Un usuario con `webhook.editar` elige una URL que el SERVIDOR va a visitar: es
 * una primitiva de SSRF servida en bandeja. Sin este chequeo, una regla apuntada a
 * `http://169.254.169.254/...` o a un servicio interno convierte el panel en un
 * proxy hacia la red privada del backend.
 *
 * Se resuelve el hostname y se rechaza si alguna respuesta cae en rango privado.
 * No cubre DNS rebinding (el nombre podria resolver distinto entre este chequeo y
 * la request de axios); para eso haria falta fijar la IP en el agente HTTP, que es
 * mas maquinaria de la que este caso justifica.
 *
 * `WEBHOOKS_PERMITIR_RED_PRIVADA=true` lo desactiva: necesario para probar contra
 * un receptor local en desarrollo.
 */
async function verificarDestinoPermitido(url: string): Promise<void> {
  if (env.webhooksPermitirRedPrivada) {
    return;
  }

  const { hostname } = new URL(url);

  // Si ya es una IP literal, no hace falta resolver nada.
  if (net.isIP(hostname)) {
    const privada = net.isIPv4(hostname) ? esPrivadaV4(hostname) : esPrivadaV6(hostname);
    if (privada) {
      throw new Error(`destino bloqueado: ${hostname} es una direccion de la red interna y no se puede usar`);
    }
    return;
  }

  const direcciones = await dns.lookup(hostname, { all: true });
  for (const { address, family } of direcciones) {
    const privada = family === 4 ? esPrivadaV4(address) : esPrivadaV6(address);
    if (privada) {
      throw new Error(`destino bloqueado: ${hostname} apunta a ${address}, una direccion de la red interna`);
    }
  }
}

// --- Acciones ---------------------------------------------------------------

function asuntoPorDefecto(ctx: ContextoEvento): string {
  const definicion = definicionEvento(ctx.evento);
  const nivel = ctx.nivel != null ? ` — ${etiquetaNivel(ctx.nivel)}` : '';
  return `[AGUARD] ${definicion.label}${nivel}`;
}

/**
 * Cuerpo autogenerado, para cuando la regla no define uno propio. Lista las
 * variables del evento: sirve de red y, al configurar, muestra que datos hay.
 */
function cuerpoPorDefecto(regla: ReglaWebhook, ctx: ContextoEvento): string {
  const definicion = definicionEvento(ctx.evento);
  const lineas = [
    definicion.descripcion,
    '',
    ...Object.entries(ctx.variables)
      .filter(([clave]) => clave !== 'evento' && clave !== 'regla')
      .map(([clave, valor]) => `${clave}: ${valor}`),
    '',
    `Regla que lo disparo: ${regla.nombre}`,
    '',
    '--',
    'AGUARD — Sistema de alerta temprana de agua potencialmente contaminada.',
    'Este correo se genero automaticamente. Para dejar de recibirlo, editá la regla en el panel.',
  ];
  return lineas.join('\n');
}

async function ejecutarCorreo(regla: ReglaWebhook, ctx: ContextoEvento): Promise<string> {
  const destinatarios = parsearDestinatarios(regla.destinatarios);
  if (destinatarios.length === 0) {
    throw new Error('la regla no tiene destinatarios');
  }

  const asunto = regla.asunto
    ? aplicarPlantilla(regla.asunto, ctx.variables, 'texto')
    : asuntoPorDefecto(ctx);

  // Con cuerpo propio: va como HTML (lo escribio el editor del panel) y se deriva
  // el texto plano. Mandar solo `html` hace que los filtros de spam penalicen el
  // mensaje y que un cliente en modo texto lo muestre vacio.
  if (regla.cuerpoCorreo.trim()) {
    const html = aplicarPlantilla(regla.cuerpoCorreo, ctx.variables, 'html');
    await enviarCorreo({
      para: destinatarios,
      asunto,
      texto: htmlATextoPlano(html),
      html,
    });
  } else {
    await enviarCorreo({
      para: destinatarios,
      asunto,
      texto: cuerpoPorDefecto(regla, ctx),
    });
  }

  return `correo enviado a ${destinatarios.length} destinatario(s)`;
}

/**
 * Cabeceras reservadas: las pone el despachador y no se pueden pisar desde una
 * regla. Dejar que una regla redefina `X-Aguard-Firma` permitiria mandar una firma
 * falsa, y redefinir `Content-Type` rompe el parseo del receptor.
 */
const CABECERAS_RESERVADAS = new Set([
  'content-type',
  'x-aguard-evento',
  'x-aguard-entrega',
  'x-aguard-firma',
]);

async function ejecutarHttp(regla: ReglaConCabeceras, ctx: ContextoEvento): Promise<string> {
  if (!regla.url) {
    throw new Error('falta la direccion del sistema al que hay que avisar');
  }

  await verificarDestinoPermitido(regla.url);

  // El cuerpo: plantilla propia de la regla, o el payload completo de AGUARD.
  // Con plantilla se sustituye en contexto JSON (escapa comillas y saltos sin
  // agregar comillas) y se valida el resultado antes de mandarlo: un receptor que
  // recibe JSON roto responde 400 y el error no diria por que.
  let cuerpo: string;
  if (regla.cuerpoHttp.trim()) {
    cuerpo = aplicarPlantilla(regla.cuerpoHttp, ctx.variables, 'json');
    try {
      JSON.parse(cuerpo);
    } catch (err) {
      const detalle = err instanceof Error ? err.message : 'JSON invalido';
      throw new Error(`el contenido configurado quedo mal armado al reemplazar las variables: ${detalle}`);
    }
  } else {
    // Se firma el STRING exacto que viaja: si se firmara el objeto y axios lo
    // serializara distinto, el receptor calcularia otro HMAC y nunca validaria.
    cuerpo = JSON.stringify(ctx.cargaUtil);
  }

  const cabeceras: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Aguard-Evento': ctx.evento,
    'X-Aguard-Entrega': randomUUID(),
  };

  // Cabeceras propias de la regla (Authorization, X-API-Key...). El valor esta
  // cifrado en la DB; se descifra solo aca, para la request.
  for (const cabecera of regla.cabeceras) {
    if (CABECERAS_RESERVADAS.has(cabecera.nombre.toLowerCase())) {
      continue;
    }
    cabeceras[cabecera.nombre] = descifrar(cabecera.valor);
  }

  if (regla.secretoFirma) {
    const secreto = descifrar(regla.secretoFirma);
    const firma = createHmac('sha256', secreto).update(cuerpo).digest('hex');
    cabeceras['X-Aguard-Firma'] = `sha256=${firma}`;
  }

  const respuesta = await axios.post(regla.url, cuerpo, {
    headers: cabeceras,
    timeout: TIMEOUT_HTTP_MS,
    // Nosotros decidimos que es exito (cualquier 2xx) en el chequeo de abajo, para
    // poder guardar un detalle legible. Sin esto axios tira antes y el mensaje que
    // queda en la bitacora es el generico de la libreria.
    validateStatus: () => true,
    maxRedirects: 0,
    transformRequest: [(datos) => datos],
  });

  if (respuesta.status < 200 || respuesta.status >= 300) {
    throw new Error(`HTTP ${respuesta.status} ${respuesta.statusText ?? ''}`.trim());
  }

  return `HTTP ${respuesta.status}`;
}

/**
 * Ejecuta UNA regla y deja constancia en `EntregaWebhook`. No propaga el error del
 * destino: lo convierte en una entrega fallida, que es el dato que el panel muestra.
 */
export async function ejecutarRegla(
  regla: ReglaConCabeceras,
  ctx: ContextoEvento,
  esPrueba = false,
): Promise<{ exito: boolean; detalle: string; duracionMs: number }> {
  const inicio = Date.now();
  let exito = false;
  let detalle: string;

  try {
    detalle =
      regla.accion === AccionWebhook.CORREO
        ? await ejecutarCorreo(regla, ctx)
        : await ejecutarHttp(regla, ctx);
    exito = true;
  } catch (err) {
    detalle = err instanceof Error ? err.message : 'error desconocido';
    if (axios.isAxiosError(err)) {
      // El mensaje de axios solo ("Request failed...") no dice nada util; el codigo
      // y el cuerpo de la respuesta si.
      const cuerpo = typeof err.response?.data === 'string' ? err.response.data.slice(0, 300) : '';
      detalle = [err.code, err.message, cuerpo].filter(Boolean).join(' — ');
    }
  }

  const duracionMs = Date.now() - inicio;

  try {
    await prisma.entregaWebhook.create({
      data: {
        reglaId: regla.id,
        evento: ctx.evento,
        exito,
        detalle: detalle.slice(0, 1000),
        duracionMs,
        cargaUtil: ctx.cargaUtil as Prisma.InputJsonValue,
        esPrueba,
      },
    });
  } catch (err) {
    console.error('[webhooks] No se pudo registrar la entrega', err);
  }

  return { exito, detalle, duracionMs };
}

/**
 * Punto de entrada para los services de dominio: "paso esto, avisale a quien
 * corresponda". Nunca tira y nunca hay que esperarla.
 */
export async function emitir(ctx: ContextoEvento): Promise<void> {
  try {
    const reglas = await prisma.reglaWebhook.findMany({
      where: { evento: ctx.evento, activa: true },
      include: { cabeceras: true },
    });

    const aplicables = reglas.filter((regla) => aplica(regla, ctx));
    if (aplicables.length === 0) {
      return;
    }

    // En serie y no en paralelo: el camino CORREO abre una conexion SMTP por envio
    // y varios a la vez contra el mismo servidor es la forma mas rapida de que te
    // empiece a limitar. El volumen esperado (unas pocas reglas) no lo justifica.
    for (const regla of aplicables) {
      await ejecutarRegla(regla, { ...ctx, variables: { ...ctx.variables, regla: regla.nombre } });
    }
  } catch (err) {
    console.error(`[webhooks] Error despachando ${ctx.evento}`, err);
  }
}
