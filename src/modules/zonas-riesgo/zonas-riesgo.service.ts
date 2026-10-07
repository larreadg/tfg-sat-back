import { Prisma, type CriticidadZona, type ZonaRiesgo } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { NotFoundError } from '../../shared/utils/errors';
import { calcularBoundingBox, parsearPoligono, type Vertice } from '../../shared/utils/poligono';
import { ActualizarZonaRiesgoBody, CrearZonaRiesgoBody, ListarZonasRiesgoQuery } from './zonas-riesgo.validation';
import { ZonaParaF5, ZonaRiesgoDTO } from './zonas-riesgo.types';
import { registrarAuditoria } from '../auditoria/auditoria.registro';

/**
 * Puntaje que cada criticidad de zona le aporta a F5. Es la tabla acordada:
 * SIN_RIESGO=1 .. CRITICA=5, y estar FUERA de toda zona vale 0.
 *
 * Que SIN_RIESGO valga 1 y no 0 es deliberado: una zona relevada y marcada como
 * sin riesgo es informacion; un punto que nadie relevo, no. Vive aca y no en el
 * motor porque es parte del significado de la zona, no del algoritmo que combina
 * los factores.
 */
export const PUNTAJE_F5_POR_CRITICIDAD: Record<CriticidadZona, number> = {
  SIN_RIESGO: 1,
  BAJA: 2,
  MEDIA: 3,
  ALTA: 4,
  CRITICA: 5,
};

function serializar(zona: ZonaRiesgo): ZonaRiesgoDTO {
  return {
    id: zona.id,
    nombre: zona.nombre,
    descripcion: zona.descripcion,
    criticidad: zona.criticidad,
    poligono: parsearPoligono(zona.poligono),
    activo: zona.activo,
    puntajeF5: PUNTAJE_F5_POR_CRITICIDAD[zona.criticidad],
    fechaCreacion: zona.fechaCreacion.toISOString(),
    fechaActualizacion: zona.fechaActualizacion.toISOString(),
  };
}

/**
 * Lo que de una zona vale guardar en la bitacora. El poligono entero NO entra: son
 * decenas de vertices que nadie va a leer en un log y que tapan el cambio que
 * importa (la criticidad, el nombre, si quedo activa). Se guarda su tamanio, que
 * es lo que permite notar "le reescribieron el contorno".
 */
function resumenAuditoria(zona: ZonaRiesgoDTO) {
  return {
    id: zona.id,
    nombre: zona.nombre,
    descripcion: zona.descripcion,
    criticidad: zona.criticidad,
    activo: zona.activo,
    puntajeF5: zona.puntajeF5,
    vertices: zona.poligono.length,
  };
}

export async function listarZonas(filtros: ListarZonasRiesgoQuery): Promise<ZonaRiesgoDTO[]> {
  const zonas = await prisma.zonaRiesgo.findMany({
    where: filtros.activo === undefined ? {} : { activo: filtros.activo },
    orderBy: [{ criticidad: 'desc' }, { nombre: 'asc' }],
  });
  return zonas.map(serializar);
}

export async function obtenerZona(id: number): Promise<ZonaRiesgoDTO> {
  const zona = await prisma.zonaRiesgo.findUnique({ where: { id } });
  if (!zona) {
    throw new NotFoundError('La zona de riesgo no existe.');
  }
  return serializar(zona);
}

export async function crearZona(body: CrearZonaRiesgoBody, usuarioId: number): Promise<ZonaRiesgoDTO> {
  const poligono = body.poligono as Vertice[];

  const zona = await prisma.zonaRiesgo.create({
    data: {
      nombre: body.nombre,
      descripcion: body.descripcion ?? null,
      criticidad: body.criticidad,
      // El `Vertice[]` es JSON valido, pero `InputJsonValue` no acepta un tipo con
      // forma propia sin este puente.
      poligono: poligono as unknown as Prisma.InputJsonValue,
      // El bbox se DERIVA del poligono, nunca viene del cliente: si los dos
      // pudieran discrepar, una zona podria dejar de encontrarse en el filtro
      // barato de F5 sin que nada avise.
      ...calcularBoundingBox(poligono),
      activo: body.activo ?? true,
      usuarioCreacionId: usuarioId,
      usuarioActualizacionId: usuarioId,
    },
  });

  const dto = serializar(zona);
  registrarAuditoria({
    accion: 'ZONA_RIESGO_CREAR',
    entidadId: dto.id,
    descripcion: `Dibujo la zona de riesgo "${dto.nombre}" con criticidad ${dto.criticidad}`,
    datosNuevos: resumenAuditoria(dto),
  });

  return dto;
}

export async function actualizarZona(
  id: number,
  body: ActualizarZonaRiesgoBody,
  usuarioId: number,
): Promise<ZonaRiesgoDTO> {
  const existente = await prisma.zonaRiesgo.findUnique({ where: { id } });
  if (!existente) {
    throw new NotFoundError('La zona de riesgo no existe.');
  }

  const poligono = body.poligono as Vertice[] | undefined;

  const zona = await prisma.zonaRiesgo.update({
    where: { id },
    data: {
      ...(body.nombre !== undefined && { nombre: body.nombre }),
      ...(body.descripcion !== undefined && { descripcion: body.descripcion }),
      ...(body.criticidad !== undefined && { criticidad: body.criticidad }),
      // El bbox se recalcula junto con el poligono o no se toca: dejarlo viejo
      // haria que la zona no se encuentre en las coordenadas que acaba de ganar.
      ...(poligono !== undefined && {
        poligono: poligono as unknown as Prisma.InputJsonValue,
        ...calcularBoundingBox(poligono),
      }),
      ...(body.activo !== undefined && { activo: body.activo }),
      usuarioActualizacionId: usuarioId,
    },
  });

  const dto = serializar(zona);
  registrarAuditoria({
    accion: 'ZONA_RIESGO_EDITAR',
    entidadId: id,
    descripcion: `Edito la zona de riesgo "${dto.nombre}"`,
    datosPrevios: resumenAuditoria(serializar(existente)),
    datosNuevos: resumenAuditoria(dto),
    // Cambiar el contorno cambia que reportes caen adentro, o sea el F5 de los
    // proximos calculos. Es el cambio mas silencioso de esta pantalla.
    metadatos: { redibujoPoligono: poligono !== undefined },
  });

  return dto;
}

export async function eliminarZona(id: number): Promise<void> {
  const existente = await prisma.zonaRiesgo.findUnique({ where: { id } });
  if (!existente) {
    throw new NotFoundError('La zona de riesgo no existe.');
  }
  await prisma.zonaRiesgo.delete({ where: { id } });

  registrarAuditoria({
    accion: 'ZONA_RIESGO_ELIMINAR',
    entidadId: id,
    descripcion: `Elimino la zona de riesgo "${existente.nombre}"`,
    datosPrevios: resumenAuditoria(serializar(existente)),
  });
}

/**
 * Zonas ACTIVAS para evaluar F5. Devuelve lo minimo: el calculo corre una vez por
 * reporte recalculado y no necesita nombres ni auditoria.
 */
export async function zonasActivasParaF5(): Promise<ZonaParaF5[]> {
  const zonas = await prisma.zonaRiesgo.findMany({
    where: { activo: true },
    select: {
      id: true,
      criticidad: true,
      poligono: true,
      bboxMinLat: true,
      bboxMaxLat: true,
      bboxMinLng: true,
      bboxMaxLng: true,
    },
  });

  return zonas.map((zona) => ({ ...zona, poligono: parsearPoligono(zona.poligono) }));
}
