-- CreateTable Encuesta
CREATE TABLE "Encuesta" (
    "id"                     SERIAL NOT NULL,
    "nombre"                 TEXT NOT NULL,
    "descripcion"            TEXT,
    "activo"                 BOOLEAN NOT NULL DEFAULT true,
    "usuarioCreacionId"      INTEGER,
    "usuarioActualizacionId" INTEGER,
    "fechaCreacion"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Encuesta_pkey" PRIMARY KEY ("id")
);

-- CreateTable EncuestaPregunta
CREATE TABLE "EncuestaPregunta" (
    "encuestaId"   INTEGER NOT NULL,
    "preguntaId"   INTEGER NOT NULL,
    "orden"        INTEGER NOT NULL DEFAULT 0,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EncuestaPregunta_pkey" PRIMARY KEY ("encuestaId", "preguntaId")
);

-- AlterTable Respuesta: add encuestaId
ALTER TABLE "Respuesta" ADD COLUMN "encuestaId" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Respuesta" ALTER COLUMN "encuestaId" DROP DEFAULT;

-- AddForeignKey Encuesta → Usuario (creacion)
ALTER TABLE "Encuesta" ADD CONSTRAINT "Encuesta_usuarioCreacionId_fkey" FOREIGN KEY ("usuarioCreacionId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey Encuesta → Usuario (actualizacion)
ALTER TABLE "Encuesta" ADD CONSTRAINT "Encuesta_usuarioActualizacionId_fkey" FOREIGN KEY ("usuarioActualizacionId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey EncuestaPregunta → Encuesta
ALTER TABLE "EncuestaPregunta" ADD CONSTRAINT "EncuestaPregunta_encuestaId_fkey" FOREIGN KEY ("encuestaId") REFERENCES "Encuesta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey EncuestaPregunta → Pregunta
ALTER TABLE "EncuestaPregunta" ADD CONSTRAINT "EncuestaPregunta_preguntaId_fkey" FOREIGN KEY ("preguntaId") REFERENCES "Pregunta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey Respuesta → Encuesta
ALTER TABLE "Respuesta" ADD CONSTRAINT "Respuesta_encuestaId_fkey" FOREIGN KEY ("encuestaId") REFERENCES "Encuesta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
