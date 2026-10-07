import { ActorAuditoria, OperacionAuditoria } from '@prisma/client';
import { GrupoAccion } from './auditoria.acciones';

/** Una fila de la bitacora, como la ve el listado del panel. */
export interface AuditoriaListItemDTO {
  id: number;
  fecha: Date;
  accion: string;
  /** Etiqueta legible de la accion, resuelta del catalogo. */
  accionEtiqueta: string;
  operacion: OperacionAuditoria;
  entidad: string;
  entidadId: string | null;
  descripcion: string;
  exito: boolean;
  actorTipo: ActorAuditoria;
  /**
   * Nombre a mostrar del actor, ya resuelto: el usuario del panel, el telefono
   * enmascarado del ciudadano o el nombre del proceso. El front no tiene que
   * decidir entre tres campos.
   */
  actor: string;
  usuarioId: number | null;
  usuarioCorreo: string | null;
  ip: string | null;
  /** `true` si la fila tiene detalle (datos previos/nuevos/metadatos) que ver. */
  tieneDetalle: boolean;
}

export interface AuditoriaListadoDTO {
  items: AuditoriaListItemDTO[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** El detalle completo de una entrada. Suma lo que el listado no manda. */
export interface AuditoriaDetalleDTO extends AuditoriaListItemDTO {
  userAgent: string | null;
  metodoHttp: string | null;
  ruta: string | null;
  requestId: string | null;
  datosPrevios: unknown;
  datosNuevos: unknown;
  metadatos: unknown;
}

/** Una accion del catalogo, como la consume el filtro del panel. */
export interface AccionCatalogoDTO {
  accion: string;
  etiqueta: string;
  operacion: OperacionAuditoria;
  entidad: string;
  grupo: GrupoAccion;
}

/**
 * Un actor que YA figura en la bitacora. Alimenta el filtro "usuario" del panel
 * sin obligar a quien audita a tener tambien `usuario.ver`: salen de la propia
 * tabla, no del listado de usuarios.
 */
export interface ActorCatalogoDTO {
  usuarioId: number;
  nombre: string;
  correo: string | null;
}

export interface CatalogoAuditoriaDTO {
  acciones: AccionCatalogoDTO[];
  grupos: string[];
  entidades: string[];
  operaciones: OperacionAuditoria[];
  actoresTipo: ActorAuditoria[];
  /** Usuarios del panel con al menos una accion registrada. */
  usuarios: ActorCatalogoDTO[];
}
