-- Fase A (ERS §4.3 opcion 1): se introduce `Reporte` como unidad de agrupacion
-- del envio. Las `Respuesta` y la `EvaluacionIa` pasan a colgar de `Reporte`
-- (antes se agrupaban por `validacionSmsId`). Migracion CON backfill: hay datos
-- reales, se crea un `Reporte` por cada envio existente y se re-vinculan sus
-- filas antes de imponer NOT NULL y dropear las columnas viejas.

-- CreateEnum
CREATE TYPE "EstadoAlerta" AS ENUM ('NUEVA', 'EN_REVISION', 'DERIVADA', 'CERRADA', 'DESCARTADA');

-- CreateEnum
CREATE TYPE "EstadoPuntoCritico" AS ENUM ('ACTIVO', 'RESUELTO');

-- CreateTable
CREATE TABLE "Reporte" (
    "id" SERIAL NOT NULL,
    "codigoPublico" TEXT NOT NULL,
    "canal" "Canal" NOT NULL,
    "encuestaId" INTEGER NOT NULL,
    "usuarioCiudadanoId" INTEGER NOT NULL,
    "validacionSmsId" INTEGER,
    "descripcion" TEXT,
    "latitud" DOUBLE PRECISION NOT NULL,
    "longitud" DOUBLE PRECISION NOT NULL,
    "criticidad" DECIMAL(4,2),
    "nivelPreliminar" INTEGER,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reporte_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfiguracionCriticidad" (
    "id" SERIAL NOT NULL,
    "version" INTEGER NOT NULL,
    "pesos" JSONB NOT NULL,
    "puntajes" JSONB NOT NULL,
    "umbralesNivel" JSONB NOT NULL,
    "radioMetros" INTEGER NOT NULL DEFAULT 500,
    "ventanaDias" INTEGER NOT NULL DEFAULT 7,
    "minReportes" INTEGER NOT NULL DEFAULT 3,
    "limitesAntiabuso" JSONB NOT NULL,
    "bonusVulnerable" DECIMAL(4,2) NOT NULL DEFAULT 0.5,
    "activa" BOOLEAN NOT NULL DEFAULT false,
    "usuarioCreacionId" INTEGER,
    "usuarioActualizacionId" INTEGER,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfiguracionCriticidad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DesgloseFactores" (
    "id" SERIAL NOT NULL,
    "reporteId" INTEGER NOT NULL,
    "f1" DECIMAL(4,2),
    "f2" DECIMAL(4,2),
    "f3" DECIMAL(4,2),
    "f4" DECIMAL(4,2),
    "f5" DECIMAL(4,2),
    "bonusVulnerabilidad" DECIMAL(4,2) NOT NULL DEFAULT 0,
    "configId" INTEGER NOT NULL,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DesgloseFactores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PuntoCritico" (
    "id" SERIAL NOT NULL,
    "latitudCentro" DOUBLE PRECISION NOT NULL,
    "longitudCentro" DOUBLE PRECISION NOT NULL,
    "radioMetros" INTEGER NOT NULL,
    "cantidadReportes" INTEGER NOT NULL,
    "nivel" INTEGER NOT NULL,
    "estado" "EstadoPuntoCritico" NOT NULL DEFAULT 'ACTIVO',
    "ventanaInicio" TIMESTAMP(3) NOT NULL,
    "ventanaFin" TIMESTAMP(3) NOT NULL,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PuntoCritico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alerta" (
    "id" SERIAL NOT NULL,
    "reporteId" INTEGER,
    "puntoCriticoId" INTEGER,
    "nivel" INTEGER NOT NULL,
    "estado" "EstadoAlerta" NOT NULL DEFAULT 'NUEVA',
    "motivo" TEXT NOT NULL,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Alerta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CambioEstadoAlerta" (
    "id" SERIAL NOT NULL,
    "alertaId" INTEGER NOT NULL,
    "estadoAnterior" "EstadoAlerta" NOT NULL,
    "estadoNuevo" "EstadoAlerta" NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "observacion" TEXT,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CambioEstadoAlerta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Reporte_codigoPublico_key" ON "Reporte"("codigoPublico");
CREATE UNIQUE INDEX "Reporte_validacionSmsId_key" ON "Reporte"("validacionSmsId");
CREATE INDEX "Reporte_usuarioCiudadanoId_idx" ON "Reporte"("usuarioCiudadanoId");
CREATE INDEX "Reporte_fechaCreacion_idx" ON "Reporte"("fechaCreacion");
CREATE UNIQUE INDEX "DesgloseFactores_reporteId_key" ON "DesgloseFactores"("reporteId");
CREATE UNIQUE INDEX "ConfiguracionCriticidad_version_key" ON "ConfiguracionCriticidad"("version");
CREATE INDEX "Alerta_estado_idx" ON "Alerta"("estado");
CREATE INDEX "PuntoCritico_estado_idx" ON "PuntoCritico"("estado");

-- DropForeignKey (viejas relaciones por validacionSmsId)
ALTER TABLE "EvaluacionIa" DROP CONSTRAINT "EvaluacionIa_validacionSmsId_fkey";
ALTER TABLE "Respuesta" DROP CONSTRAINT "Respuesta_validacionSmsId_fkey";

-- DropIndex
DROP INDEX "EvaluacionIa_validacionSmsId_key";

-- AlterTable: agregamos reporteId NULLABLE (se completa en el backfill)
ALTER TABLE "Respuesta" ADD COLUMN "reporteId" INTEGER;
ALTER TABLE "EvaluacionIa" ADD COLUMN "reporteId" INTEGER;

-- ============================ BACKFILL ============================
-- 1) Un Reporte por cada envio existente (distinct validacionSmsId de Respuesta).
--    Canal/encuesta/ciudadano/ubicacion/fecha se toman de la Respuesta de menor
--    id del grupo (representativa). codigoPublico: AGD-<8 hex>.
INSERT INTO "Reporte" (
    "codigoPublico", "canal", "encuestaId", "usuarioCiudadanoId",
    "validacionSmsId", "latitud", "longitud", "fechaCreacion", "fechaActualizacion"
)
SELECT
    'AGD-' || upper(substring(md5(random()::text || g."validacionSmsId"::text) FROM 1 FOR 8)),
    rep."canal", rep."encuestaId", rep."usuarioCiudadanoId",
    g."validacionSmsId", rep."latitud", rep."longitud",
    rep."fechaCreacion", CURRENT_TIMESTAMP
FROM (SELECT DISTINCT "validacionSmsId" FROM "Respuesta" WHERE "validacionSmsId" IS NOT NULL) g
JOIN LATERAL (
    SELECT * FROM "Respuesta" x
    WHERE x."validacionSmsId" = g."validacionSmsId"
    ORDER BY x."id" ASC
    LIMIT 1
) rep ON true;

-- 2) Vincular cada Respuesta a su Reporte (por validacionSmsId).
UPDATE "Respuesta" r
SET "reporteId" = rep."id"
FROM "Reporte" rep
WHERE rep."validacionSmsId" = r."validacionSmsId";

-- 3) Vincular cada EvaluacionIa a su Reporte (por validacionSmsId).
UPDATE "EvaluacionIa" e
SET "reporteId" = rep."id"
FROM "Reporte" rep
WHERE rep."validacionSmsId" = e."validacionSmsId";
-- ========================== FIN BACKFILL ==========================

-- Imponemos NOT NULL una vez backfilleado y dropeamos las columnas viejas.
ALTER TABLE "Respuesta" ALTER COLUMN "reporteId" SET NOT NULL;
ALTER TABLE "EvaluacionIa" ALTER COLUMN "reporteId" SET NOT NULL;
ALTER TABLE "Respuesta" DROP COLUMN "validacionSmsId";
ALTER TABLE "EvaluacionIa" DROP COLUMN "validacionSmsId";

-- CreateIndex (nuevas relaciones por reporteId)
CREATE UNIQUE INDEX "EvaluacionIa_reporteId_key" ON "EvaluacionIa"("reporteId");
CREATE INDEX "Respuesta_reporteId_idx" ON "Respuesta"("reporteId");

-- AddForeignKey
ALTER TABLE "Reporte" ADD CONSTRAINT "Reporte_encuestaId_fkey" FOREIGN KEY ("encuestaId") REFERENCES "Encuesta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Reporte" ADD CONSTRAINT "Reporte_usuarioCiudadanoId_fkey" FOREIGN KEY ("usuarioCiudadanoId") REFERENCES "UsuarioCiudadano"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Reporte" ADD CONSTRAINT "Reporte_validacionSmsId_fkey" FOREIGN KEY ("validacionSmsId") REFERENCES "ValidacionSms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Respuesta" ADD CONSTRAINT "Respuesta_reporteId_fkey" FOREIGN KEY ("reporteId") REFERENCES "Reporte"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EvaluacionIa" ADD CONSTRAINT "EvaluacionIa_reporteId_fkey" FOREIGN KEY ("reporteId") REFERENCES "Reporte"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DesgloseFactores" ADD CONSTRAINT "DesgloseFactores_reporteId_fkey" FOREIGN KEY ("reporteId") REFERENCES "Reporte"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DesgloseFactores" ADD CONSTRAINT "DesgloseFactores_configId_fkey" FOREIGN KEY ("configId") REFERENCES "ConfiguracionCriticidad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConfiguracionCriticidad" ADD CONSTRAINT "ConfiguracionCriticidad_usuarioCreacionId_fkey" FOREIGN KEY ("usuarioCreacionId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ConfiguracionCriticidad" ADD CONSTRAINT "ConfiguracionCriticidad_usuarioActualizacionId_fkey" FOREIGN KEY ("usuarioActualizacionId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Alerta" ADD CONSTRAINT "Alerta_reporteId_fkey" FOREIGN KEY ("reporteId") REFERENCES "Reporte"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Alerta" ADD CONSTRAINT "Alerta_puntoCriticoId_fkey" FOREIGN KEY ("puntoCriticoId") REFERENCES "PuntoCritico"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CambioEstadoAlerta" ADD CONSTRAINT "CambioEstadoAlerta_alertaId_fkey" FOREIGN KEY ("alertaId") REFERENCES "Alerta"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CambioEstadoAlerta" ADD CONSTRAINT "CambioEstadoAlerta_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
