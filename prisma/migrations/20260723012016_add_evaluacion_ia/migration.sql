-- CreateEnum
CREATE TYPE "EstadoEvaluacionIa" AS ENUM ('PENDIENTE', 'PROCESANDO', 'COMPLETADO', 'ERROR');

-- AlterTable
ALTER TABLE "Respuesta" ADD COLUMN     "evaluadoIa" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "EvaluacionIa" (
    "id" SERIAL NOT NULL,
    "validacionSmsId" INTEGER NOT NULL,
    "estado" "EstadoEvaluacionIa" NOT NULL DEFAULT 'PENDIENTE',
    "riesgoScore" INTEGER,
    "resumen" TEXT,
    "justificacion" TEXT,
    "recomendacion" TEXT,
    "modelo" TEXT,
    "promptVersion" INTEGER NOT NULL DEFAULT 1,
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "errorMensaje" TEXT,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvaluacionIa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluacionIaFoto" (
    "id" SERIAL NOT NULL,
    "evaluacionId" INTEGER NOT NULL,
    "respuestaArchivoId" INTEGER NOT NULL,
    "descripcion" TEXT NOT NULL,
    "riesgoFoto" INTEGER NOT NULL,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvaluacionIaFoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EvaluacionIa_validacionSmsId_key" ON "EvaluacionIa"("validacionSmsId");

-- CreateIndex
CREATE UNIQUE INDEX "EvaluacionIaFoto_respuestaArchivoId_key" ON "EvaluacionIaFoto"("respuestaArchivoId");

-- AddForeignKey
ALTER TABLE "EvaluacionIa" ADD CONSTRAINT "EvaluacionIa_validacionSmsId_fkey" FOREIGN KEY ("validacionSmsId") REFERENCES "ValidacionSms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluacionIaFoto" ADD CONSTRAINT "EvaluacionIaFoto_evaluacionId_fkey" FOREIGN KEY ("evaluacionId") REFERENCES "EvaluacionIa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluacionIaFoto" ADD CONSTRAINT "EvaluacionIaFoto_respuestaArchivoId_fkey" FOREIGN KEY ("respuestaArchivoId") REFERENCES "RespuestaArchivo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
