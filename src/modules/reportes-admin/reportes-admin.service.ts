import { Prisma, TipoPregunta } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { NotFoundError } from '../../shared/utils/errors';
import { ListarReportesQuery } from './reportes-admin.validation';
import { ReporteDetalleDTO, ReporteListadoDTO, ReporteUbicacionDTO } from './reportes-admin.types';

type DecimalLike = Prisma.Decimal | null;

function aNumero(valor: DecimalLike): number | null {
  return valor == null ? null : Number(valor);
}

/** Campos geo que se leen del `Reporte` para armar el DTO de ubicacion. */
interface CamposGeo {
  pais: string | null;
  departamento: string | null;
  distrito: string | null;
  barrio: string | null;
  calle: string | null;
  direccion: string | null;
  geoFecha: Date | null;
}

/**
 * Devuelve null si el reporte todavia no fue geocodificado o si el proveedor no
 * resolvio ningun campo, para que el front distinga "sin dato" de "vacio".
 */
function aUbicacion(reporte: CamposGeo): ReporteUbicacionDTO | null {
  if (!reporte.geoFecha) {
    return null;
  }

  const ubicacion: ReporteUbicacionDTO = {
    pais: reporte.pais,
    departamento: reporte.departamento,
    distrito: reporte.distrito,
    barrio: reporte.barrio,
    calle: reporte.calle,
    direccion: reporte.direccion,
  };

  return Object.values(ubicacion).some((valor) => valor != null) ? ubicacion : null;
}

function construirWhere(
  filtros: ListarReportesQuery,
  incluirTelefono: boolean,
): Prisma.ReporteWhereInput {
  const where: Prisma.ReporteWhereInput = {};

  // El telefono es PII: quien no puede verlo tampoco puede filtrar por el
  // (si no, el listado se convierte en un oraculo de numeros). Se ignora.
  if (filtros.telefono && incluirTelefono) {
    where.usuarioCiudadano = { telefono: { contains: filtros.telefono, mode: 'insensitive' } };
  }
  if (filtros.canal) {
    where.canal = filtros.canal;
  }
  if (filtros.nivel !== undefined) {
    where.nivelPreliminar = filtros.nivel;
  }
  if (filtros.desde || filtros.hasta) {
    where.fechaCreacion = { gte: filtros.desde, lte: filtros.hasta };
  }
  if (filtros.estado) {
    where.evaluacionIa = { estado: filtros.estado };
  }
  if (filtros.bbox) {
    where.latitud = { gte: filtros.bbox.minLat, lte: filtros.bbox.maxLat };
    where.longitud = { gte: filtros.bbox.minLng, lte: filtros.bbox.maxLng };
  }

  return where;
}

export async function listarReportes(
  filtros: ListarReportesQuery,
  incluirTelefono: boolean,
): Promise<ReporteListadoDTO> {
  const where = construirWhere(filtros, incluirTelefono);
  const { page, pageSize } = filtros;

  const [total, reportes] = await prisma.$transaction([
    prisma.reporte.count({ where }),
    prisma.reporte.findMany({
      where,
      orderBy: { fechaCreacion: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        codigoPublico: true,
        canal: true,
        fechaCreacion: true,
        latitud: true,
        longitud: true,
        pais: true,
        departamento: true,
        distrito: true,
        barrio: true,
        calle: true,
        direccion: true,
        geoFecha: true,
        nivelPreliminar: true,
        criticidad: true,
        evaluacionIa: { select: { estado: true, riesgoScore: true } },
        usuarioCiudadano: { select: { telefono: true } },
        respuestas: {
          where: { archivos: { some: {} } },
          orderBy: { id: 'asc' },
          select: { archivos: { orderBy: { orden: 'asc' }, select: { id: true, url: true } } },
        },
      },
    }),
  ]);

  return {
    items: reportes.map((reporte) => {
      const fotos = reporte.respuestas.flatMap((respuesta) => respuesta.archivos);

      return {
        id: reporte.id,
        codigoPublico: reporte.codigoPublico,
        canal: reporte.canal,
        fecha: reporte.fechaCreacion,
        latitud: reporte.latitud,
        longitud: reporte.longitud,
        ubicacion: aUbicacion(reporte),
        nivelPreliminar: reporte.nivelPreliminar,
        criticidad: aNumero(reporte.criticidad),
        estadoAnalisis: reporte.evaluacionIa?.estado ?? 'PENDIENTE',
        riesgoScore: reporte.evaluacionIa?.riesgoScore ?? null,
        tieneFotos: fotos.length > 0,
        fotos: fotos.map((foto) => ({ id: foto.id, url: foto.url })),
        ...(incluirTelefono ? { telefono: reporte.usuarioCiudadano.telefono } : {}),
      };
    }),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function obtenerReporteDetalle(
  id: number,
  incluirTelefono: boolean,
): Promise<ReporteDetalleDTO> {
  const reporte = await prisma.reporte.findUnique({
    where: { id },
    include: {
      usuarioCiudadano: { select: { telefono: true } },
      respuestas: {
        orderBy: { id: 'asc' },
        include: {
          pregunta: true,
          opciones: { include: { preguntaOpcion: true } },
          archivos: { orderBy: { orden: 'asc' }, include: { evaluacionFoto: true } },
        },
      },
      evaluacionIa: true,
      desgloseFactores: true,
    },
  });

  if (!reporte) {
    throw new NotFoundError('No existe un reporte con ese id.');
  }

  const respuestas = reporte.respuestas
    .filter((respuesta) => respuesta.pregunta.tipo !== TipoPregunta.FOTO)
    .map((respuesta) => ({
      preguntaId: respuesta.preguntaId,
      pregunta: respuesta.pregunta.texto,
      tipo: respuesta.pregunta.tipo,
      opciones: respuesta.opciones.map((opcion) => opcion.preguntaOpcion.texto),
    }));

  const fotos = reporte.respuestas
    .flatMap((respuesta) => respuesta.archivos)
    .map((archivo) => ({
      id: archivo.id,
      url: archivo.url,
      orden: archivo.orden,
      descripcionIa: archivo.evaluacionFoto?.descripcion ?? null,
      riesgoFoto: archivo.evaluacionFoto?.riesgoFoto ?? null,
    }));

  const evaluacion = reporte.evaluacionIa
    ? {
        estado: reporte.evaluacionIa.estado,
        riesgoScore: reporte.evaluacionIa.riesgoScore,
        resumen: reporte.evaluacionIa.resumen,
        justificacion: reporte.evaluacionIa.justificacion,
        recomendacion: reporte.evaluacionIa.recomendacion,
        modelo: reporte.evaluacionIa.modelo,
        promptVersion: reporte.evaluacionIa.promptVersion,
        intentos: reporte.evaluacionIa.intentos,
        errorMensaje: reporte.evaluacionIa.errorMensaje,
      }
    : null;

  const desglose = reporte.desgloseFactores
    ? {
        f1: aNumero(reporte.desgloseFactores.f1),
        f2: aNumero(reporte.desgloseFactores.f2),
        f3: aNumero(reporte.desgloseFactores.f3),
        f4: aNumero(reporte.desgloseFactores.f4),
        f5: aNumero(reporte.desgloseFactores.f5),
        bonusVulnerabilidad: Number(reporte.desgloseFactores.bonusVulnerabilidad),
        configId: reporte.desgloseFactores.configId,
      }
    : null;

  return {
    id: reporte.id,
    codigoPublico: reporte.codigoPublico,
    canal: reporte.canal,
    fecha: reporte.fechaCreacion,
    latitud: reporte.latitud,
    longitud: reporte.longitud,
    ubicacion: aUbicacion(reporte),
    descripcion: reporte.descripcion,
    nivelPreliminar: reporte.nivelPreliminar,
    criticidad: aNumero(reporte.criticidad),
    ...(incluirTelefono ? { telefono: reporte.usuarioCiudadano.telefono } : {}),
    respuestas,
    fotos,
    evaluacion,
    desglose,
  };
}
