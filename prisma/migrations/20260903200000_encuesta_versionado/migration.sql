-- Versionado de encuestas + fotos obligatorias configurables por version.
--
-- Cada `Encuesta` pasa a ser una VERSION del cuestionario: se numera, sabe de
-- que version salio (`origenId`) y define cuantas fotos exige. `fotosMin >= 1`
-- porque la foto deja de ser opcional; el minimo y el maximo son lo configurable.
--
-- Las versiones ya usadas por reportes no se editan (regla del servicio): el
-- historico tiene que poder reconstruirse tal como se respondio.

ALTER TABLE "Encuesta" ADD COLUMN "version" INTEGER;
ALTER TABLE "Encuesta" ADD COLUMN "origenId" INTEGER;
ALTER TABLE "Encuesta" ADD COLUMN "fotosMin" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Encuesta" ADD COLUMN "fotosMax" INTEGER NOT NULL DEFAULT 3;

-- Backfill: lo que ya existe se numera por antiguedad (la encuesta base queda v1).
WITH ordenadas AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY "fechaCreacion" ASC, id ASC) AS numero
  FROM "Encuesta"
)
UPDATE "Encuesta" e
SET "version" = o.numero
FROM ordenadas o
WHERE e.id = o.id;

ALTER TABLE "Encuesta" ALTER COLUMN "version" SET NOT NULL;

CREATE UNIQUE INDEX "Encuesta_version_key" ON "Encuesta"("version");

ALTER TABLE "Encuesta"
  ADD CONSTRAINT "Encuesta_origenId_fkey"
  FOREIGN KEY ("origenId") REFERENCES "Encuesta"("id") ON DELETE SET NULL ON UPDATE CASCADE;
