-- CreateTable
CREATE TABLE "ConfiguracionNotificacion" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "smtpHabilitado" BOOLEAN NOT NULL DEFAULT false,
    "smtpHost" TEXT NOT NULL DEFAULT '',
    "smtpPuerto" INTEGER NOT NULL DEFAULT 587,
    "smtpSeguridad" TEXT NOT NULL DEFAULT 'STARTTLS',
    "smtpUsuario" TEXT NOT NULL DEFAULT '',
    "smtpSecreto" TEXT,
    "remitenteNombre" TEXT NOT NULL DEFAULT '',
    "remitenteCorreo" TEXT NOT NULL DEFAULT '',
    "destinatarios" TEXT NOT NULL DEFAULT '',
    "usuarioActualizacionId" INTEGER,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfiguracionNotificacion_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ConfiguracionNotificacion" ADD CONSTRAINT "ConfiguracionNotificacion_usuarioActualizacionId_fkey" FOREIGN KEY ("usuarioActualizacionId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
