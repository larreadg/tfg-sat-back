import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { BadGatewayError, BadRequestError, NotFoundError } from '../../shared/utils/errors';
import { ActualizarConfiguracionBody, ActualizarNotificacionBody } from './configuracion.validation';
import { cifradoDisponible, cifrar, ClaveCifradoAusenteError } from '../../shared/utils/crypto';
import { enviarCorreo, verificarConexion } from '../../shared/services/email.service';
import { FactorCuestionario, PuntajesConfig } from '../criticidad/criticidad.types';
import { registrarAuditoria } from '../auditoria/auditoria.registro';
import {
  alcanceDeFactor,
  CRITICIDAD_MAX,
  type TipoPreguntaPuntuable,
} from '../criticidad/criticidad.engine';
import {
  ConfiguracionConAutor,
  ConfiguracionDTO,
  ConfiguracionNotificacionDTO,
  EstadoSistemaDTO,
  INCLUDE_AUTOR,
  ListarVersionesParams,
  ResultadoPaginado,
  ResultadoPruebaCorreoDTO,
} from './configuracion.types';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function serializar(config: ConfiguracionConAutor): ConfiguracionDTO {
  const autor = config.usuarioCreacion;

  return {
    id: config.id,
    version: config.version,
    pesos: config.pesos,
    puntajes: config.puntajes,
    umbralesNivel: config.umbralesNivel,
    radioMetros: config.radioMetros,
    ventanaDias: config.ventanaDias,
    minReportes: config.minReportes,
    limitesAntiabuso: config.limitesAntiabuso,
    bonusVulnerable: Number(config.bonusVulnerable),
    activa: config.activa,
    autor: autor
      ? {
          id: autor.id,
          nombreCompleto: `${autor.persona.nombres} ${autor.persona.apellidos}`.trim(),
          correoElectronico: autor.correoElectronico,
        }
      : null,
    fechaCreacion: config.fechaCreacion,
  };
}

export async function obtenerConfiguracionActiva(): Promise<ConfiguracionDTO> {
  const config = await prisma.configuracionCriticidad.findFirst({
    where: { activa: true },
    orderBy: { version: 'desc' },
    include: INCLUDE_AUTOR,
  });

  if (!config) {
    throw new NotFoundError('No hay una configuracion de criticidad activa.');
  }

  return serializar(config);
}

/**
 * Historial de versiones, de la mas nueva a la mas vieja. Es solo lectura: no
 * hay endpoint para reactivar una version vieja a proposito (ver
 * `crearNuevaVersion`), el panel la usa como plantilla para crear la siguiente.
 */
export async function listarVersiones(
  params: ListarVersionesParams,
): Promise<ResultadoPaginado<ConfiguracionDTO>> {
  const page = params.page && params.page > 0 ? Math.floor(params.page) : 1;
  const limit = params.limit && params.limit > 0 ? Math.min(Math.floor(params.limit), MAX_LIMIT) : DEFAULT_LIMIT;

  const [versiones, total] = await prisma.$transaction([
    prisma.configuracionCriticidad.findMany({
      orderBy: { version: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: INCLUDE_AUTOR,
    }),
    prisma.configuracionCriticidad.count(),
  ]);

  return {
    data: versiones.map(serializar),
    meta: { page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) },
  };
}

export async function obtenerVersion(id: number): Promise<ConfiguracionDTO> {
  const config = await prisma.configuracionCriticidad.findUnique({
    where: { id },
    include: INCLUDE_AUTOR,
  });

  if (!config) {
    throw new NotFoundError('No encontramos esa version de la configuracion.');
  }

  return serializar(config);
}

/** Lo que la encuesta activa ofrece de una pregunta, en lo que le importa al motor. */
interface PreguntaDisponible {
  /** `ELECCION_MULTIPLE` permite marcar varias opciones, y entonces los puntajes suman. */
  tipo: TipoPreguntaPuntuable;
  opciones: Set<string>;
}

/**
 * Preguntas y opciones que ofrece la encuesta activa, para validar contra ellas las
 * reglas del motor. El `tipo` viene porque el alcance de un factor depende de el:
 * en `ELECCION_UNICA` la pregunta aporta su opcion mas alta, en `ELECCION_MULTIPLE`
 * la suma de todas.
 */
async function codigosDeEncuestaActiva(): Promise<Map<string, PreguntaDisponible> | null> {
  const encuesta = await prisma.encuesta.findFirst({
    where: { activo: true },
    orderBy: { version: 'desc' },
    select: {
      preguntas: {
        select: {
          pregunta: {
            select: { codigo: true, tipo: true, opciones: { select: { codigo: true } } },
          },
        },
      },
    },
  });

  if (!encuesta) {
    return null;
  }

  const mapa = new Map<string, PreguntaDisponible>();
  for (const { pregunta } of encuesta.preguntas) {
    if (!pregunta.codigo || pregunta.tipo === 'FOTO') {
      continue;
    }
    const opciones = new Set(
      pregunta.opciones.map((opcion) => opcion.codigo).filter((codigo): codigo is string => codigo !== null),
    );
    mapa.set(pregunta.codigo, { tipo: pregunta.tipo, opciones });
  }
  return mapa;
}

/**
 * Las reglas tienen que apuntar a preguntas y opciones que EXISTAN en la encuesta
 * activa. Una regla colgada no falla en runtime: el factor se queda sin aporte, se
 * renormaliza, y la criticidad baja sin que nadie se entere. Por eso se rechaza al
 * guardar, que es el unico momento en que hay alguien mirando.
 *
 * Si no hay encuesta activa no hay contra que validar y se deja pasar: el sistema
 * en ese estado tampoco puede recibir reportes.
 */
async function validarReglasContraEncuestaActiva(puntajes: PuntajesConfig): Promise<void> {
  const disponibles = await codigosDeEncuestaActiva();
  if (!disponibles) {
    return;
  }

  const problemas: string[] = [];

  const revisarPregunta = (preguntaCodigo: string, donde: string): PreguntaDisponible | null => {
    const pregunta = disponibles.get(preguntaCodigo);
    if (!pregunta) {
      problemas.push(`${donde}: la encuesta activa no tiene ninguna pregunta con codigo ${preguntaCodigo}.`);
      return null;
    }
    return pregunta;
  };

  for (const regla of puntajes.reglas) {
    const pregunta = revisarPregunta(regla.preguntaCodigo, `regla de ${regla.factor.toUpperCase()}`);
    if (!pregunta) {
      continue;
    }
    const { opciones } = pregunta;
    const desconocidas = Object.keys(regla.opciones).filter((codigo) => !opciones.has(codigo));
    if (desconocidas.length > 0) {
      problemas.push(
        `regla de ${regla.factor.toUpperCase()} (${regla.preguntaCodigo}): la pregunta no tiene las opciones ${desconocidas.join(', ')}.`,
      );
    }
  }

  for (const regla of puntajes.reglasEspeciales ?? []) {
    const donde = `regla especial "${regla.nombre}"`;
    const pregunta = revisarPregunta(regla.preguntaCodigo, donde);
    if (!pregunta) {
      continue;
    }
    const desconocidas = regla.opcionCodigos.filter((codigo) => !pregunta.opciones.has(codigo));
    if (desconocidas.length > 0) {
      problemas.push(
        `${donde} (${regla.preguntaCodigo}): la pregunta no tiene las opciones ${desconocidas.join(', ')}.`,
      );
    }
  }

  if (problemas.length > 0) {
    throw new BadRequestError(
      `La configuracion no coincide con la encuesta activa. ${problemas.join(' ')}`,
    );
  }

  // Recien con las referencias sanas tiene sentido medir el alcance: con una regla
  // colgada el numero no significaria nada.
  validarAlcanceDeFactores(puntajes, disponibles);
}

/**
 * Cada factor de cuestionario tiene que poder LLEGAR a `CRITICIDAD_MAX` con alguna
 * respuesta posible. Si su peor caso da 3, ese factor entra a la media ponderada con
 * su peso completo pero nunca puede llevar el reporte al rojo: el peso configurado
 * deja de significar lo que dice y el reporte mas grave posible queda subclasificado.
 * Nada falla en runtime, por eso se rechaza al guardar.
 *
 * Un factor SIN reglas no es un error: `evaluarReglas` lo deja en `null` y
 * `combinarFactores` renormaliza (es el estado de F5 hoy).
 */
function validarAlcanceDeFactores(
  puntajes: PuntajesConfig,
  disponibles: Map<string, PreguntaDisponible>,
): void {
  const tipos = new Map<string, TipoPreguntaPuntuable>(
    [...disponibles].map(([codigo, pregunta]) => [codigo, pregunta.tipo]),
  );

  // Los factores que aparecen en las reglas: los que no, estan apagados y no se
  // validan.
  const factores = [...new Set(puntajes.reglas.map((regla) => regla.factor))];
  const problemas: string[] = [];

  for (const factor of factores) {
    const reglas = puntajes.reglas.filter((regla) => regla.factor === factor);
    const modo = puntajes.factores?.[factor as FactorCuestionario]?.modo ?? 'suma';
    const alcance = alcanceDeFactor(reglas, modo, tipos);

    if (alcance !== null && alcance < CRITICIDAD_MAX) {
      problemas.push(
        `${factor.toUpperCase()} como maximo llega a ${alcance} de ${CRITICIDAD_MAX}: con esos puntajes ningun reporte puede alcanzar el tope del factor.`,
      );
    }
  }

  if (problemas.length > 0) {
    throw new BadRequestError(
      `Hay factores que no pueden llegar al maximo de la escala. ${problemas.join(' ')}`,
    );
  }
}

/**
 * Crea una NUEVA version de la configuracion (versionado inmutable, ERS §4.4):
 * desactiva las anteriores y activa la nueva, en una transaccion.
 */
export async function crearNuevaVersion(
  input: ActualizarConfiguracionBody,
  usuarioId: number,
): Promise<ConfiguracionDTO> {
  await validarReglasContraEncuestaActiva(input.puntajes as unknown as PuntajesConfig);

  const creada = await prisma.$transaction(async (tx) => {
    const ultima = await tx.configuracionCriticidad.findFirst({
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const nuevaVersion = (ultima?.version ?? 0) + 1;

    await tx.configuracionCriticidad.updateMany({ where: { activa: true }, data: { activa: false } });

    return tx.configuracionCriticidad.create({
      data: {
        version: nuevaVersion,
        pesos: input.pesos,
        puntajes: input.puntajes as Prisma.InputJsonValue,
        umbralesNivel: input.umbralesNivel,
        radioMetros: input.radioMetros,
        ventanaDias: input.ventanaDias,
        minReportes: input.minReportes,
        limitesAntiabuso: input.limitesAntiabuso,
        bonusVulnerable: input.bonusVulnerable,
        activa: true,
        usuarioCreacionId: usuarioId,
        usuarioActualizacionId: usuarioId,
      },
      include: INCLUDE_AUTOR,
    });
  });

  const dto = serializar(creada);

  registrarAuditoria({
    accion: 'CONFIGURACION_CRITICIDAD_VERSION_CREAR',
    entidadId: dto.id,
    descripcion: `Publico la version ${dto.version} de los parametros de criticidad`,
    // No hay `datosPrevios`: la version anterior NO se modifica (el versionado es
    // inmutable), sigue en la base y el panel la puede abrir por su propio id. Lo
    // que se guarda es que version quedo activa y cual dejo de estarlo.
    datosNuevos: {
      version: dto.version,
      pesos: dto.pesos,
      umbralesNivel: dto.umbralesNivel,
      radioMetros: dto.radioMetros,
      ventanaDias: dto.ventanaDias,
      minReportes: dto.minReportes,
      limitesAntiabuso: dto.limitesAntiabuso,
      bonusVulnerable: dto.bonusVulnerable,
    },
    metadatos: { versionAnterior: dto.version - 1 || null },
  });

  return dto;
}

/**
 * Estado operativo del sistema (solo lectura). Ver el aviso de `EstadoSistemaDTO`:
 * se enumeran campos uno por uno justamente para no filtrar secretos de `env`.
 */
export async function obtenerEstadoSistema(): Promise<EstadoSistemaDTO> {
  const [encuestaActiva, configActiva] = await prisma.$transaction([
    prisma.encuesta.findFirst({
      where: { activo: true },
      orderBy: { version: 'desc' },
      select: { id: true, version: true, nombre: true, fotosMin: true, fotosMax: true },
    }),
    prisma.configuracionCriticidad.findFirst({
      where: { activa: true },
      orderBy: { version: 'desc' },
      select: { id: true, version: true },
    }),
  ]);

  return {
    entorno: env.nodeEnv,
    // Lo setea npm al correr `npm run dev` / `npm start`; si se arranca node a
    // mano no existe, y no vale la pena leer package.json en runtime por esto.
    version: process.env.npm_package_version ?? 'desconocida',
    canales: {
      // WEB siempre esta habilitado: es el formulario del propio panel publico.
      web: true,
      telegram: env.telegramEnabled,
      // El enum `Canal` ya contempla WHATSAPP pero todavia no hay integracion.
      whatsapp: false,
    },
    ia: {
      modelo: env.openaiModel,
      cronExpr: env.evaluacionIaCronExpr,
      batchSize: env.evaluacionIaBatchSize,
      maxIntentos: env.evaluacionIaMaxIntentos,
    },
    encuestaActiva,
    configuracionActiva: configActiva,
  };
}

// --- Canales de salida: correo (SMTP) ---------------------------------------

/**
 * `ConfiguracionNotificacion` es una fila unica con `id` 1. Mientras nadie la
 * guardo no existe, y eso NO es un 404: el tab Sistema tiene que poder mostrar
 * el formulario vacio. Por eso la lectura cae a estos defaults.
 */
const NOTIFICACION_ID = 1;

const INCLUDE_EDITOR = {
  usuarioActualizacion: {
    select: {
      id: true,
      correoElectronico: true,
      persona: { select: { nombres: true, apellidos: true } },
    },
  },
} as const;

type NotificacionConEditor = Prisma.ConfiguracionNotificacionGetPayload<{
  include: typeof INCLUDE_EDITOR;
}>;

/**
 * Pasa la fila a DTO. Unico lugar donde se decide que sale por la API: `smtpSecreto`
 * se colapsa a un booleano y la contrasena cifrada no viaja nunca.
 */
function serializarNotificacion(config: NotificacionConEditor | null): ConfiguracionNotificacionDTO {
  const editor = config?.usuarioActualizacion;

  return {
    smtpHabilitado: config?.smtpHabilitado ?? false,
    smtpHost: config?.smtpHost ?? '',
    smtpPuerto: config?.smtpPuerto ?? 587,
    smtpSeguridad: config?.smtpSeguridad ?? 'STARTTLS',
    smtpUsuario: config?.smtpUsuario ?? '',
    tieneContrasena: Boolean(config?.smtpSecreto),
    cifradoDisponible: cifradoDisponible(),
    // Calculado, no editable desde aca: el remitente se configura en Webhooks y
    // cae a `smtpUsuario` si esta vacio (ver `email.service.ts`).
    remitenteEfectivo: config?.remitenteCorreo || config?.smtpUsuario || '',
    actualizadoPor: editor
      ? {
          id: editor.id,
          nombreCompleto: `${editor.persona.nombres} ${editor.persona.apellidos}`.trim(),
          correoElectronico: editor.correoElectronico,
        }
      : null,
    fechaActualizacion: config ? config.fechaActualizacion.toISOString() : null,
  };
}

export async function obtenerNotificaciones(): Promise<ConfiguracionNotificacionDTO> {
  const config = await prisma.configuracionNotificacion.findUnique({
    where: { id: NOTIFICACION_ID },
    include: INCLUDE_EDITOR,
  });

  return serializarNotificacion(config);
}

/**
 * Guarda la config del canal de correo. A diferencia del motor de criticidad, NO
 * versiona: sobrescribe la fila unica y deja constancia de quien la toco.
 *
 * El tratamiento de `smtpContrasena` es la parte delicada:
 *   - `undefined` (campo ausente) -> se conserva la guardada. Es el caso normal,
 *     porque el panel no puede reenviar una contrasena que la API nunca le dio.
 *   - `null`                      -> se borra (SMTP sin autenticacion).
 *   - string                      -> se cifra y reemplaza.
 */
export async function guardarNotificaciones(
  input: ActualizarNotificacionBody,
  usuarioId: number,
): Promise<ConfiguracionNotificacionDTO> {
  const previo = await obtenerNotificaciones();

  let secreto: string | null | undefined;

  if (input.smtpContrasena === null) {
    secreto = null;
  } else if (typeof input.smtpContrasena === 'string') {
    try {
      secreto = cifrar(input.smtpContrasena);
    } catch (err) {
      // Sin CONFIG_ENCRYPTION_KEY no se guarda en claro: se rechaza el guardado.
      if (err instanceof ClaveCifradoAusenteError) {
        throw new BadRequestError(err.message);
      }
      throw err;
    }
  }

  // Solo columnas de TRANSPORTE: `remitente*` lo escribe el modulo de webhooks
  // sobre esta misma fila. Tocar aca esos campos pisaria la otra pantalla.
  const datos = {
    smtpHabilitado: input.smtpHabilitado,
    smtpHost: input.smtpHost,
    smtpPuerto: input.smtpPuerto,
    smtpSeguridad: input.smtpSeguridad,
    smtpUsuario: input.smtpUsuario,
    usuarioActualizacionId: usuarioId,
    // `undefined` le dice a Prisma "no toques esta columna"; `null` la limpia.
    ...(secreto === undefined ? {} : { smtpSecreto: secreto }),
  };

  const guardada = await prisma.configuracionNotificacion.upsert({
    where: { id: NOTIFICACION_ID },
    update: datos,
    create: { id: NOTIFICACION_ID, ...datos },
    include: INCLUDE_EDITOR,
  });


  const dto = serializarNotificacion(guardada);

  registrarAuditoria({
    accion: 'CONFIGURACION_SISTEMA_EDITAR',
    entidadId: NOTIFICACION_ID,
    descripcion: dto.smtpHabilitado
      ? `Configuro el envio de correos por ${dto.smtpHost}:${dto.smtpPuerto}`
      : 'Desactivo el envio de correos',
    // Los DTO ya devuelven `tieneContrasena` en vez de la contrasena (ver el
    // gotcha de secretos configurables en CLAUDE.md), asi que son seguros de
    // guardar enteros.
    datosPrevios: previo,
    datosNuevos: dto,
    metadatos: {
      // Tres estados del secreto: ausente = se conservo, null = se borro, string
      // = se reemplazo. El valor no se guarda nunca; que haya cambiado, si.
      cambioContrasena: input.smtpContrasena !== undefined,
      borroContrasena: input.smtpContrasena === null,
    },
  });

  return dto;
}

/**
 * Prueba la configuracion de punta a punta: handshake + TLS + autenticacion
 * (`verificarConexion`) y despues un mensaje real al destinatario indicado. Sin
 * esto la config seria "a ciegas" hasta que falle el primer envio de verdad.
 *
 * Cualquier fallo del servidor SMTP se traduce a 502: la request estaba bien, el
 * que fallo es un tercero. El mensaje del servidor se devuelve tal cual porque es
 * justamente el dato que el ADMIN necesita para corregir ("535 auth failed",
 * "ENOTFOUND", "self-signed certificate"...).
 */
export async function enviarCorreoPrueba(destinatario: string): Promise<ResultadoPruebaCorreoDTO> {
  const inicio = Date.now();

  try {
    await verificarConexion();
    await enviarCorreo({
      para: destinatario,
      asunto: 'AGUARD — prueba de configuracion de correo',
      texto: [
        'Este es un correo de prueba enviado desde el panel de AGUARD.',
        '',
        'Si lo estas leyendo, el servidor SMTP configurado en Configuracion > Sistema funciona.',
        `Enviado el ${new Date().toLocaleString('es-PY')}.`,
      ].join('\n'),
    });
  } catch (err) {
    // Un error de configuracion incompleta ya viene como AppError desde
    // `email.service`; ese se deja pasar tal cual (es 400, no 502).
    if (err instanceof BadRequestError) {
      throw err;
    }
    // Falta la clave maestra: la contrasena guardada no se puede descifrar. Es un
    // problema de nuestra configuracion, no del servidor de correo.
    if (err instanceof ClaveCifradoAusenteError) {
      throw new BadRequestError(err.message);
    }
    const detalle = err instanceof Error ? err.message : 'error desconocido';
    // Se audita tambien el fallo: un envio de prueba manda un correo real a una
    // direccion que eligio un usuario, y el motivo del rechazo es lo que despues
    // explica por que el canal estuvo caido.
    registrarAuditoria({
      accion: 'CONFIGURACION_SISTEMA_CORREO_PRUEBA',
      entidadId: NOTIFICACION_ID,
      descripcion: `Intento enviar un correo de prueba a ${destinatario} y fallo`,
      exito: false,
      metadatos: { destinatario, detalle, duracionMs: Date.now() - inicio },
    });
    throw new BadGatewayError(`El servidor de correo rechazo el envio: ${detalle}`);
  }

  const duracionMs = Date.now() - inicio;

  registrarAuditoria({
    accion: 'CONFIGURACION_SISTEMA_CORREO_PRUEBA',
    entidadId: NOTIFICACION_ID,
    descripcion: `Envio un correo de prueba a ${destinatario}`,
    metadatos: { destinatario, duracionMs },
  });

  return { destinatario, duracionMs };
}
