/**
 * Catalogo de permisos que consume la autorizacion server-side
 * (`requirePermiso`). Los nombres DEBEN coincidir con los que siembra
 * `prisma/seed.ts`, que genera un permiso por cada combinacion
 * `<recurso>.<accion>` (acciones: ver, crear, editar, eliminar) y se los
 * asigna al rol administrador. Estos valores viajan en el `permisos` del
 * access token.
 */
export const PERMISOS = {
  USUARIOS_VER: 'usuario.ver',
  USUARIOS_CREAR: 'usuario.crear',
  USUARIOS_EDITAR: 'usuario.editar',
  USUARIOS_ELIMINAR: 'usuario.eliminar',
} as const;

export type Permiso = (typeof PERMISOS)[keyof typeof PERMISOS];
