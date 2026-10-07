-- CreateEnum
CREATE TYPE "OperacionAuditoria" AS ENUM ('CREAR', 'ACTUALIZAR', 'ELIMINAR', 'ACCESO');

-- CreateEnum
CREATE TYPE "ActorAuditoria" AS ENUM ('USUARIO', 'CIUDADANO', 'SISTEMA');

-- CreateTable
CREATE TABLE "AuditoriaLog" (
    "id" SERIAL NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accion" TEXT NOT NULL,
    "operacion" "OperacionAuditoria" NOT NULL,
    "entidad" TEXT NOT NULL,
    "entidadId" TEXT,
    "descripcion" TEXT NOT NULL,
    "exito" BOOLEAN NOT NULL DEFAULT true,
    "actorTipo" "ActorAuditoria" NOT NULL,
    "usuarioId" INTEGER,
    "usuarioCorreo" TEXT,
    "usuarioNombre" TEXT,
    "actorEtiqueta" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "metodoHttp" TEXT,
    "ruta" TEXT,
    "requestId" TEXT,
    "datosPrevios" JSONB,
    "datosNuevos" JSONB,
    "metadatos" JSONB,

    CONSTRAINT "AuditoriaLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditoriaLog_fecha_idx" ON "AuditoriaLog"("fecha");

-- CreateIndex
CREATE INDEX "AuditoriaLog_accion_fecha_idx" ON "AuditoriaLog"("accion", "fecha");

-- CreateIndex
CREATE INDEX "AuditoriaLog_usuarioId_fecha_idx" ON "AuditoriaLog"("usuarioId", "fecha");

-- CreateIndex
CREATE INDEX "AuditoriaLog_entidad_entidadId_idx" ON "AuditoriaLog"("entidad", "entidadId");

-- CreateIndex
CREATE INDEX "AuditoriaLog_operacion_fecha_idx" ON "AuditoriaLog"("operacion", "fecha");

-- AddForeignKey
ALTER TABLE "AuditoriaLog" ADD CONSTRAINT "AuditoriaLog_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

