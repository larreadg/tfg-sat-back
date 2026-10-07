-- CreateEnum
CREATE TYPE "CriticidadZona" AS ENUM ('SIN_RIESGO', 'BAJA', 'MEDIA', 'ALTA', 'CRITICA');

-- CreateTable
CREATE TABLE "ZonaRiesgo" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "criticidad" "CriticidadZona" NOT NULL,
    "poligono" JSONB NOT NULL,
    "bboxMinLat" DOUBLE PRECISION NOT NULL,
    "bboxMaxLat" DOUBLE PRECISION NOT NULL,
    "bboxMinLng" DOUBLE PRECISION NOT NULL,
    "bboxMaxLng" DOUBLE PRECISION NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "usuarioCreacionId" INTEGER,
    "usuarioActualizacionId" INTEGER,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ZonaRiesgo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ZonaRiesgo_activo_idx" ON "ZonaRiesgo"("activo");

-- AddForeignKey
ALTER TABLE "ZonaRiesgo" ADD CONSTRAINT "ZonaRiesgo_usuarioCreacionId_fkey" FOREIGN KEY ("usuarioCreacionId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZonaRiesgo" ADD CONSTRAINT "ZonaRiesgo_usuarioActualizacionId_fkey" FOREIGN KEY ("usuarioActualizacionId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
