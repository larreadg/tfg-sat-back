-- CreateEnum
CREATE TYPE "EventoWebhook" AS ENUM ('ALERTA_CREADA', 'ALERTA_ESCALADA', 'ALERTA_ESTADO_CAMBIADO', 'PUNTO_CRITICO_CONSOLIDADO');

-- CreateEnum
CREATE TYPE "AccionWebhook" AS ENUM ('CORREO', 'HTTP');

-- AlterTable
-- IF EXISTS: esta migracion ordena ANTES que la que crea la tabla
-- (20261001150031). En una base nueva no hace nada; la columna la borra
-- 20261007120000_configuracion_notificacion_sin_destinatarios.
ALTER TABLE IF EXISTS "ConfiguracionNotificacion" DROP COLUMN IF EXISTS "destinatarios";

-- CreateTable
CREATE TABLE "ReglaWebhook" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "evento" "EventoWebhook" NOT NULL,
    "accion" "AccionWebhook" NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "nivelMinimo" INTEGER,
    "estadosDestino" "EstadoAlerta"[],
    "destinatarios" TEXT NOT NULL DEFAULT '',
    "asunto" TEXT NOT NULL DEFAULT '',
    "url" TEXT NOT NULL DEFAULT '',
    "secretoFirma" TEXT,
    "usuarioCreacionId" INTEGER,
    "usuarioActualizacionId" INTEGER,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReglaWebhook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntregaWebhook" (
    "id" SERIAL NOT NULL,
    "reglaId" INTEGER NOT NULL,
    "evento" "EventoWebhook" NOT NULL,
    "exito" BOOLEAN NOT NULL,
    "detalle" TEXT NOT NULL,
    "duracionMs" INTEGER NOT NULL,
    "cargaUtil" JSONB NOT NULL,
    "esPrueba" BOOLEAN NOT NULL DEFAULT false,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EntregaWebhook_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReglaWebhook_evento_activa_idx" ON "ReglaWebhook"("evento", "activa");

-- CreateIndex
CREATE INDEX "EntregaWebhook_reglaId_fechaCreacion_idx" ON "EntregaWebhook"("reglaId", "fechaCreacion");

-- AddForeignKey
ALTER TABLE "ReglaWebhook" ADD CONSTRAINT "ReglaWebhook_usuarioCreacionId_fkey" FOREIGN KEY ("usuarioCreacionId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReglaWebhook" ADD CONSTRAINT "ReglaWebhook_usuarioActualizacionId_fkey" FOREIGN KEY ("usuarioActualizacionId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntregaWebhook" ADD CONSTRAINT "EntregaWebhook_reglaId_fkey" FOREIGN KEY ("reglaId") REFERENCES "ReglaWebhook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

