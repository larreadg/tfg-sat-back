import { AccionWebhook, EstadoAlerta, EventoWebhook, Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { BadRequestError, NotFoundError } from '../../shared/utils/errors';
import { cifrar, ClaveCifradoAusenteError } from '../../shared/utils/crypto';
import { parsearDestinatarios } from '../../shared/services/email.service';
import { definicionAccion, definicionEvento } from './webhooks.eventos';
import { ContextoEvento, ejecutarRegla, etiquetaNivel } from './webhooks.despachador';
import { registrarAuditoria } from '../auditoria/auditoria.registro';
import {
  ActualizarReglaBody,
  ActualizarRemitenteBody,
  CrearReglaBody,
  ListarEntregasQuery,
  ListarReglasQuery,
} from './webhooks.validation';
import {
  AutorDTO,
  EntregaWebhookDTO,
  INCLUDE_AUTORES,
  ListarReglasParams,
  ReglaConAutores,
  ReglaWebhookDTO,
  RemitenteDTO,
  ResultadoPaginado,
} from './webhooks.types';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const NOTIFICACION_ID = 1;

function autor(usuario: ReglaConAutores['usuarioCreacion']): AutorDTO | null {
  if (!usuario) {
    return null;
  }
  return {
    id: usuario.id,
    nombreCompleto: `${usuario.persona.nombres} ${usuario.persona.apellidos}`.trim(),
    correoElectronico: usuario.correoElectronico,
  };
}

function serializarEntrega(entrega: {
  id: number;
  evento: EventoWebhook;
  exito: boolean;
  detalle: string;
  duracionMs: number;
  cargaUtil: Prisma.JsonValue;
  esPrueba: boolean;
  fechaCreacion: Date;
}): EntregaWebhookDTO {
  return {
    id: entrega.id,
    evento: entrega.evento,
    exito: entrega.exito,
    detalle: entrega.detalle,
    duracionMs: entrega.duracionMs,
    cargaUtil: entrega.cargaUtil,
    esPrueba: entrega.esPrueba,
    fechaCreacion: entrega.fechaCreacion,
  };
}

/**
 * Por que esta regla no va a poder ejecutarse, dicho ANTES de que ocurra el evento.
 *
 * Es la diferencia entre un panel que avisa y uno que te deja descubrir el problema
 * recien cuando se perdio una alerta real: una regla de correo perfecta es inutil si
 * el SMTP esta apagado, y el usuario no tiene por que saber que eso se configura en
 * otra pantalla.
 */
function calcularAdvertencia(
  regla: { accion: AccionWebhook; destinatarios: string; url: string },
  smtp: { smtpHabilitado: boolean; remitenteEfectivo: string },
): string | null {
  if (regla.accion === AccionWebhook.CORREO) {
    if (!smtp.smtpHabilitado) {
      return 'El envio de correos esta deshabilitado en Configuracion > Sistema: esta regla no va a enviar nada.';
    }
    if (!smtp.remitenteEfectivo) {
      return 'Falta definir el remitente de los correos: sin eso no se puede enviar el aviso.';
    }
    if (parsearDestinatarios(regla.destinatarios).length === 0) {
      return 'La regla no tiene destinatarios.';
    }
    return null;
  }

  if (!regla.url) {
    return 'Falta la direccion del sistema al que hay que avisar.';
  }
  return null;
}

function serializarRegla(
  regla: ReglaConAutores & { entregas?: EntregaWebhookDTO[] },
  smtp: { smtpHabilitado: boolean; remitenteEfectivo: string },
): ReglaWebhookDTO {
  return {
    id: regla.id,
    nombre: regla.nombre,
    evento: regla.evento,
    accion: regla.accion,
    activa: regla.activa,
    nivelMinimo: regla.nivelMinimo,
    estadosDestino: regla.estadosDestino,
    destinatarios: parsearDestinatarios(regla.destinatarios),
    asunto: regla.asunto,
    cuerpoCorreo: regla.cuerpoCorreo,
    url: regla.url,
    // El secreto de firma se colapsa a un booleano, igual que la contrasena SMTP.
    tieneSecretoFirma: Boolean(regla.secretoFirma),
    cuerpoHttp: regla.cuerpoHttp,
    // Las cabeceras salen SIN el valor: es una credencial.
    cabeceras: regla.cabeceras.map((cabecera) => ({
      nombre: cabecera.nombre,
      tieneValor: Boolean(cabecera.valor),
    })),
    advertencia: calcularAdvertencia(regla, smtp),
    ultimaEntrega: regla.entregas?.[0] ?? null,
    autor: autor(regla.usuarioCreacion),
    editor: autor(regla.usuarioActualizacion),
    fechaCreacion: regla.fechaCreacion,
    fechaActualizacion: regla.fechaActualizacion,
  };
}

/**
 * Estado del transporte, que hace falta para calcular `advertencia`. Se lee una vez
 * por request y se propaga, en vez de una consulta por regla.
 */
async function leerContextoSmtp(): Promise<{ smtpHabilitado: boolean; remitenteEfectivo: string }> {
  const config = await prisma.configuracionNotificacion.findUnique({
    where: { id: NOTIFICACION_ID },
    select: { smtpHabilitado: true, remitenteCorreo: true, smtpUsuario: true },
  });

  return {
    smtpHabilitado: config?.smtpHabilitado ?? false,
    remitenteEfectivo: config?.remitenteCorreo || config?.smtpUsuario || '',
  };
}

// --- Auditoria ---------------------------------------------------------------

/**
 * Lo que de una regla se guarda en la bitacora. Se parte del DTO y no de la fila
 * cruda porque el DTO ya es la version sin secretos: `tieneSecretoFirma` en vez
 * del secreto, y las cabeceras sin su `valor`. El saneador de
 * `auditoria.registro.ts` igual los taparia, pero un dato sensible que nunca sale
 * del service no depende de que el saneador acierte el nombre del campo.
 */
function resumenAuditoriaRegla(regla: ReglaWebhookDTO) {
  return {
    id: regla.id,
    nombre: regla.nombre,
    evento: regla.evento,
    accion: regla.accion,
    activa: regla.activa,
    nivelMinimo: regla.nivelMinimo,
    estadosDestino: regla.estadosDestino,
    destinatarios: regla.destinatarios,
    asunto: regla.asunto,
    url: regla.url,
    tieneSecretoFirma: regla.tieneSecretoFirma,
    tienePlantillaCorreo: regla.cuerpoCorreo.length > 0,
    tienePlantillaHttp: regla.cuerpoHttp.length > 0,
    cabeceras: regla.cabeceras.map((cabecera) => cabecera.nombre),
  };
}

// --- Remitente ---------------------------------------------------------------

export async function obtenerRemitente(): Promise<RemitenteDTO> {
  const config = await prisma.configuracionNotificacion.findUnique({
    where: { id: NOTIFICACION_ID },
  });

  return {
    remitenteNombre: config?.remitenteNombre ?? '',
    remitenteCorreo: config?.remitenteCorreo ?? '',
    remitenteEfectivo: config?.remitenteCorreo || config?.smtpUsuario || '',
    smtpHabilitado: config?.smtpHabilitado ?? false,
    smtpUsuario: config?.smtpUsuario ?? '',
  };
}

/**
 * Escribe SOLO las columnas `remitente*` de `ConfiguracionNotificacion`. Las
 * columnas `smtp*` son del modulo de configuracion: ver el comentario del modelo en
 * `schema.prisma`. Tocarlas desde aca pisaria el tab Sistema.
 */
export async function guardarRemitente(
  input: ActualizarRemitenteBody,
  usuarioId: number,
): Promise<RemitenteDTO> {
  const datos = {
    remitenteNombre: input.remitenteNombre,
    remitenteCorreo: input.remitenteCorreo,
    usuarioActualizacionId: usuarioId,
  };

  const previo = await obtenerRemitente();

  await prisma.configuracionNotificacion.upsert({
    where: { id: NOTIFICACION_ID },
    update: datos,
    create: { id: NOTIFICACION_ID, ...datos },
  });

  const actualizado = await obtenerRemitente();

  registrarAuditoria({
    accion: 'WEBHOOK_REMITENTE_EDITAR',
    entidadId: NOTIFICACION_ID,
    descripcion: `Cambio el remitente de los avisos a "${actualizado.remitenteEfectivo || 'sin definir'}"`,
    datosPrevios: { remitenteNombre: previo.remitenteNombre, remitenteCorreo: previo.remitenteCorreo },
    datosNuevos: {
      remitenteNombre: actualizado.remitenteNombre,
      remitenteCorreo: actualizado.remitenteCorreo,
    },
  });

  return actualizado;
}

// --- Reglas ------------------------------------------------------------------

/**
 * Traduce el body validado a columnas. Los campos que la accion elegida NO usa se
 * NORMALIZAN a vacio: si una regla pasa de CORREO a HTTP, dejar los destinatarios
 * guardados haria que `advertencia` y el listado mintieran sobre lo que la regla
 * hace. zod ya rechaza que vengan cargados, esto es el cinturon.
 */
function datosDeRegla(input: CrearReglaBody | ActualizarReglaBody): {
  nombre: string;
  evento: EventoWebhook;
  accion: AccionWebhook;
  activa: boolean;
  nivelMinimo: number | null;
  estadosDestino: EstadoAlerta[];
  destinatarios: string;
  asunto: string;
  cuerpoCorreo: string;
  url: string;
  cuerpoHttp: string;
} {
  const condiciones = definicionEvento(input.evento).condiciones;
  const campos = definicionAccion(input.accion).campos;

  return {
    nombre: input.nombre,
    evento: input.evento,
    accion: input.accion,
    activa: input.activa,
    nivelMinimo: condiciones.includes('nivelMinimo') ? input.nivelMinimo ?? null : null,
    estadosDestino: condiciones.includes('estadosDestino') ? input.estadosDestino : [],
    destinatarios: campos.includes('destinatarios')
      ? parsearDestinatarios(input.destinatarios).join(', ')
      : '',
    asunto: campos.includes('asunto') ? input.asunto : '',
    cuerpoCorreo: campos.includes('cuerpoCorreo') ? input.cuerpoCorreo : '',
    url: campos.includes('url') ? input.url : '',
    cuerpoHttp: campos.includes('cuerpoHttp') ? input.cuerpoHttp : '',
  };
}

/**
 * Deja las cabeceras de una regla exactamente como las pide el input.
 *
 * El contrato es el mismo de tres estados que los demas secretos, pero POR
 * CABECERA e identificado por `nombre`, porque la API no devuelve los valores y el
 * panel no puede reenviarlos:
 *   - cabecera con `valor` string  -> se cifra y se guarda (nueva o reemplazo).
 *   - cabecera sin `valor`         -> se conserva la guardada con ese nombre.
 *   - cabecera que no viene en la lista -> se borra.
 *
 * Una cabecera nueva SIN valor es un error del cliente, no un no-op silencioso:
 * mandar `Authorization` sin valor dejaria la regla llamando sin autenticar.
 */
async function sincronizarCabeceras(
  tx: Prisma.TransactionClient,
  reglaId: number,
  entrantes: { nombre: string; valor?: string }[],
): Promise<void> {
  const existentes = await tx.cabeceraWebhook.findMany({ where: { reglaId } });
  const porNombre = new Map(existentes.map((cabecera) => [cabecera.nombre, cabecera]));
  const nombresEntrantes = new Set(entrantes.map((cabecera) => cabecera.nombre));

  for (const entrante of entrantes) {
    const existente = porNombre.get(entrante.nombre);

    if (entrante.valor !== undefined) {
      const valor = cifrarSecreto(entrante.valor);
      await tx.cabeceraWebhook.upsert({
        where: { reglaId_nombre: { reglaId, nombre: entrante.nombre } },
        update: { valor },
        create: { reglaId, nombre: entrante.nombre, valor },
      });
      continue;
    }

    if (!existente) {
      throw new BadRequestError(`Falta el valor de la cabecera "${entrante.nombre}".`);
    }
    // Sin valor y ya existe: se deja tal cual.
  }

  // Las que ya no estan en la lista se van.
  const aBorrar = existentes.filter((cabecera) => !nombresEntrantes.has(cabecera.nombre));
  if (aBorrar.length > 0) {
    await tx.cabeceraWebhook.deleteMany({
      where: { id: { in: aBorrar.map((cabecera) => cabecera.id) } },
    });
  }
}

/** Cifra el secreto de firma, traduciendo la falta de clave maestra a un 400 claro. */
function cifrarSecreto(valor: string): string {
  try {
    return cifrar(valor);
  } catch (err) {
    if (err instanceof ClaveCifradoAusenteError) {
      throw new BadRequestError(err.message);
    }
    throw err;
  }
}

export async function listarReglas(params: ListarReglasQuery): Promise<ResultadoPaginado<ReglaWebhookDTO>> {
  const page = params.page && params.page > 0 ? params.page : 1;
  const limit = Math.min(params.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

  const where: Prisma.ReglaWebhookWhereInput = {
    ...(params.evento ? { evento: params.evento } : {}),
    ...(params.activa !== undefined ? { activa: params.activa } : {}),
  };

  const [filas, total, smtp] = await Promise.all([
    prisma.reglaWebhook.findMany({
      where,
      include: {
        ...INCLUDE_AUTORES,
        // Solo la ultima: alcanza para la columna de estado del listado y evita
        // traer la bitacora completa de cada regla.
        entregas: { orderBy: { fechaCreacion: 'desc' }, take: 1 },
      },
      orderBy: [{ activa: 'desc' }, { fechaCreacion: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.reglaWebhook.count({ where }),
    leerContextoSmtp(),
  ]);

  return {
    data: filas.map((fila) =>
      serializarRegla({ ...fila, entregas: fila.entregas.map(serializarEntrega) }, smtp),
    ),
    meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}

export async function obtenerRegla(id: number): Promise<ReglaWebhookDTO> {
  const [regla, smtp] = await Promise.all([
    prisma.reglaWebhook.findUnique({
      where: { id },
      include: { ...INCLUDE_AUTORES, entregas: { orderBy: { fechaCreacion: 'desc' }, take: 1 } },
    }),
    leerContextoSmtp(),
  ]);

  if (!regla) {
    throw new NotFoundError('La regla no existe.');
  }

  return serializarRegla({ ...regla, entregas: regla.entregas.map(serializarEntrega) }, smtp);
}

export async function crearRegla(input: CrearReglaBody, usuarioId: number): Promise<ReglaWebhookDTO> {
  const datos = datosDeRegla(input);
  const usaFirma = definicionAccion(input.accion).campos.includes('secretoFirma');

  const usaCabeceras = definicionAccion(input.accion).campos.includes('cabeceras');

  // En transaccion: una regla con `Authorization` a medio guardar llamaria al
  // servicio sin autenticar en el siguiente evento.
  const creada = await prisma.$transaction(async (tx) => {
    const regla = await tx.reglaWebhook.create({
      data: {
        ...datos,
        // `null` explicito: sin secreto, el POST manda sin firmar.
        secretoFirma: usaFirma && input.secretoFirma ? cifrarSecreto(input.secretoFirma) : null,
        usuarioCreacionId: usuarioId,
        usuarioActualizacionId: usuarioId,
      },
    });

    if (usaCabeceras && input.cabeceras.length > 0) {
      await sincronizarCabeceras(tx, regla.id, input.cabeceras);
    }

    return tx.reglaWebhook.findUniqueOrThrow({
      where: { id: regla.id },
      include: { ...INCLUDE_AUTORES, entregas: { orderBy: { fechaCreacion: 'desc' }, take: 1 } },
    });
  });

  const dto = serializarRegla({ ...creada, entregas: [] }, await leerContextoSmtp());

  registrarAuditoria({
    accion: 'WEBHOOK_CREAR',
    entidadId: dto.id,
    descripcion: `Creo la regla de notificacion "${dto.nombre}" (${dto.evento} -> ${dto.accion})`,
    datosNuevos: resumenAuditoriaRegla(dto),
  });

  return dto;
}

export async function actualizarRegla(
  id: number,
  input: ActualizarReglaBody,
  usuarioId: number,
): Promise<ReglaWebhookDTO> {
  const existente = await prisma.reglaWebhook.findUnique({ where: { id } });
  if (!existente) {
    throw new NotFoundError('La regla no existe.');
  }

  // El "antes" se lee como DTO (y no de `existente`) para que la bitacora compare
  // dos objetos de la misma forma y sin secretos. Es una consulta mas en una
  // operacion de configuracion, no en el camino del ciudadano.
  const previo = await obtenerRegla(id);

  const datos = datosDeRegla(input);
  const usaFirma = definicionAccion(input.accion).campos.includes('secretoFirma');

  // Mismo contrato de tres estados que la contrasena SMTP: ausente = conservar,
  // null = borrar, string = reemplazar. Y si la accion dejo de usar firma, se
  // limpia, para que no quede un secreto huerfano en la fila.
  let secretoFirma: string | null | undefined;
  if (!usaFirma) {
    secretoFirma = null;
  } else if (input.secretoFirma === null) {
    secretoFirma = null;
  } else if (typeof input.secretoFirma === 'string') {
    secretoFirma = cifrarSecreto(input.secretoFirma);
  }

  const usaCabeceras = definicionAccion(input.accion).campos.includes('cabeceras');

  const actualizada = await prisma.$transaction(async (tx) => {
    await tx.reglaWebhook.update({
      where: { id },
      data: {
        ...datos,
        ...(secretoFirma === undefined ? {} : { secretoFirma }),
        usuarioActualizacionId: usuarioId,
      },
    });

    // Si la accion ya no usa cabeceras se borran todas: una cabecera huerfana
    // volveria a aplicarse si alguien devuelve la regla a la accion HTTP, sin que
    // el formulario la haya mostrado nunca.
    await sincronizarCabeceras(tx, id, usaCabeceras ? input.cabeceras : []);

    return tx.reglaWebhook.findUniqueOrThrow({
      where: { id },
      include: { ...INCLUDE_AUTORES, entregas: { orderBy: { fechaCreacion: 'desc' }, take: 1 } },
    });
  });

  const dto = serializarRegla(
    { ...actualizada, entregas: actualizada.entregas.map(serializarEntrega) },
    await leerContextoSmtp(),
  );

  registrarAuditoria({
    accion: 'WEBHOOK_EDITAR',
    entidadId: id,
    descripcion: `Edito la regla de notificacion "${dto.nombre}"`,
    datosPrevios: resumenAuditoriaRegla(previo),
    datosNuevos: resumenAuditoriaRegla(dto),
    metadatos: {
      // Tres cambios que no se ven comparando los resumenes y que cambian a donde
      // sale la informacion o con que credencial.
      cambioSecretoFirma: input.secretoFirma !== undefined,
      cabecerasConValorNuevo: input.cabeceras.filter((cabecera) => cabecera.valor !== undefined).length,
      seActivo: !previo.activa && dto.activa,
      seDesactivo: previo.activa && !dto.activa,
    },
  });

  return dto;
}

export async function eliminarRegla(id: number): Promise<void> {
  const existente = await prisma.reglaWebhook.findUnique({ where: { id } });
  if (!existente) {
    throw new NotFoundError('La regla no existe.');
  }
  // El "antes" se captura ANTES del delete: despues la regla y sus cabeceras ya
  // no estan y no habria con que llenar la entrada de la bitacora.
  const previo = await obtenerRegla(id);

  // Las entregas caen por `onDelete: Cascade`: la bitacora de una regla que ya no
  // existe no le sirve a nadie y sin la regla no se puede ni mostrar de quien era.
  await prisma.reglaWebhook.delete({ where: { id } });

  registrarAuditoria({
    accion: 'WEBHOOK_ELIMINAR',
    entidadId: id,
    descripcion: `Elimino la regla de notificacion "${existente.nombre}"`,
    datosPrevios: resumenAuditoriaRegla(previo),
  });
}

// --- Prueba ------------------------------------------------------------------

/**
 * Payload de ejemplo para el boton "Probar". Son datos INVENTADOS pero con la forma
 * exacta del evento real, para que el receptor (y el que configura) vea el contrato
 * de verdad. Se marca `esPrueba` en la bitacora para no confundirlo con un evento
 * que paso de verdad, y la carga lleva `prueba: true` para que un receptor HTTP
 * pueda ignorarla.
 */
function contextoDePrueba(evento: EventoWebhook): ContextoEvento {
  const ahora = new Date();
  const fecha = ahora.toLocaleString('es-PY');
  const nivel = 3;

  const comunes = {
    evento,
    fecha,
    regla: '(prueba)',
  };

  const alerta = {
    alertaId: '999',
    nivel: String(nivel),
    nivelEtiqueta: etiquetaNivel(nivel),
    motivo: 'PRUEBA: reporte AG-000999 alcanzo Nivel 3 (criticidad 4.20).',
    estado: 'NUEVA',
    origen: 'REPORTE',
    ubicacion: 'Barrio de prueba, Ciudad de prueba',
    coordenadas: '-25.2867, -57.3333',
  };

  const base: ContextoEvento = {
    evento,
    nivel,
    variables: { ...comunes },
    cargaUtil: {
      evento,
      prueba: true,
      ocurridoEn: ahora.toISOString(),
      sistema: { nombre: 'AGUARD', entorno: env.nodeEnv },
    },
  };

  switch (evento) {
    case EventoWebhook.ALERTA_CREADA:
      return {
        ...base,
        variables: { ...comunes, ...alerta },
        cargaUtil: { ...base.cargaUtil, alerta: { ...alerta, nivel, id: 999 } },
      };

    case EventoWebhook.ALERTA_ESCALADA:
      return {
        ...base,
        variables: { ...comunes, ...alerta, nivelAnterior: '2' },
        cargaUtil: { ...base.cargaUtil, alerta: { ...alerta, nivel, id: 999, nivelAnterior: 2 } },
      };

    case EventoWebhook.ALERTA_ESTADO_CAMBIADO:
      return {
        ...base,
        nivel: undefined,
        estadoDestino: EstadoAlerta.DERIVADA,
        variables: {
          ...comunes,
          ...alerta,
          estado: 'DERIVADA',
          estadoAnterior: 'EN_REVISION',
          estadoNuevo: 'DERIVADA',
          observacion: 'PRUEBA: derivada al organismo competente.',
          analista: 'Usuario de prueba',
        },
        cargaUtil: {
          ...base.cargaUtil,
          alerta: { ...alerta, id: 999, nivel, estado: 'DERIVADA' },
          cambio: {
            estadoAnterior: 'EN_REVISION',
            estadoNuevo: 'DERIVADA',
            observacion: 'PRUEBA: derivada al organismo competente.',
            analista: 'Usuario de prueba',
          },
        },
      };

    case EventoWebhook.PUNTO_CRITICO_CONSOLIDADO:
      return {
        ...base,
        variables: {
          ...comunes,
          puntoCriticoId: '99',
          nivel: String(nivel),
          nivelEtiqueta: etiquetaNivel(nivel),
          cantidadReportes: '5',
          radioMetros: '500',
          coordenadas: '-25.2867, -57.3333',
        },
        cargaUtil: {
          ...base.cargaUtil,
          puntoCritico: {
            id: 99,
            nivel,
            cantidadReportes: 5,
            radioMetros: 500,
            latitudCentro: -25.2867,
            longitudCentro: -57.3333,
          },
        },
      };
  }
}

/**
 * Dispara la regla con el payload de ejemplo. Ignora `activa` a proposito: poder
 * probar una regla antes de encenderla es justamente el orden sensato de trabajo.
 * Las condiciones tampoco se evaluan: el payload de prueba se arma para que pasen.
 */
export async function probarRegla(id: number): Promise<EntregaWebhookDTO> {
  // `include` obligatorio: el despachador necesita las cabeceras para autenticar.
  const regla = await prisma.reglaWebhook.findUnique({
    where: { id },
    include: { cabeceras: true },
  });
  if (!regla) {
    throw new NotFoundError('La regla no existe.');
  }

  const ctx = contextoDePrueba(regla.evento);
  const resultado = await ejecutarRegla(
    regla,
    { ...ctx, variables: { ...ctx.variables, regla: regla.nombre } },
    true,
  );

  // Se audita el intento, exitoso o no: una prueba manda trafico real (un correo,
  // un POST) a un destino que eligio un usuario, y `exito: false` es justamente lo
  // que explica por que el receptor recibio basura o nada.
  registrarAuditoria({
    accion: 'WEBHOOK_PRUEBA',
    entidadId: id,
    descripcion: `Probo la regla de notificacion "${regla.nombre}"`,
    exito: resultado.exito,
    metadatos: {
      evento: regla.evento,
      accionRegla: regla.accion,
      detalle: resultado.detalle,
      duracionMs: resultado.duracionMs,
    },
  });

  const entrega = await prisma.entregaWebhook.findFirst({
    where: { reglaId: id },
    orderBy: { fechaCreacion: 'desc' },
  });

  if (!entrega) {
    // No deberia pasar: `ejecutarRegla` siempre registra. Si el registro fallo, al
    // menos se devuelve el resultado real en vez de un 500 opaco.
    return {
      id: 0,
      evento: regla.evento,
      exito: resultado.exito,
      detalle: resultado.detalle,
      duracionMs: resultado.duracionMs,
      cargaUtil: {},
      esPrueba: true,
      fechaCreacion: new Date(),
    };
  }

  return serializarEntrega(entrega);
}

// --- Bitacora ----------------------------------------------------------------

export async function listarEntregas(
  reglaId: number,
  params: ListarEntregasQuery,
): Promise<ResultadoPaginado<EntregaWebhookDTO>> {
  const existe = await prisma.reglaWebhook.findUnique({ where: { id: reglaId }, select: { id: true } });
  if (!existe) {
    throw new NotFoundError('La regla no existe.');
  }

  const page = params.page && params.page > 0 ? params.page : 1;
  const limit = Math.min(params.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

  const [filas, total] = await Promise.all([
    prisma.entregaWebhook.findMany({
      where: { reglaId },
      orderBy: { fechaCreacion: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.entregaWebhook.count({ where: { reglaId } }),
  ]);

  return {
    data: filas.map(serializarEntrega),
    meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}

export type { ListarReglasParams };
