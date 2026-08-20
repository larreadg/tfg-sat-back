-- AlterEnum
ALTER TYPE "Canal" ADD VALUE 'TELEGRAM';

-- AlterTable
ALTER TABLE "UsuarioCiudadano" ADD COLUMN     "telegramChatId" BIGINT;

-- CreateTable
CREATE TABLE "TelegramConversacion" (
    "id" SERIAL NOT NULL,
    "chatId" BIGINT NOT NULL,
    "estado" TEXT NOT NULL,
    "pasoActual" INTEGER NOT NULL DEFAULT 0,
    "encuestaId" INTEGER,
    "telefono" TEXT,
    "respuestasParciales" JSONB NOT NULL DEFAULT '{}',
    "ubicacionLat" DOUBLE PRECISION,
    "ubicacionLng" DOUBLE PRECISION,
    "fotoFileId" TEXT,
    "messageId" INTEGER,
    "expiracion" TIMESTAMP(3) NOT NULL,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramConversacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramUpdateProcesado" (
    "updateId" BIGINT NOT NULL,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramUpdateProcesado_pkey" PRIMARY KEY ("updateId")
);

-- CreateIndex
CREATE UNIQUE INDEX "TelegramConversacion_chatId_key" ON "TelegramConversacion"("chatId");

-- CreateIndex
CREATE UNIQUE INDEX "UsuarioCiudadano_telegramChatId_key" ON "UsuarioCiudadano"("telegramChatId");

