-- AlterTable
ALTER TABLE "ReglaWebhook" ADD COLUMN     "cuerpoCorreo" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "cuerpoHttp" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "CabeceraWebhook" (
    "id" SERIAL NOT NULL,
    "reglaId" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "valor" TEXT NOT NULL,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CabeceraWebhook_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CabeceraWebhook_reglaId_nombre_key" ON "CabeceraWebhook"("reglaId", "nombre");

-- AddForeignKey
ALTER TABLE "CabeceraWebhook" ADD CONSTRAINT "CabeceraWebhook_reglaId_fkey" FOREIGN KEY ("reglaId") REFERENCES "ReglaWebhook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

