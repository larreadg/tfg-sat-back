import { Prisma, TipoPregunta } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { registrarAuditoria } from '../auditoria/auditoria.registro';
import { BadRequestError, ConflictError, NotFoundError } from '../../shared/utils/errors';
import { codigosExigidosPorConfigActiva } from '../criticidad/criticidad.service';
import {
  ActualizarEncuestaBody,
  ActualizarPreguntaBody,
  CrearEncuestaBody,
  CrearPreguntaBody,
  CrearVersionBody,
  ReemplazarContenidoBody,
} from './encuestas-admin.validation';

/** Texto de la pregunta de fotos que se agrega sola si una version no la trae. */
const TEXTO_PREGUNTA_FOTO = 'Fotos del agua';

/** Codigo de esa misma pregunta de fotos. */
const CODIGO_PREGUNTA_FOTO = 'FOTOS';

/**
 * Convierte un texto en un `codigo` candidato (`¿Qué color tiene el agua?` ->
 * `QUE_COLOR_TIENE_EL_AGUA`). Solo se usa cuando el cliente no manda uno: el
 * codigo es la identidad estable de la pregunta, asi que conviene que el panel lo
 * elija a conciencia.
 */
function derivarCodigo(texto: string, fallback: string): string {
  const base = texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // saca tildes: "¿Qué?" -> "Que"
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase()
    .slice(0, 64);

  if (!base) {
    return fallback;
  }
  // El codigo tiene que empezar con letra (lo exige el schema zod).
  return /^[A-Z]/.test(base) ? base : `C_${base}`.slice(0, 64);
}

/** `base`, `base_2`, `base_3`... hasta encontrar uno libre. */
function codigoUnico(base: string, usados: Set<string>): string {
  if (!usados.has(base)) {
    usados.add(base);
    return base;
  }
  for (let sufijo = 2; ; sufijo += 1) {
    const candidato = `${base.slice(0, 60)}_${sufijo}`;
    if (!usados.has(candidato)) {
      usados.add(candidato);
      return candidato;
    }
  }
}

const INCLUDE_DETALLE = {
  preguntas: {
    orderBy: { orden: 'asc' },
    include: {
      pregunta: {
        include: { opciones: { orderBy: { orden: 'asc' } } },
      },
    },
  },
  _count: { select: { reportes: true } },
} as const;

type EncuestaDetalle = Prisma.EncuestaGetPayload<{ include: typeof INCLUDE_DETALLE }>;

/**
 * `codigosCriticidad` = codigos de pregunta que la configuracion activa del motor
 * puntua o usa como marcador (RN-11/RN-12). Se recibe por parametro en vez de
 * consultarlo aca adentro para no disparar una query por serializacion.
 */
function serializarDetalle(encuesta: EncuestaDetalle, codigosCriticidad: Set<string>) {
  return {
    id: encuesta.id,
    version: encuesta.version,
    origenId: encuesta.origenId,
    nombre: encuesta.nombre,
    descripcion: encuesta.descripcion,
    activo: encuesta.activo,
    fotosMin: encuesta.fotosMin,
    fotosMax: encuesta.fotosMax,
    cantidadReportes: encuesta._count.reportes,
    // Una version con reportes es historia: se clona, no se edita.
    editable: encuesta._count.reportes === 0,
    fechaCreacion: encuesta.fechaCreacion,
    preguntas: encuesta.preguntas.map((ep) => ({
      id: ep.pregunta.id,
      texto: ep.pregunta.texto,
      codigo: ep.pregunta.codigo,
      tipo: ep.pregunta.tipo,
      activo: ep.pregunta.activo,
      orden: ep.orden,
      // Ahora se decide por CODIGO contra la config activa, no comparando textos:
      // renombrar una pregunta ya no la saca del motor, y una pregunta nueva que
      // recibe regla queda marcada sin tocar codigo.
      usadaEnCriticidad: ep.pregunta.codigo !== null && codigosCriticidad.has(ep.pregunta.codigo),
      opciones: ep.pregunta.opciones.map((o) => ({
        id: o.id,
        texto: o.texto,
        codigo: o.codigo,
        orden: o.orden,
        activo: o.activo,
      })),
    })),
  };
}

async function cargarDetalleOThrow(id: number): Promise<EncuestaDetalle> {
  const encuesta = await prisma.encuesta.findUnique({ where: { id }, include: INCLUDE_DETALLE });
  if (!encuesta) {
    throw new NotFoundError('No encontramos esa version del cuestionario.');
  }
  return encuesta;
}

/** Carga + serializa, resolviendo los codigos que exige el motor. */
async function detalleSerializado(id: number) {
  const [encuesta, codigosCriticidad] = await Promise.all([
    cargarDetalleOThrow(id),
    codigosExigidosPorConfigActiva(),
  ]);
  return serializarDetalle(encuesta, codigosCriticidad);
}

/**
 * Una version que ya recibio reportes no se toca: el historico tiene que poder
 * reconstruirse tal como se respondio. Para cambiar algo se crea una version nueva.
 */
async function exigirEditable(encuestaId: number): Promise<void> {
  const cantidad = await prisma.reporte.count({ where: { encuestaId } });
  if (cantidad > 0) {
    throw new ConflictError(
      `La version ya tiene ${cantidad} reporte(s): no se edita. Crea una version nueva a partir de ella.`,
    );
  }
}

/** Igual que `exigirEditable`, pero entrando por la pregunta. */
async function exigirPreguntaEditable(preguntaId: number): Promise<void> {
  const usoEnVersionConReportes = await prisma.encuestaPregunta.findFirst({
    where: { preguntaId, encuesta: { reportes: { some: {} } } },
    select: { encuestaId: true },
  });
  if (usoEnVersionConReportes) {
    throw new ConflictError(
      'La pregunta pertenece a una version que ya tiene reportes: crea una version nueva para cambiarla.',
    );
  }
}

async function siguienteVersion(tx: Prisma.TransactionClient): Promise<number> {
  const maximo = await tx.encuesta.aggregate({ _max: { version: true } });
  return (maximo._max.version ?? 0) + 1;
}

export async function listarEncuestas() {
  const encuestas = await prisma.encuesta.findMany({
    orderBy: { version: 'desc' },
    include: { _count: { select: { preguntas: true, reportes: true } } },
  });
  return encuestas.map((e) => ({
    id: e.id,
    version: e.version,
    origenId: e.origenId,
    nombre: e.nombre,
    descripcion: e.descripcion,
    activo: e.activo,
    fotosMin: e.fotosMin,
    fotosMax: e.fotosMax,
    cantidadPreguntas: e._count.preguntas,
    cantidadReportes: e._count.reportes,
    editable: e._count.reportes === 0,
    fechaCreacion: e.fechaCreacion,
  }));
}

export async function obtenerEncuesta(id: number) {
  return detalleSerializado(id);
}

/**
 * La version ACTIVA del cuestionario. Es la que el editor del motor necesita para
 * ofrecer preguntas y opciones reales: sin esto, las reglas se cargarian escribiendo
 * codigos a mano, que es como se entra un codigo que no existe.
 */
export async function obtenerEncuestaActiva() {
  const activa = await prisma.encuesta.findFirst({
    where: { activo: true },
    orderBy: { version: 'desc' },
    select: { id: true },
  });

  if (!activa) {
    throw new NotFoundError('No hay una version de encuesta activa.');
  }

  return detalleSerializado(activa.id);
}

/**
 * `codigosUsados` acumula los codigos de pregunta ya tomados en la encuesta que se
 * esta armando, para no repetirlos. La unicidad del codigo de pregunta es POR
 * ENCUESTA y no se puede expresar en el schema (el modelo es M-N), asi que se
 * resuelve aca.
 */
async function crearPreguntaConOpciones(
  tx: Prisma.TransactionClient,
  entrada: CrearPreguntaBody,
  usuarioId: number,
  codigosUsados: Set<string>,
): Promise<number> {
  const codigo = codigoUnico(entrada.codigo ?? derivarCodigo(entrada.texto, 'PREGUNTA'), codigosUsados);

  const pregunta = await tx.pregunta.create({
    data: {
      texto: entrada.texto,
      codigo,
      tipo: entrada.tipo,
      usuarioCreacionId: usuarioId,
      usuarioActualizacionId: usuarioId,
    },
  });

  if (entrada.opciones.length > 0) {
    // Los codigos de opcion son locales a su pregunta (`@@unique([preguntaId,
    // codigo])`), asi que el set arranca vacio en cada pregunta.
    const codigosOpcion = new Set<string>();
    await tx.preguntaOpcion.createMany({
      data: entrada.opciones.map((opcion, indice) => ({
        preguntaId: pregunta.id,
        texto: opcion.texto,
        codigo: codigoUnico(opcion.codigo ?? derivarCodigo(opcion.texto, 'OPCION'), codigosOpcion),
        orden: opcion.orden ?? indice,
        usuarioCreacionId: usuarioId,
        usuarioActualizacionId: usuarioId,
      })),
    });
  }

  return pregunta.id;
}

/** Codigos de pregunta ya tomados en una encuesta (para `codigosUsados`). */
async function codigosDePreguntasDe(tx: Prisma.TransactionClient, encuestaId: number): Promise<Set<string>> {
  const filas = await tx.encuestaPregunta.findMany({
    where: { encuestaId },
    select: { pregunta: { select: { codigo: true } } },
  });
  return new Set(
    filas.map((fila) => fila.pregunta.codigo).filter((codigo): codigo is string => codigo !== null),
  );
}

/**
 * Toda version tiene que tener su paso de fotos: la foto no es opcional, es
 * parte del reporte. Si la definicion no trae una pregunta FOTO, se agrega al
 * final en vez de rechazar el pedido.
 */
async function asegurarPreguntaFoto(
  tx: Prisma.TransactionClient,
  encuestaId: number,
  usuarioId: number,
): Promise<void> {
  const yaTiene = await tx.encuestaPregunta.findFirst({
    where: { encuestaId, pregunta: { tipo: TipoPregunta.FOTO } },
    select: { preguntaId: true },
  });
  if (yaTiene) {
    return;
  }

  const orden = ((await tx.encuestaPregunta.aggregate({ where: { encuestaId }, _max: { orden: true } }))._max.orden ?? -1) + 1;
  const preguntaId = await crearPreguntaConOpciones(
    tx,
    { texto: TEXTO_PREGUNTA_FOTO, codigo: CODIGO_PREGUNTA_FOTO, tipo: TipoPregunta.FOTO, opciones: [] },
    usuarioId,
    await codigosDePreguntasDe(tx, encuestaId),
  );
  await tx.encuestaPregunta.create({ data: { encuestaId, preguntaId, orden } });
}

/**
 * Lo que de una version de encuesta se guarda en la bitacora. NO van las
 * preguntas enteras con sus opciones: una version tipica son 10 preguntas con 5
 * opciones cada una, y volcarlas en cada `datosNuevos` haria entradas de miles de
 * caracteres que el saneador termina recortando igual. Se guarda la cabecera mas
 * la lista de codigos, que es la identidad estable de las preguntas (lo que ata el
 * cuestionario al motor de criticidad) y lo unico que sirve para entender despues
 * por que la criticidad cambio.
 */
function resumenAuditoriaEncuesta(detalle: {
  id: number;
  version: number;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
  fotosMin: number;
  fotosMax: number;
  preguntas: { codigo: string | null; texto: string }[];
}) {
  return {
    id: detalle.id,
    version: detalle.version,
    nombre: detalle.nombre,
    descripcion: detalle.descripcion,
    activo: detalle.activo,
    fotosMin: detalle.fotosMin,
    fotosMax: detalle.fotosMax,
    cantidadPreguntas: detalle.preguntas.length,
    codigosPregunta: detalle.preguntas.map((pregunta) => pregunta.codigo ?? pregunta.texto.slice(0, 40)),
  };
}

export async function crearEncuesta(input: CrearEncuestaBody, usuarioId: number) {
  const encuestaId = await prisma.$transaction(async (tx) => {
    // Nace como borrador (activo=false): activar es un paso explicito para no
    // pisar la version activa en uso.
    const creada = await tx.encuesta.create({
      data: {
        version: await siguienteVersion(tx),
        nombre: input.nombre,
        descripcion: input.descripcion ?? null,
        activo: false,
        fotosMin: input.fotosMin,
        fotosMax: input.fotosMax,
        usuarioCreacionId: usuarioId,
        usuarioActualizacionId: usuarioId,
      },
    });

    const codigosUsados = new Set<string>();
    for (const [indice, preguntaInput] of input.preguntas.entries()) {
      const preguntaId = await crearPreguntaConOpciones(tx, preguntaInput, usuarioId, codigosUsados);
      await tx.encuestaPregunta.create({
        data: { encuestaId: creada.id, preguntaId, orden: preguntaInput.orden ?? indice },
      });
    }

    await asegurarPreguntaFoto(tx, creada.id, usuarioId);
    return creada.id;
  });

  const dto = await detalleSerializado(encuestaId);
  registrarAuditoria({
    accion: 'ENCUESTA_CREAR',
    entidadId: dto.id,
    descripcion: `Creo la encuesta "${dto.nombre}" (version ${dto.version})`,
    datosNuevos: resumenAuditoriaEncuesta(dto),
  });

  return dto;
}

/**
 * Crea una version nueva a partir de otra (RF: versionado del cuestionario).
 *
 * Las preguntas y opciones se DUPLICAN, no se comparten: cada version es un
 * snapshot propio, asi editar la nueva no reescribe lo que respondieron los
 * reportes viejos (que apuntan a las filas de su version). Nace como borrador;
 * activarla es un paso aparte.
 *
 * Lo que SI se comparte entre versiones es el `codigo`: las filas son nuevas pero
 * heredan la identidad. Sin eso, las reglas del motor (que se clavan al codigo)
 * moririan en cada version nueva y la criticidad se desplomaria al activarla.
 */
export async function crearVersionDesde(origenId: number, input: CrearVersionBody, usuarioId: number) {
  const origen = await cargarDetalleOThrow(origenId);
  const versionOrigen = origen.version;

  const nuevaId = await prisma.$transaction(async (tx) => {
    const version = await siguienteVersion(tx);
    const creada = await tx.encuesta.create({
      data: {
        version,
        origenId: origen.id,
        nombre: input.nombre ?? `${origen.nombre} v${version}`,
        descripcion: input.descripcion === undefined ? origen.descripcion : input.descripcion,
        activo: false,
        fotosMin: input.fotosMin ?? origen.fotosMin,
        fotosMax: input.fotosMax ?? origen.fotosMax,
        usuarioCreacionId: usuarioId,
        usuarioActualizacionId: usuarioId,
      },
    });

    // El front manda el borrador ya ajustado; si no manda preguntas, se clona
    // el contenido del origen tal cual.
    const definicion: CrearPreguntaBody[] =
      input.preguntas ??
      origen.preguntas.map((ep) => ({
        texto: ep.pregunta.texto,
        // `?? undefined`: la columna es nullable, el input no.
        codigo: ep.pregunta.codigo ?? undefined,
        tipo: ep.pregunta.tipo,
        opciones: ep.pregunta.opciones.map((o) => ({
          texto: o.texto,
          codigo: o.codigo ?? undefined,
          orden: o.orden,
        })),
      }));

    const codigosUsados = new Set<string>();
    for (const [indice, preguntaInput] of definicion.entries()) {
      const preguntaId = await crearPreguntaConOpciones(tx, preguntaInput, usuarioId, codigosUsados);
      await tx.encuestaPregunta.create({
        data: { encuestaId: creada.id, preguntaId, orden: preguntaInput.orden ?? indice },
      });
    }

    await asegurarPreguntaFoto(tx, creada.id, usuarioId);
    return creada.id;
  });

  const dto = await detalleSerializado(nuevaId);
  registrarAuditoria({
    accion: 'ENCUESTA_VERSION_CREAR',
    entidadId: dto.id,
    descripcion: `Creo la version ${dto.version} de la encuesta "${dto.nombre}" a partir de la version ${versionOrigen}`,
    datosNuevos: resumenAuditoriaEncuesta(dto),
    metadatos: { origenId, versionOrigen },
  });

  return dto;
}

/**
 * Antes de poner una version en produccion: tiene que poder responderse. Sin
 * preguntas no hay reporte, y sin paso de fotos el reporte queda sin evidencia
 * (la IA analiza fotos).
 */
function validarActivable(encuesta: EncuestaDetalle): void {
  const preguntas = encuesta.preguntas.filter((ep) => ep.pregunta.activo);
  const tieneFoto = preguntas.some((ep) => ep.pregunta.tipo === TipoPregunta.FOTO);
  const tieneCuestionario = preguntas.some((ep) => ep.pregunta.tipo !== TipoPregunta.FOTO);

  if (!tieneCuestionario) {
    throw new BadRequestError('La version no tiene preguntas activas: no se puede activar.');
  }
  if (!tieneFoto) {
    throw new BadRequestError('La version no tiene paso de fotos: no se puede activar.');
  }
  if (encuesta.fotosMin < 1 || encuesta.fotosMax < encuesta.fotosMin) {
    throw new BadRequestError('La cantidad de fotos de esta version no es valida.');
  }
}

/**
 * Activar una version que no trae alguna de las preguntas que el motor puntua
 * dejaria ese factor sin aporte: se renormaliza y la criticidad de todos los
 * reportes nuevos baja, sin un solo error en los logs. Era el agujero que quedaba
 * entre el versionado de encuestas y el motor.
 *
 * Se BLOQUEA en vez de avisar: la salida es crear la version de configuracion que
 * acompañe al cuestionario nuevo, y eso se hace en el tab del motor.
 */
function validarCoberturaDelMotor(encuesta: EncuestaDetalle, codigosCriticidad: Set<string>): void {
  if (codigosCriticidad.size === 0) {
    return;
  }

  const presentes = new Set(
    encuesta.preguntas
      .filter((ep) => ep.pregunta.activo)
      .map((ep) => ep.pregunta.codigo)
      .filter((codigo): codigo is string => codigo !== null),
  );

  const faltantes = [...codigosCriticidad].filter((codigo) => !presentes.has(codigo));
  if (faltantes.length > 0) {
    throw new BadRequestError(
      `La configuracion activa del motor de criticidad puntua preguntas que esta version no tiene: ${faltantes.join(', ')}. ` +
        'Agregalas a la version, o crea primero una version de configuracion que no las use.',
    );
  }
}

export async function actualizarEncuesta(id: number, input: ActualizarEncuestaBody, usuarioId: number) {
  const encuesta = await cargarDetalleOThrow(id);
  // El "antes" para la bitacora, calculado antes de la transaccion. Se arma del
  // detalle que la funcion ya cargaba para validar: ninguna consulta extra.
  const previo = resumenAuditoriaEncuesta({
    ...encuesta,
    preguntas: encuesta.preguntas.map((ep) => ep.pregunta),
  });

  const cambiaContenido =
    input.nombre !== undefined ||
    input.descripcion !== undefined ||
    input.fotosMin !== undefined ||
    input.fotosMax !== undefined;

  // Activar/desactivar una version usada es valido; cambiar su contenido no.
  if (cambiaContenido) {
    await exigirEditable(id);
  }

  const fotosMin = input.fotosMin ?? encuesta.fotosMin;
  const fotosMax = input.fotosMax ?? encuesta.fotosMax;
  if (fotosMax < fotosMin) {
    throw new BadRequestError('El maximo de fotos no puede ser menor al minimo.');
  }

  if (input.activo === true) {
    validarActivable({ ...encuesta, fotosMin, fotosMax });
    validarCoberturaDelMotor(encuesta, await codigosExigidosPorConfigActiva());
  }

  await prisma.$transaction(async (tx) => {
    // Una sola version activa: activar esta desactiva a las demas.
    if (input.activo === true) {
      await tx.encuesta.updateMany({ where: { id: { not: id }, activo: true }, data: { activo: false } });
    }

    await tx.encuesta.update({
      where: { id },
      data: {
        nombre: input.nombre ?? undefined,
        descripcion: input.descripcion === undefined ? undefined : input.descripcion,
        activo: input.activo ?? undefined,
        fotosMin: input.fotosMin ?? undefined,
        fotosMax: input.fotosMax ?? undefined,
        usuarioActualizacionId: usuarioId,
      },
    });
  });

  const dto = await detalleSerializado(id);
  registrarAuditoria({
    accion: 'ENCUESTA_EDITAR',
    entidadId: id,
    // Activar una version es el cambio con mas consecuencias de esta pantalla
    // (desactiva la anterior y pasa a ser el cuestionario que responde el
    // ciudadano), asi que se nombra distinto en la bitacora.
    descripcion:
      input.activo === true && !previo.activo
        ? `Activo la version ${dto.version} de la encuesta "${dto.nombre}"`
        : input.activo === false && previo.activo
          ? `Desactivo la version ${dto.version} de la encuesta "${dto.nombre}"`
          : `Edito la encuesta "${dto.nombre}" (version ${dto.version})`,
    datosPrevios: previo,
    datosNuevos: resumenAuditoriaEncuesta(dto),
  });

  return dto;
}

export async function agregarPregunta(encuestaId: number, input: CrearPreguntaBody, usuarioId: number) {
  await cargarDetalleOThrow(encuestaId);
  await exigirEditable(encuestaId);

  await prisma.$transaction(async (tx) => {
    const orden =
      input.orden ??
      ((
        await tx.encuestaPregunta.aggregate({
          where: { encuestaId },
          _max: { orden: true },
        })
      )._max.orden ?? -1) + 1;

    // Se agrega a una encuesta que ya tiene preguntas: los codigos existentes
    // entran al set para que el nuevo no choque con ninguno.
    const preguntaId = await crearPreguntaConOpciones(
      tx,
      input,
      usuarioId,
      await codigosDePreguntasDe(tx, encuestaId),
    );
    await tx.encuestaPregunta.create({ data: { encuestaId, preguntaId, orden } });
  });

  const dto = await detalleSerializado(encuestaId);
  registrarAuditoria({
    accion: 'PREGUNTA_CREAR',
    // La entidad es la pregunta, pero se indexa por la encuesta: es por encuesta
    // que alguien va a querer leer el historial de cambios del cuestionario.
    entidadId: encuestaId,
    descripcion: `Agrego la pregunta "${input.texto}" a la encuesta "${dto.nombre}" (version ${dto.version})`,
    datosNuevos: { texto: input.texto, tipo: input.tipo, codigo: input.codigo ?? null },
    metadatos: { encuestaId, cantidadPreguntas: dto.preguntas.length },
  });

  return dto;
}

async function preguntaTieneRespuestas(preguntaId: number): Promise<boolean> {
  const respuesta = await prisma.respuesta.findFirst({ where: { preguntaId }, select: { id: true } });
  return respuesta !== null;
}

export async function actualizarPregunta(preguntaId: number, input: ActualizarPreguntaBody, usuarioId: number) {
  const pregunta = await prisma.pregunta.findUnique({ where: { id: preguntaId } });
  if (!pregunta) {
    throw new NotFoundError('No encontramos esa pregunta.');
  }
  const previoPregunta = {
    texto: pregunta.texto,
    codigo: pregunta.codigo,
    tipo: pregunta.tipo,
    activo: pregunta.activo,
  };
  await exigirPreguntaEditable(preguntaId);

  const tipoFinal = input.tipo ?? pregunta.tipo;

  // Sacarle el tipo FOTO a la unica pregunta de fotos dejaria la version sin
  // paso de fotos, que es obligatorio.
  if (pregunta.tipo === TipoPregunta.FOTO && input.tipo && input.tipo !== TipoPregunta.FOTO) {
    throw new BadRequestError('El paso de fotos es obligatorio: no se puede cambiar su tipo.');
  }
  if (pregunta.tipo === TipoPregunta.FOTO && input.activo === false) {
    throw new BadRequestError('El paso de fotos es obligatorio: no se puede desactivar.');
  }

  if (input.opciones) {
    if (tipoFinal === TipoPregunta.FOTO && input.opciones.length > 0) {
      throw new BadRequestError('El paso de fotos no lleva opciones de respuesta.');
    }
    if (tipoFinal !== TipoPregunta.FOTO && input.opciones.length < 2) {
      throw new BadRequestError('Las preguntas de eleccion requieren al menos 2 opciones.');
    }
    if (await preguntaTieneRespuestas(preguntaId)) {
      throw new ConflictError('No se pueden modificar las opciones de una pregunta con respuestas registradas.');
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.pregunta.update({
      where: { id: preguntaId },
      data: {
        texto: input.texto ?? undefined,
        // El codigo solo cambia si lo mandan explicitamente: renombrar el texto NO
        // lo toca, que es justamente lo que vuelve seguro renombrar.
        codigo: input.codigo ?? undefined,
        tipo: input.tipo ?? undefined,
        activo: input.activo ?? undefined,
        usuarioActualizacionId: usuarioId,
      },
    });

    if (input.opciones) {
      await tx.preguntaOpcion.deleteMany({ where: { preguntaId } });
      if (input.opciones.length > 0) {
        const codigosOpcion = new Set<string>();
        await tx.preguntaOpcion.createMany({
          data: input.opciones.map((opcion, indice) => ({
            preguntaId,
            texto: opcion.texto,
            codigo: codigoUnico(opcion.codigo ?? derivarCodigo(opcion.texto, 'OPCION'), codigosOpcion),
            orden: opcion.orden ?? indice,
            usuarioCreacionId: usuarioId,
            usuarioActualizacionId: usuarioId,
          })),
        });
      }
    }
  });

  const pregActualizada = await prisma.pregunta.findUniqueOrThrow({
    where: { id: preguntaId },
    include: { opciones: { orderBy: { orden: 'asc' } } },
  });

  const dto = {
    id: pregActualizada.id,
    texto: pregActualizada.texto,
    codigo: pregActualizada.codigo,
    tipo: pregActualizada.tipo,
    activo: pregActualizada.activo,
    opciones: pregActualizada.opciones.map((o) => ({
      id: o.id,
      texto: o.texto,
      codigo: o.codigo,
      orden: o.orden,
      activo: o.activo,
    })),
  };

  registrarAuditoria({
    accion: 'PREGUNTA_EDITAR',
    entidadId: preguntaId,
    descripcion: `Edito la pregunta "${dto.texto}"`,
    datosPrevios: previoPregunta,
    datosNuevos: { texto: dto.texto, codigo: dto.codigo, tipo: dto.tipo, activo: dto.activo },
    metadatos: {
      // Cambiar el CODIGO es el cambio peligroso: el motor de criticidad se clava
      // al codigo, asi que renombrarlo puede dejar un factor sin aporte sin que
      // nada falle. Se deja explicito para poder buscarlo.
      cambioCodigo: input.codigo !== undefined && input.codigo !== previoPregunta.codigo,
      reemplazoOpciones: input.opciones !== undefined,
      cantidadOpciones: dto.opciones.length,
    },
  });

  return dto;
}

export async function eliminarPregunta(preguntaId: number): Promise<void> {
  const pregunta = await prisma.pregunta.findUnique({ where: { id: preguntaId } });
  if (!pregunta) {
    throw new NotFoundError('No encontramos esa pregunta.');
  }
  if (pregunta.tipo === TipoPregunta.FOTO) {
    throw new BadRequestError('El paso de fotos es obligatorio: no se puede eliminar.');
  }
  await exigirPreguntaEditable(preguntaId);
  if (await preguntaTieneRespuestas(preguntaId)) {
    throw new ConflictError('No se puede eliminar una pregunta con respuestas registradas. Desactivala en su lugar.');
  }

  await prisma.$transaction(async (tx) => {
    await tx.encuestaPregunta.deleteMany({ where: { preguntaId } });
    await tx.preguntaOpcion.deleteMany({ where: { preguntaId } });
    await tx.pregunta.delete({ where: { id: preguntaId } });
  });

  registrarAuditoria({
    accion: 'PREGUNTA_ELIMINAR',
    entidadId: preguntaId,
    descripcion: `Elimino la pregunta "${pregunta.texto}"`,
    datosPrevios: {
      texto: pregunta.texto,
      codigo: pregunta.codigo,
      tipo: pregunta.tipo,
      activo: pregunta.activo,
    },
  });
}

/**
 * Borra las preguntas que quedaron sin ninguna version que las use y sin
 * respuestas. Se llama despues de desarmar el contenido de un borrador: las
 * preguntas de una version clonada son exclusivas de esa version, asi que sin
 * esto se acumularian huerfanas. Nunca toca una pregunta que siga referenciada.
 */
async function limpiarPreguntasHuerfanas(tx: Prisma.TransactionClient, preguntaIds: number[]): Promise<void> {
  if (preguntaIds.length === 0) {
    return;
  }
  const huerfanas = await tx.pregunta.findMany({
    where: { id: { in: preguntaIds }, encuestas: { none: {} }, respuestas: { none: {} } },
    select: { id: true },
  });
  const ids = huerfanas.map((p) => p.id);
  if (ids.length === 0) {
    return;
  }
  await tx.preguntaOpcion.deleteMany({ where: { preguntaId: { in: ids } } });
  await tx.pregunta.deleteMany({ where: { id: { in: ids } } });
}

/**
 * Reemplaza de una sola vez todo el contenido de un BORRADOR: es el "guardar"
 * del editor del panel, que trabaja sobre una copia local y confirma al final.
 * Solo aplica a versiones sin reportes (las usadas son historia).
 */
export async function reemplazarContenido(id: number, input: ReemplazarContenidoBody, usuarioId: number) {
  const encuesta = await cargarDetalleOThrow(id);
  await exigirEditable(id);

  const previoContenido = resumenAuditoriaEncuesta({
    ...encuesta,
    preguntas: encuesta.preguntas.map((ep) => ep.pregunta),
  });

  const preguntasPrevias = encuesta.preguntas.map((ep) => ep.preguntaId);

  await prisma.$transaction(async (tx) => {
    await tx.encuesta.update({
      where: { id },
      data: {
        nombre: input.nombre,
        descripcion: input.descripcion ?? null,
        fotosMin: input.fotosMin,
        fotosMax: input.fotosMax,
        usuarioActualizacionId: usuarioId,
      },
    });

    await tx.encuestaPregunta.deleteMany({ where: { encuestaId: id } });
    await limpiarPreguntasHuerfanas(tx, preguntasPrevias);

    // El contenido previo ya se borro, asi que el set arranca vacio.
    const codigosUsados = new Set<string>();
    for (const [indice, preguntaInput] of input.preguntas.entries()) {
      const preguntaId = await crearPreguntaConOpciones(tx, preguntaInput, usuarioId, codigosUsados);
      await tx.encuestaPregunta.create({
        data: { encuestaId: id, preguntaId, orden: preguntaInput.orden ?? indice },
      });
    }

    await asegurarPreguntaFoto(tx, id, usuarioId);
  });

  const dto = await detalleSerializado(id);
  registrarAuditoria({
    accion: 'ENCUESTA_CONTENIDO_REEMPLAZAR',
    entidadId: id,
    descripcion: `Reemplazo las preguntas de la encuesta "${dto.nombre}" (version ${dto.version})`,
    datosPrevios: previoContenido,
    datosNuevos: resumenAuditoriaEncuesta(dto),
  });

  return dto;
}

/**
 * Elimina una version. Solo borradores: una version con reportes es historia y
 * la activa no puede quedar el sistema sin cuestionario.
 */
export async function eliminarEncuesta(id: number): Promise<void> {
  const encuesta = await cargarDetalleOThrow(id);
  await exigirEditable(id);
  if (encuesta.activo) {
    throw new ConflictError('No se puede eliminar la version activa. Activa otra antes de borrarla.');
  }

  const preguntaIds = encuesta.preguntas.map((ep) => ep.preguntaId);

  await prisma.$transaction(async (tx) => {
    await tx.encuestaPregunta.deleteMany({ where: { encuestaId: id } });
    await limpiarPreguntasHuerfanas(tx, preguntaIds);
    // Las versiones derivadas de esta quedan sin origen, no se borran en cascada.
    await tx.encuesta.updateMany({ where: { origenId: id }, data: { origenId: null } });
    await tx.encuesta.delete({ where: { id } });
  });

  registrarAuditoria({
    accion: 'ENCUESTA_ELIMINAR',
    entidadId: id,
    descripcion: `Elimino la version ${encuesta.version} de la encuesta "${encuesta.nombre}"`,
    datosPrevios: resumenAuditoriaEncuesta({
      ...encuesta,
      preguntas: encuesta.preguntas.map((ep) => ep.pregunta),
    }),
  });
}
