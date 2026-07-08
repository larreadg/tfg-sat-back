-- CreateEnum
CREATE TYPE "Canal" AS ENUM ('WEB', 'WHATSAPP');

-- CreateTable
CREATE TABLE "Pregunta" (
    "id" SERIAL NOT NULL,
    "texto" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "usuarioCreacionId" INTEGER,
    "usuarioActualizacionId" INTEGER,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pregunta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreguntaOpcion" (
    "id" SERIAL NOT NULL,
    "preguntaId" INTEGER NOT NULL,
    "texto" TEXT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "usuarioCreacionId" INTEGER,
    "usuarioActualizacionId" INTEGER,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PreguntaOpcion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ValidacionSms" (
    "id" SERIAL NOT NULL,
    "telefono" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "expiracion" TIMESTAMP(3) NOT NULL,
    "verificado" BOOLEAN NOT NULL DEFAULT false,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ValidacionSms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsuarioCiudadano" (
    "id" SERIAL NOT NULL,
    "telefono" TEXT NOT NULL,
    "ip" TEXT,
    "canal" "Canal" NOT NULL,
    "usuarioCreacionId" INTEGER,
    "usuarioActualizacionId" INTEGER,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UsuarioCiudadano_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Respuesta" (
    "id" SERIAL NOT NULL,
    "usuarioCiudadanoId" INTEGER NOT NULL,
    "preguntaId" INTEGER NOT NULL,
    "preguntaOpcionId" INTEGER NOT NULL,
    "usuarioCreacionId" INTEGER,
    "usuarioActualizacionId" INTEGER,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Respuesta_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Pregunta" ADD CONSTRAINT "Pregunta_usuarioCreacionId_fkey" FOREIGN KEY ("usuarioCreacionId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pregunta" ADD CONSTRAINT "Pregunta_usuarioActualizacionId_fkey" FOREIGN KEY ("usuarioActualizacionId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreguntaOpcion" ADD CONSTRAINT "PreguntaOpcion_preguntaId_fkey" FOREIGN KEY ("preguntaId") REFERENCES "Pregunta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreguntaOpcion" ADD CONSTRAINT "PreguntaOpcion_usuarioCreacionId_fkey" FOREIGN KEY ("usuarioCreacionId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreguntaOpcion" ADD CONSTRAINT "PreguntaOpcion_usuarioActualizacionId_fkey" FOREIGN KEY ("usuarioActualizacionId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsuarioCiudadano" ADD CONSTRAINT "UsuarioCiudadano_usuarioCreacionId_fkey" FOREIGN KEY ("usuarioCreacionId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsuarioCiudadano" ADD CONSTRAINT "UsuarioCiudadano_usuarioActualizacionId_fkey" FOREIGN KEY ("usuarioActualizacionId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Respuesta" ADD CONSTRAINT "Respuesta_usuarioCiudadanoId_fkey" FOREIGN KEY ("usuarioCiudadanoId") REFERENCES "UsuarioCiudadano"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Respuesta" ADD CONSTRAINT "Respuesta_preguntaId_fkey" FOREIGN KEY ("preguntaId") REFERENCES "Pregunta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Respuesta" ADD CONSTRAINT "Respuesta_preguntaOpcionId_fkey" FOREIGN KEY ("preguntaOpcionId") REFERENCES "PreguntaOpcion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Respuesta" ADD CONSTRAINT "Respuesta_usuarioCreacionId_fkey" FOREIGN KEY ("usuarioCreacionId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Respuesta" ADD CONSTRAINT "Respuesta_usuarioActualizacionId_fkey" FOREIGN KEY ("usuarioActualizacionId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
