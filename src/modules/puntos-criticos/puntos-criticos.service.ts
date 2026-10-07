import { EstadoPuntoCritico, Prisma, PuntoCritico } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { registrarAuditoria } from '../auditoria/auditoria.registro';
import { ParametrosGeo } from '../../shared/services/config-geo.service';
import { NIVEL_MINIMO_ALERTA, sincronizarAlerta } from '../alertas/alertas.service';
import { emitir } from '../webhooks/webhooks.despachador';
import { contextoPuntoCritico } from '../webhooks/webhooks.payloads';
import { ListarPuntosCriticosQuery } from './puntos-criticos.validation';
import {
  PuntoCercano,
  PuntoCriticoListItemDTO,
  PuntosCriticosListadoDTO,
  ReporteEnGrupo,
} from './puntos-criticos.types';

/**
 * Evalua si un reporte consolida un punto critico (ERS §5.5): cuenta los reportes
 * en el radio y ventana configurados (Haversine, ERS §4.6) y, si alcanzan
 * `minReportes`, crea o actualiza un `PuntoCritico` (centro = centroide del grupo,
 * `cantidadReportes`, nivel = maximo del grupo) y sincroniza su alerta consolidada.
 * No lanza: corre en el pipeline post-reporte.
 */
export async function evaluarPuntoCritico(reporteId: number, params: ParametrosGeo): Promise<void> {
  try {
    const { radioMetros, ventanaDias, minReportes } = params;

    const reporte = await prisma.reporte.findUnique({
      where: { id: reporteId },
      select: { latitud: true, longitud: true },
    });
    if (!reporte) {
      return;
    }

    const grupo = await reportesEnRadioVentana(
      reporte.latitud,
      reporte.longitud,
      radioMetros,
      ventanaDias,
    );

    if (grupo.length < minReportes) {
      return;
    }

    const latitudCentro = promedio(grupo.map((r) => r.latitud));
    const longitudCentro = promedio(grupo.map((r) => r.longitud));
    const nivel = Math.max(...grupo.map((r) => r.nivel ?? 0));
    const fechas = grupo.map((r) => r.fecha.getTime());
    const ventanaInicio = new Date(Math.min(...fechas));
    const ventanaFin = new Date(Math.max(...fechas));

    const existente = await buscarPuntoActivoCercano(latitudCentro, longitudCentro, radioMetros);

    let punto: PuntoCritico;
    // Se guarda para saber si el punto realmente escalo: un punto que ya existia y
    // no cambio no es noticia.
    const nivelPrevio = existente?.nivel ?? null;
    const cantidadPrevia = existente?.cantidad ?? null;
    if (existente) {
      // Escalar, nunca retroceder (RF-16): la cantidad y el nivel no bajan, y el
      // centroide solo se mueve si el grupo actual aporta al menos tanta evidencia
      // como la registrada (evita que un reporte aislado en el borde corra/encoja
      // el punto). La ventana se extiende para cubrir ambos rangos.
      const grupoAportaMasEvidencia = grupo.length >= existente.cantidad;
      punto = await prisma.puntoCritico.update({
        where: { id: existente.id },
        data: {
          latitudCentro: grupoAportaMasEvidencia ? latitudCentro : existente.lat,
          longitudCentro: grupoAportaMasEvidencia ? longitudCentro : existente.lng,
          radioMetros,
          cantidadReportes: Math.max(existente.cantidad, grupo.length),
          nivel: Math.max(existente.nivel, nivel),
          ventanaInicio: new Date(Math.min(existente.inicio.getTime(), ventanaInicio.getTime())),
          ventanaFin: new Date(Math.max(existente.fin.getTime(), ventanaFin.getTime())),
        },
      });
    } else {
      punto = await prisma.puntoCritico.create({
        data: {
          latitudCentro,
          longitudCentro,
          radioMetros,
          cantidadReportes: grupo.length,
          nivel,
          estado: EstadoPuntoCritico.ACTIVO,
          ventanaInicio,
          ventanaFin,
        },
      });
    }

    // Punto nuevo, o uno existente que subio de nivel o sumo reportes. Si nada
    // cambio no se emite: el job corre por cada reporte y avisaria de lo mismo
    // una y otra vez.
    const esNovedad =
      nivelPrevio == null ||
      punto.nivel > nivelPrevio ||
      punto.cantidadReportes > (cantidadPrevia ?? 0);

    if (esNovedad) {
      // Mismo criterio que el webhook: solo la NOVEDAD. El job corre por cada
      // reporte y un punto que no cambio volveria a anotarse una y otra vez.
      registrarAuditoria({
        accion: 'PUNTO_CRITICO_CONSOLIDAR',
        entidadId: punto.id,
        descripcion:
          nivelPrevio == null
            ? `Se consolido el punto critico #${punto.id} con ${punto.cantidadReportes} reportes (nivel ${punto.nivel})`
            : `El punto critico #${punto.id} paso a ${punto.cantidadReportes} reportes (nivel ${punto.nivel})`,
        actor: { tipo: 'SISTEMA', etiqueta: 'pipeline-criticidad' },
        ...(nivelPrevio == null
          ? {}
          : { datosPrevios: { nivel: nivelPrevio, cantidadReportes: cantidadPrevia } }),
        datosNuevos: {
          nivel: punto.nivel,
          cantidadReportes: punto.cantidadReportes,
          radioMetros: punto.radioMetros,
          latitudCentro: punto.latitudCentro,
          longitudCentro: punto.longitudCentro,
        },
        metadatos: { reporteDisparador: reporteId, reportesEnElGrupo: grupo.length },
      });

      void emitir(
        contextoPuntoCritico({
          id: punto.id,
          nivel: punto.nivel,
          cantidadReportes: punto.cantidadReportes,
          radioMetros: punto.radioMetros,
          latitudCentro: punto.latitudCentro,
          longitudCentro: punto.longitudCentro,
          ventanaInicio: punto.ventanaInicio,
          ventanaFin: punto.ventanaFin,
        }),
      );
    }

    if (punto.nivel >= NIVEL_MINIMO_ALERTA) {
      await sincronizarAlerta(
        {
          latitud: punto.latitudCentro,
          longitud: punto.longitudCentro,
          nivel: punto.nivel,
          motivo: `Punto critico con ${punto.cantidadReportes} reportes en ${radioMetros} m (Nivel ${punto.nivel}).`,
          puntoCriticoId: punto.id,
        },
        params,
      );
    }
  } catch (err) {
    console.error(`[puntos-criticos] Error evaluando el reporte ${reporteId}`, err);
  }
}

export async function listarPuntosCriticos(
  filtros: ListarPuntosCriticosQuery,
): Promise<PuntosCriticosListadoDTO> {
  const where: Prisma.PuntoCriticoWhereInput = {};
  if (filtros.estado) {
    where.estado = filtros.estado;
  }

  const { page, pageSize } = filtros;
  const [total, puntos] = await prisma.$transaction([
    prisma.puntoCritico.count({ where }),
    prisma.puntoCritico.findMany({
      where,
      orderBy: [{ nivel: 'desc' }, { fechaActualizacion: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  const items: PuntoCriticoListItemDTO[] = puntos.map((p) => ({
    id: p.id,
    latitudCentro: p.latitudCentro,
    longitudCentro: p.longitudCentro,
    radioMetros: p.radioMetros,
    cantidadReportes: p.cantidadReportes,
    nivel: p.nivel,
    estado: p.estado,
    ventanaInicio: p.ventanaInicio,
    ventanaFin: p.ventanaFin,
    fechaCreacion: p.fechaCreacion,
    fechaActualizacion: p.fechaActualizacion,
  }));

  return {
    items,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** Reportes (incluido el disparador) dentro del radio y la ventana (ERS §4.6). */
async function reportesEnRadioVentana(
  latitud: number,
  longitud: number,
  radioMetros: number,
  ventanaDias: number,
): Promise<ReporteEnGrupo[]> {
  return prisma.$queryRaw<ReporteEnGrupo[]>`
    SELECT id, latitud, longitud, "nivelPreliminar" AS nivel, "fechaCreacion" AS fecha
    FROM "Reporte"
    WHERE "fechaCreacion" >= NOW() - make_interval(days => ${ventanaDias}::int)
      AND 6371000 * 2 * ASIN(SQRT(
            POWER(SIN(RADIANS(latitud - ${latitud}) / 2), 2) +
            COS(RADIANS(${latitud})) * COS(RADIANS(latitud)) *
            POWER(SIN(RADIANS(longitud - ${longitud}) / 2), 2)
          )) <= ${radioMetros}
  `;
}

/**
 * Punto critico ACTIVO mas cercano dentro del radio (Haversine en SQL, ERS §4.6).
 * Se filtra y ordena en la DB para no traer todos los puntos activos a memoria.
 */
async function buscarPuntoActivoCercano(
  latitud: number,
  longitud: number,
  radioMetros: number,
): Promise<PuntoCercano | null> {
  const filas = await prisma.$queryRaw<PuntoCercano[]>`
    SELECT id, nivel,
           "cantidadReportes" AS cantidad,
           "latitudCentro" AS lat,
           "longitudCentro" AS lng,
           "ventanaInicio" AS inicio,
           "ventanaFin" AS fin
    FROM "PuntoCritico"
    WHERE estado = 'ACTIVO'
      AND 6371000 * 2 * ASIN(SQRT(
            POWER(SIN(RADIANS("latitudCentro" - ${latitud}) / 2), 2) +
            COS(RADIANS(${latitud})) * COS(RADIANS("latitudCentro")) *
            POWER(SIN(RADIANS("longitudCentro" - ${longitud}) / 2), 2)
          )) <= ${radioMetros}
    ORDER BY 6371000 * 2 * ASIN(SQRT(
            POWER(SIN(RADIANS("latitudCentro" - ${latitud}) / 2), 2) +
            COS(RADIANS(${latitud})) * COS(RADIANS("latitudCentro")) *
            POWER(SIN(RADIANS("longitudCentro" - ${longitud}) / 2), 2)
          )) ASC
    LIMIT 1
  `;

  return filas[0] ?? null;
}

function promedio(valores: number[]): number {
  return valores.reduce((acc, v) => acc + v, 0) / valores.length;
}
