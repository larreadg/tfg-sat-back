-- AlterTable UsuarioCiudadano: remove ip and canal, add unique on telefono
ALTER TABLE "UsuarioCiudadano" DROP COLUMN "ip";
ALTER TABLE "UsuarioCiudadano" DROP COLUMN "canal";
CREATE UNIQUE INDEX "UsuarioCiudadano_telefono_key" ON "UsuarioCiudadano"("telefono");

-- AlterTable ValidacionSms: add FK to UsuarioCiudadano
ALTER TABLE "ValidacionSms" ADD COLUMN "usuarioCiudadanoId" INTEGER;
ALTER TABLE "ValidacionSms" ADD CONSTRAINT "ValidacionSms_usuarioCiudadanoId_fkey" FOREIGN KEY ("usuarioCiudadanoId") REFERENCES "UsuarioCiudadano"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable Respuesta: add canal and FK to ValidacionSms
ALTER TABLE "Respuesta" ADD COLUMN "canal" "Canal" NOT NULL DEFAULT 'WEB';
ALTER TABLE "Respuesta" ADD COLUMN "validacionSmsId" INTEGER;
ALTER TABLE "Respuesta" ADD CONSTRAINT "Respuesta_validacionSmsId_fkey" FOREIGN KEY ("validacionSmsId") REFERENCES "ValidacionSms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Remove DEFAULT from canal (only used during migration of existing rows)
ALTER TABLE "Respuesta" ALTER COLUMN "canal" DROP DEFAULT;
