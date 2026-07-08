-- CreateEnum
CREATE TYPE "TipoPregunta" AS ENUM ('ELECCION_UNICA', 'FOTO');

-- AlterTable Pregunta: add tipo field
ALTER TABLE "Pregunta" ADD COLUMN "tipo" "TipoPregunta" NOT NULL DEFAULT 'ELECCION_UNICA';

-- AlterTable Respuesta: make preguntaOpcionId nullable, add archivoUrl
ALTER TABLE "Respuesta" ALTER COLUMN "preguntaOpcionId" DROP NOT NULL;
ALTER TABLE "Respuesta" ADD COLUMN "archivoUrl" TEXT;
