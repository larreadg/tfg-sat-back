-- AlterTable
ALTER TABLE "Reporte" ADD COLUMN     "barrio" TEXT,
ADD COLUMN     "calle" TEXT,
ADD COLUMN     "departamento" TEXT,
ADD COLUMN     "direccion" TEXT,
ADD COLUMN     "distrito" TEXT,
ADD COLUMN     "geoFecha" TIMESTAMP(3),
ADD COLUMN     "geoFuente" TEXT,
ADD COLUMN     "pais" TEXT;

-- CreateTable
CREATE TABLE "GeocodificacionCache" (
    "clave" TEXT NOT NULL,
    "latitud" DOUBLE PRECISION NOT NULL,
    "longitud" DOUBLE PRECISION NOT NULL,
    "pais" TEXT,
    "departamento" TEXT,
    "distrito" TEXT,
    "barrio" TEXT,
    "calle" TEXT,
    "direccion" TEXT,
    "fuente" TEXT NOT NULL,
    "crudo" JSONB,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeocodificacionCache_pkey" PRIMARY KEY ("clave")
);
