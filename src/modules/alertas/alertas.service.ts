import { EstadoAlerta, EstadoEvaluacionIa, Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { distanciaHaversineMetros } from '../../shared/utils/geo';
import { ParametrosGeo, obtenerParametrosGeo } from '../../shared/services/config-geo.service';
import { BadRequestError, ConflictError, NotFoundError } from '../../shared/utils/errors';
import { esTransicionValida, etiquetaEstado } from './alertas.estado';
import {
  AlertaDetalleDTO,
  AlertaListItemDTO,
  AlertaReporteDTO,
  AlertasListadoDTO,
  OrigenAlerta,
  UbicacionAlerta,
} from './alertas.types';
import { ListarAlertasQuery } from './alertas.validation';
import { resumirSeguimiento } from './alertas.seguimiento.service';
import { emitir } from '../webhooks/webhooks.despachador';
import { registrarAuditoria } from '../auditoria/auditoria.registro';
import {
  contextoAlertaCreada,
  contextoAlertaEscalada,
  contextoAlertaEstadoCambiado,
  DatosAlerta,
} from '../webhooks/webhooks.payloads';

/** Nivel a partir del cual un reporte/punto genera alerta (ERS §5.3, §5.4). */
export const NIVEL_MINIMO_ALERTA = 2;

const ESTADOS_ACTIVOS: EstadoAlerta[] = [EstadoAlerta.NUEVA, EstadoAlerta.EN_REVISION];

const MS_POR_DIA = 24 * 60 * 60 * 1000;

/** Pasa una alerta (+ el contexto que trae el llamador) a los datos del webhook. */
function datosWebhook(
  alerta: { id: number; nivel: number; motivo: string; estado: EstadoAlerta },
  u: UbicacionAlerta,
): DatosAlerta {
  return {
    id: alerta.id,
    nivel: alerta.nivel,
    motivo: alerta.motivo,
    estado: alerta.estado,
    latitud: u.latitud,
    longitud: u.longitud,
    origen: u.puntoCriticoId != null ? 'PUNTO_CRITICO' : 'REPORTE',
    reporteCodigoPublico: u.reporteCodigoPublico ?? null,
    puntoCriticoId: u.puntoCriticoId ?? null,
    ubicacion: u.ubicacionLegible ?? null,
  };
}

/**
 * Crea una alerta para una ubicacion o, si ya hay una alerta ACTIVA dentro del
 * radio y la ventana (ERS §5.4, deduplicacion), la actualiza (nivel = maximo,
 * motivo) sin duplicar. Si la ubicacion corresponde a un punto critico y la
 * alerta encontrada aun no lo referencia, se consolida el vinculo hacia el punto.
 * No lanza: se ejecuta en el pipeline post-reporte y no debe romperlo.
 */
/** Etiqueta del actor SISTEMA para todo lo que escribe el pipeline post-reporte. */
const ACTOR_PIPELINE = 'pipeline-criticidad';

export async function sincronizarAlerta(u: UbicacionAlerta, params: ParametrosGeo): Promise<void> {
  try {
    const existente = await buscarAlertaActivaCercana(
      u.latitud,
      u.longitud,
      params.radioMetros,
      params.ventanaDias,
    );

    if (existente) {
      const consolidarPunto = u.puntoCriticoId != null && existente.puntoCriticoId == null;
      const nivelNuevo = Math.max(existente.nivel, u.nivel);
      const actualizada = await prisma.alerta.update({
        where: { id: existente.id },
        data: {
          nivel: nivelNuevo,
          motivo: u.motivo,
          ...(consolidarPunto ? { puntoCriticoId: u.puntoCriticoId, reporteId: null } : {}),
        },
      });

      // Solo si realmente ESCALO. La deduplicacion tambien entra por aca cuando
      // llega otro reporte del mismo nivel o menor, y avisar en ese caso seria
      // ruido: nada empeoro.
      if (nivelNuevo > existente.nivel) {
        void emitir(contextoAlertaEscalada(datosWebhook(actualizada, u), existente.nivel));
        // Solo la escalada se audita, con el mismo criterio que el webhook: la
        // deduplicacion que no sube el nivel es el caso NORMAL (llega otro reporte
        // de la misma cuadra) y anotarla llenaria la bitacora de filas donde no
        // cambio nada.
        registrarAuditoria({
          accion: 'ALERTA_ESCALAR',
          entidadId: actualizada.id,
          descripcion: `La alerta #${actualizada.id} escalo de nivel ${existente.nivel} a ${nivelNuevo}`,
          actor: { tipo: 'SISTEMA', etiqueta: ACTOR_PIPELINE },
          datosPrevios: { nivel: existente.nivel, motivo: existente.motivo },
          datosNuevos: { nivel: nivelNuevo, motivo: actualizada.motivo },
          metadatos: { reporteCodigoPublico: u.reporteCodigoPublico ?? null },
        });
      }
      return;
    }

    const creada = await prisma.alerta.create({
      data: {
        // reporteId XOR puntoCriticoId (ERS §4.4): si viene punto, prevalece.
        reporteId: u.puntoCriticoId != null ? null : u.reporteId ?? null,
        puntoCriticoId: u.puntoCriticoId ?? null,
        nivel: u.nivel,
        estado: EstadoAlerta.NUEVA,
        motivo: u.motivo,
      },
    });

    // `void`: no se espera la entrega. Un SMTP lento o una URL caida no pueden
    // sumarse al tiempo del pipeline post-reporte, y `emitir` nunca tira.
    void emitir(contextoAlertaCreada(datosWebhook(creada, u)));

    // Actor SISTEMA: la alerta la genera el pipeline post-reporte, no una persona.
    // El reporte que la disparo queda en los metadatos por `codigoPublico`, que no
    // es PII (el telefono si lo seria).
    registrarAuditoria({
      accion: 'ALERTA_CREAR',
      entidadId: creada.id,
      descripcion: `Se genero la alerta #${creada.id} de nivel ${creada.nivel}`,
      actor: { tipo: 'SISTEMA', etiqueta: ACTOR_PIPELINE },
      datosNuevos: {
        id: creada.id,
        nivel: creada.nivel,
        estado: creada.estado,
        motivo: creada.motivo,
        origen: u.puntoCriticoId != null ? 'PUNTO_CRITICO' : 'REPORTE',
        reporteCodigoPublico: u.reporteCodigoPublico ?? null,
        puntoCriticoId: u.puntoCriticoId ?? null,
        ubicacion: u.ubicacionLegible ?? null,
      },
    });
  } catch (err) {
    console.error('[alertas] Error sincronizando alerta', err);
  }
}

/**
 * Genera (o deduplica) una alerta a partir de un reporte que alcanzo Nivel >= 2.
 * El motivo no incluye PII (usa `codigoPublico`, no el telefono).
 */
export async function generarAlertaDeReporte(reporteId: number, params: ParametrosGeo): Promise<void> {
  try {
    const reporte = await prisma.reporte.findUnique({
      where: { id: reporteId },
      select: {
        id: true,
        codigoPublico: true,
        latitud: true,
        longitud: true,
        nivelPreliminar: true,
        criticidad: true,
        // Solo para el payload del webhook: el aviso es mucho mas util con la
        // ubicacion legible que con un par de coordenadas.
        departamento: true,
        distrito: true,
        barrio: true,
      },
    });

    if (!reporte || reporte.nivelPreliminar == null || reporte.nivelPreliminar < NIVEL_MINIMO_ALERTA) {
      return;
    }

    const criticidadTexto =
      reporte.criticidad != null ? ` (criticidad ${Number(reporte.criticidad).toFixed(2)})` : '';
    const motivo = `Reporte ${reporte.codigoPublico} alcanzo Nivel ${reporte.nivelPreliminar}${criticidadTexto}.`;

    const ubicacionLegible =
      [reporte.barrio, reporte.distrito, reporte.departamento].filter(Boolean).join(', ') || null;

    await sincronizarAlerta(
      {
        latitud: reporte.latitud,
        longitud: reporte.longitud,
        nivel: reporte.nivelPreliminar,
        motivo,
        reporteId: reporte.id,
        reporteCodigoPublico: reporte.codigoPublico,
        ubicacionLegible,
      },
      params,
    );
  } catch (err) {
    console.error(`[alertas] Error generando alerta del reporte ${reporteId}`, err);
  }
}

/**
 * Transiciona el estado de una alerta validando la maquina de estados (ERS §5.4)
 * y registrando un `CambioEstadoAlerta` (auditoria). A diferencia del pipeline
 * automatico, esta operacion es a pedido de un usuario: LANZA ante entradas
 * invalidas para que el controller devuelva 4xx.
 */
export async function cambiarEstadoAlerta(
  alertaId: number,
  estadoNuevo: EstadoAlerta,
  usuarioId: number,
  observacion?: string,
) {
  const alerta = await prisma.alerta.findUnique({ where: { id: alertaId } });
  if (!alerta) {
    throw new NotFoundError('No encontramos esa alerta.');
  }
  if (alerta.estado === estadoNuevo) {
    throw new BadRequestError('La alerta ya se encuentra en ese estado.');
  }
  if (!esTransicionValida(alerta.estado, estadoNuevo)) {
    throw new ConflictError(
      `Una alerta en "${etiquetaEstado(alerta.estado)}" no puede pasar a "${etiquetaEstado(estadoNuevo)}".`,
    );
  }

  const actualizada = await prisma.$transaction(async (tx) => {
    const resultado = await tx.alerta.update({
      where: { id: alertaId },
      data: { estado: estadoNuevo },
    });
    await tx.cambioEstadoAlerta.create({
      data: {
        alertaId,
        estadoAnterior: alerta.estado,
        estadoNuevo,
        usuarioId,
        observacion: observacion ?? null,
      },
    });
    return resultado;
  });

  // Fuera de la transaccion: el aviso no debe poder abortar el cambio de estado ni
  // mantener la transaccion abierta mientras se habla con un SMTP o una URL.
  void notificarCambioEstado(actualizada, alerta.estado, usuarioId, observacion ?? null);

  // El `CambioEstadoAlerta` de la transaccion es la trazabilidad del DOMINIO (lo
  // que el panel muestra en la linea de tiempo de la alerta). Esta entrada es la
  // de AUDITORIA: suma IP, user-agent y actor, y vive en la misma bitacora que
  // todo lo demas. Son dos cosas distintas con la misma fuente, no un duplicado.
  registrarAuditoria({
    accion: 'ALERTA_ESTADO_CAMBIAR',
    entidadId: alertaId,
    descripcion: `Paso la alerta #${alertaId} de "${etiquetaEstado(alerta.estado)}" a "${etiquetaEstado(estadoNuevo)}"`,
    datosPrevios: { estado: alerta.estado },
    datosNuevos: { estado: estadoNuevo },
    // La observacion es texto libre que escribio el analista: es parte de la
    // decision y por eso se guarda, saneada como todo lo demas.
    metadatos: { observacion: observacion ?? null, nivel: alerta.nivel },
  });

  return actualizada;
}

/**
 * Emision del evento de cambio de estado. Necesita datos que el update no devuelve
 * (el nombre del analista, la ubicacion del reporte de origen), asi que consulta por
 * su cuenta. Separada en su propia funcion para no ensuciar la operacion de dominio
 * y porque, al ir con `void`, cualquier error suyo tiene que morir aca adentro.
 */
async function notificarCambioEstado(
  alerta: { id: number; nivel: number; motivo: string; estado: EstadoAlerta; reporteId: number | null; puntoCriticoId: number | null },
  estadoAnterior: EstadoAlerta,
  usuarioId: number,
  observacion: string | null,
): Promise<void> {
  try {
    const [usuario, reporte, punto] = await Promise.all([
      prisma.usuario.findUnique({
        where: { id: usuarioId },
        select: { persona: { select: { nombres: true, apellidos: true } } },
      }),
      alerta.reporteId
        ? prisma.reporte.findUnique({
            where: { id: alerta.reporteId },
            select: {
              codigoPublico: true,
              latitud: true,
              longitud: true,
              departamento: true,
              distrito: true,
              barrio: true,
            },
          })
        : Promise.resolve(null),
      alerta.puntoCriticoId
        ? prisma.puntoCritico.findUnique({
            where: { id: alerta.puntoCriticoId },
            select: { latitudCentro: true, longitudCentro: true },
          })
        : Promise.resolve(null),
    ]);

    const analista = usuario
      ? `${usuario.persona.nombres} ${usuario.persona.apellidos}`.trim()
      : 'usuario desconocido';

    void emitir(
      contextoAlertaEstadoCambiado(
        {
          id: alerta.id,
          nivel: alerta.nivel,
          motivo: alerta.motivo,
          estado: alerta.estado,
          latitud: reporte?.latitud ?? punto?.latitudCentro ?? 0,
          longitud: reporte?.longitud ?? punto?.longitudCentro ?? 0,
          origen: alerta.puntoCriticoId != null ? 'PUNTO_CRITICO' : 'REPORTE',
          reporteCodigoPublico: reporte?.codigoPublico ?? null,
          puntoCriticoId: alerta.puntoCriticoId,
          ubicacion:
            [reporte?.barrio, reporte?.distrito, reporte?.departamento].filter(Boolean).join(', ') || null,
        },
        { estadoAnterior, estadoNuevo: alerta.estado, observacion, analista },
      ),
    );
  } catch (err) {
    console.error(`[alertas] Error notificando el cambio de estado de la alerta ${alerta.id}`, err);
  }
}

export async function listarAlertas(filtros: ListarAlertasQuery): Promise<AlertasListadoDTO> {
  const where: Prisma.AlertaWhereInput = {};
  if (filtros.estado) {
    where.estado = filtros.estado;
  } else if (filtros.activas) {
    where.estado = { in: ESTADOS_ACTIVOS };
  }
  if (filtros.nivel !== undefined) {
    where.nivel = filtros.nivel;
  }
  if (filtros.desde || filtros.hasta) {
    where.fechaCreacion = { gte: filtros.desde, lte: filtros.hasta };
  }

  const { page, pageSize } = filtros;
  const [total, alertas] = await prisma.$transaction([
    prisma.alerta.count({ where }),
    prisma.alerta.findMany({
      where,
      orderBy: [{ nivel: 'desc' }, { fechaCreacion: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        reporte: { select: { id: true, codigoPublico: true, latitud: true, longitud: true } },
        puntoCritico: {
          select: { id: true, latitudCentro: true, longitudCentro: true, cantidadReportes: true },
        },
      },
    }),
  ]);

  const items: AlertaListItemDTO[] = alertas.map((a) => ({
    id: a.id,
    nivel: a.nivel,
    estado: a.estado,
    motivo: a.motivo,
    fechaCreacion: a.fechaCreacion,
    fechaActualizacion: a.fechaActualizacion,
    reporte: a.reporte,
    puntoCritico: a.puntoCritico,
  }));

  return {
    items,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/**
 * Detalle de una alerta con los reportes que la componen (RF-17). El grupo son
 * los reportes dentro del area y la ventana de la alerta:
 *
 *  - Origen PUNTO_CRITICO: centro/radio/ventana son los del propio `PuntoCritico`,
 *    es decir exactamente el grupo que lo consolido (ERS §5.5).
 *  - Origen REPORTE: centro = el reporte, radio/ventana = los parametros geo
 *    vigentes. Incluye a los vecinos porque la alerta pudo deduplicar reportes
 *    posteriores dentro de ese mismo radio (ERS §5.4), y el analista necesita
 *    verlos para decidir.
 *
 * Los reportes se numeran 1..N por fecha ascendente (`orden`): ese numero es el
 * pin del mapa y no cambia entre llamadas mientras no entren reportes nuevos.
 */
export async function obtenerAlertaDetalle(alertaId: number): Promise<AlertaDetalleDTO> {
  const alerta = await prisma.alerta.findUnique({
    where: { id: alertaId },
    include: {
      reporte: { select: { id: true, codigoPublico: true, latitud: true, longitud: true, fechaCreacion: true } },
      puntoCritico: true,
    },
  });

  if (!alerta) {
    throw new NotFoundError('No encontramos esa alerta.');
  }

  const params = await obtenerParametrosGeo();

  let origen: OrigenAlerta | null = null;
  let centro: { latitud: number; longitud: number } | null = null;
  let radioMetros = params.radioMetros;
  let ventanaInicio: Date | null = null;
  let ventanaFin: Date | null = null;

  if (alerta.puntoCritico) {
    origen = 'PUNTO_CRITICO';
    centro = { latitud: alerta.puntoCritico.latitudCentro, longitud: alerta.puntoCritico.longitudCentro };
    radioMetros = alerta.puntoCritico.radioMetros;
    ventanaInicio = alerta.puntoCritico.ventanaInicio;
    ventanaFin = alerta.puntoCritico.ventanaFin;
  } else if (alerta.reporte) {
    origen = 'REPORTE';
    centro = { latitud: alerta.reporte.latitud, longitud: alerta.reporte.longitud };
    ventanaInicio = new Date(alerta.reporte.fechaCreacion.getTime() - params.ventanaDias * MS_POR_DIA);
    // Hasta la ultima vez que la alerta se toco: la deduplicacion la actualiza.
    ventanaFin = alerta.fechaActualizacion;
  }

  const reportes =
    centro && ventanaInicio && ventanaFin
      ? await reportesDelArea(centro, radioMetros, ventanaInicio, ventanaFin, alerta.reporteId)
      : [];

  // Contadores de las pestañas del modal (comentarios, archivos, tareas). Van
  // aca para que abrir una alerta siga siendo UNA request.
  const seguimiento = await resumirSeguimiento(alertaId);

  return {
    id: alerta.id,
    nivel: alerta.nivel,
    estado: alerta.estado,
    motivo: alerta.motivo,
    fechaCreacion: alerta.fechaCreacion,
    fechaActualizacion: alerta.fechaActualizacion,
    seguimiento,
    origen,
    centro,
    radioMetros,
    ventanaInicio,
    ventanaFin,
    reporte: alerta.reporte
      ? {
          id: alerta.reporte.id,
          codigoPublico: alerta.reporte.codigoPublico,
          latitud: alerta.reporte.latitud,
          longitud: alerta.reporte.longitud,
        }
      : null,
    puntoCritico: alerta.puntoCritico
      ? {
          id: alerta.puntoCritico.id,
          latitudCentro: alerta.puntoCritico.latitudCentro,
          longitudCentro: alerta.puntoCritico.longitudCentro,
          radioMetros: alerta.puntoCritico.radioMetros,
          cantidadReportes: alerta.puntoCritico.cantidadReportes,
          nivel: alerta.puntoCritico.nivel,
          estado: alerta.puntoCritico.estado,
          ventanaInicio: alerta.puntoCritico.ventanaInicio,
          ventanaFin: alerta.puntoCritico.ventanaFin,
        }
      : null,
    reportes,
  };
}

/**
 * Reportes dentro del circulo (Haversine en SQL, ERS §4.6) y de la ventana.
 *
 * OJO con el reparto de responsabilidades: el SQL crudo hace SOLO el filtro
 * geografico y la distancia. La ventana temporal la filtra Prisma a proposito:
 * pasar un `Date` como parametro de `$queryRaw` contra una columna `timestamp`
 * (sin zona) lo desplaza segun el timezone de la sesion de Postgres
 * (America/Asuncion) y recorta el grupo; el query builder de Prisma no. Mover
 * el `fechaCreacion` de vuelta al SQL crudo reintroduce ese bug.
 */
async function reportesDelArea(
  centro: { latitud: number; longitud: number },
  radioMetros: number,
  ventanaInicio: Date,
  ventanaFin: Date,
  reporteOrigenId: number | null,
): Promise<AlertaReporteDTO[]> {
  const filas = await prisma.$queryRaw<{ id: number; distancia: number }[]>`
    SELECT id,
           ROUND((6371000 * 2 * ASIN(SQRT(
             POWER(SIN(RADIANS(latitud - ${centro.latitud}) / 2), 2) +
             COS(RADIANS(${centro.latitud})) * COS(RADIANS(latitud)) *
             POWER(SIN(RADIANS(longitud - ${centro.longitud}) / 2), 2)
           )))::numeric)::int AS distancia
    FROM "Reporte"
    WHERE 6371000 * 2 * ASIN(SQRT(
            POWER(SIN(RADIANS(latitud - ${centro.latitud}) / 2), 2) +
            COS(RADIANS(${centro.latitud})) * COS(RADIANS(latitud)) *
            POWER(SIN(RADIANS(longitud - ${centro.longitud}) / 2), 2)
          )) <= ${radioMetros}
  `;

  if (filas.length === 0) {
    return [];
  }

  const distanciaPorId = new Map(filas.map((f) => [f.id, Number(f.distancia)]));

  // Orden por fecha ascendente: define la numeracion de los pines (`orden`).
  const reportes = await prisma.reporte.findMany({
    where: {
      id: { in: filas.map((f) => f.id) },
      fechaCreacion: { gte: ventanaInicio, lte: ventanaFin },
    },
    orderBy: { fechaCreacion: 'asc' },
    select: {
      id: true,
      codigoPublico: true,
      canal: true,
      fechaCreacion: true,
      latitud: true,
      longitud: true,
      nivelPreliminar: true,
      criticidad: true,
      evaluacionIa: { select: { estado: true, riesgoScore: true, resumen: true } },
      respuestas: { where: { archivos: { some: {} } }, take: 1, select: { id: true } },
    },
  });

  return reportes.map((reporte, indice) => {
    const evaluacion = reporte.evaluacionIa;
    return {
      orden: indice + 1,
      id: reporte.id,
      codigoPublico: reporte.codigoPublico,
      canal: reporte.canal,
      fecha: reporte.fechaCreacion,
      latitud: reporte.latitud,
      longitud: reporte.longitud,
      nivelPreliminar: reporte.nivelPreliminar,
      criticidad: reporte.criticidad == null ? null : Number(reporte.criticidad),
      estadoAnalisis: evaluacion?.estado ?? EstadoEvaluacionIa.PENDIENTE,
      riesgoScore: evaluacion?.riesgoScore ?? null,
      // El resumen solo tiene sentido con el analisis cerrado.
      resumenIa: evaluacion?.estado === EstadoEvaluacionIa.COMPLETADO ? evaluacion.resumen : null,
      tieneFotos: reporte.respuestas.length > 0,
      distanciaMetros: distanciaPorId.get(reporte.id) ?? 0,
      esOrigen: reporte.id === reporteOrigenId,
    };
  });
}

async function buscarAlertaActivaCercana(
  latitud: number,
  longitud: number,
  radioMetros: number,
  ventanaDias: number,
) {
  const desde = new Date(Date.now() - ventanaDias * 24 * 60 * 60 * 1000);

  const activas = await prisma.alerta.findMany({
    where: { estado: { in: ESTADOS_ACTIVOS }, fechaCreacion: { gte: desde } },
    include: {
      reporte: { select: { latitud: true, longitud: true } },
      puntoCritico: { select: { latitudCentro: true, longitudCentro: true } },
    },
  });

  for (const alerta of activas) {
    const loc = alerta.reporte
      ? { lat: alerta.reporte.latitud, lng: alerta.reporte.longitud }
      : alerta.puntoCritico
        ? { lat: alerta.puntoCritico.latitudCentro, lng: alerta.puntoCritico.longitudCentro }
        : null;

    if (loc && distanciaHaversineMetros(latitud, longitud, loc.lat, loc.lng) <= radioMetros) {
      return alerta;
    }
  }

  return null;
}
