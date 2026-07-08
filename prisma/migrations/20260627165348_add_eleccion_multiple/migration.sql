-- AlterEnum: add ELECCION_MULTIPLE value
ALTER TYPE "TipoPregunta" ADD VALUE 'ELECCION_MULTIPLE';

-- AlterTable Respuesta: remove preguntaOpcionId FK
ALTER TABLE "Respuesta" DROP CONSTRAINT "Respuesta_preguntaOpcionId_fkey";
ALTER TABLE "Respuesta" DROP COLUMN "preguntaOpcionId";

-- CreateTable RespuestaOpcion
CREATE TABLE "RespuestaOpcion" (
    "respuestaId"      INTEGER NOT NULL,
    "preguntaOpcionId" INTEGER NOT NULL,
    "fechaCreacion"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RespuestaOpcion_pkey" PRIMARY KEY ("respuestaId", "preguntaOpcionId")
);

-- AddForeignKey
ALTER TABLE "RespuestaOpcion" ADD CONSTRAINT "RespuestaOpcion_respuestaId_fkey" FOREIGN KEY ("respuestaId") REFERENCES "Respuesta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RespuestaOpcion" ADD CONSTRAINT "RespuestaOpcion_preguntaOpcionId_fkey" FOREIGN KEY ("preguntaOpcionId") REFERENCES "PreguntaOpcion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
