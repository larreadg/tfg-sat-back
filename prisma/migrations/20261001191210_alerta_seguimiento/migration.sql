-- CreateTable
CREATE TABLE "ComentarioAlerta" (
    "id" SERIAL NOT NULL,
    "alertaId" INTEGER NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "cuerpo" TEXT NOT NULL,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComentarioAlerta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdjuntoAlerta" (
    "id" SERIAL NOT NULL,
    "alertaId" INTEGER NOT NULL,
    "comentarioId" INTEGER,
    "usuarioId" INTEGER NOT NULL,
    "nombreOriginal" TEXT NOT NULL,
    "rutaRelativa" TEXT NOT NULL,
    "tipoMime" TEXT NOT NULL,
    "tamanoBytes" INTEGER NOT NULL,
    "esImagen" BOOLEAN NOT NULL DEFAULT false,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdjuntoAlerta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TareaAlerta" (
    "id" SERIAL NOT NULL,
    "alertaId" INTEGER NOT NULL,
    "titulo" TEXT NOT NULL,
    "completada" BOOLEAN NOT NULL DEFAULT false,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "responsableId" INTEGER,
    "fechaVencimiento" TIMESTAMP(3),
    "fechaCompletada" TIMESTAMP(3),
    "usuarioCompletadoId" INTEGER,
    "usuarioCreacionId" INTEGER NOT NULL,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TareaAlerta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ComentarioAlerta_alertaId_fechaCreacion_idx" ON "ComentarioAlerta"("alertaId", "fechaCreacion");

-- CreateIndex
CREATE INDEX "AdjuntoAlerta_alertaId_fechaCreacion_idx" ON "AdjuntoAlerta"("alertaId", "fechaCreacion");

-- CreateIndex
CREATE INDEX "TareaAlerta_alertaId_orden_idx" ON "TareaAlerta"("alertaId", "orden");

-- AddForeignKey
ALTER TABLE "ComentarioAlerta" ADD CONSTRAINT "ComentarioAlerta_alertaId_fkey" FOREIGN KEY ("alertaId") REFERENCES "Alerta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComentarioAlerta" ADD CONSTRAINT "ComentarioAlerta_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdjuntoAlerta" ADD CONSTRAINT "AdjuntoAlerta_alertaId_fkey" FOREIGN KEY ("alertaId") REFERENCES "Alerta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdjuntoAlerta" ADD CONSTRAINT "AdjuntoAlerta_comentarioId_fkey" FOREIGN KEY ("comentarioId") REFERENCES "ComentarioAlerta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdjuntoAlerta" ADD CONSTRAINT "AdjuntoAlerta_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TareaAlerta" ADD CONSTRAINT "TareaAlerta_alertaId_fkey" FOREIGN KEY ("alertaId") REFERENCES "Alerta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TareaAlerta" ADD CONSTRAINT "TareaAlerta_responsableId_fkey" FOREIGN KEY ("responsableId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TareaAlerta" ADD CONSTRAINT "TareaAlerta_usuarioCompletadoId_fkey" FOREIGN KEY ("usuarioCompletadoId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TareaAlerta" ADD CONSTRAINT "TareaAlerta_usuarioCreacionId_fkey" FOREIGN KEY ("usuarioCreacionId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

