-- CreateTable
CREATE TABLE "DobleFactor" (
    "id" SERIAL NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "codigo" TEXT NOT NULL,
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "expiracion" TIMESTAMP(3) NOT NULL,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DobleFactor_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "DobleFactor" ADD CONSTRAINT "DobleFactor_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
