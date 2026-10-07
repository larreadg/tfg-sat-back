-- Identidad estable de preguntas y opciones (`codigo`), a la que se clavan las
-- reglas del motor de criticidad en lugar del texto.
--
-- Orden deliberado: primero las columnas, despues el backfill, y el indice UNICO
-- de `PreguntaOpcion(preguntaId, codigo)` AL FINAL. Si el backfill dejara dos
-- opciones de la misma pregunta con el mismo codigo, la migracion falla aca en vez
-- de dejar la DB en un estado que el motor interpretaria mal.

-- AlterTable
ALTER TABLE "Pregunta" ADD COLUMN     "codigo" TEXT;

-- AlterTable
ALTER TABLE "PreguntaOpcion" ADD COLUMN     "codigo" TEXT;

-- CreateIndex
CREATE INDEX "Pregunta_codigo_idx" ON "Pregunta"("codigo");

-- ---------------------------------------------------------------------------
-- Backfill: preguntas del cuestionario de agua (ERS §6).
--
-- Se matchea por TEXTO porque es la unica identidad que existe antes de esta
-- migracion. Se aplica a TODAS las filas con ese texto a proposito: cada version
-- de encuesta tiene su copia de la pregunta, y todas deben compartir el codigo
-- (es justamente lo que hace que una regla sobreviva al versionado).
-- ---------------------------------------------------------------------------

UPDATE "Pregunta" SET "codigo" = 'AGUA_FUENTE'
  WHERE "texto" = '¿De dónde proviene el agua que estás reportando?' AND "codigo" IS NULL;

UPDATE "Pregunta" SET "codigo" = 'LUGAR_REPORTE'
  WHERE "texto" = '¿Cuál es el lugar de reporte?' AND "codigo" IS NULL;

UPDATE "Pregunta" SET "codigo" = 'AGUA_ANTIGUEDAD'
  WHERE "texto" = '¿Desde cuándo observa el problema?' AND "codigo" IS NULL;

UPDATE "Pregunta" SET "codigo" = 'AGUA_COLOR'
  WHERE "texto" = '¿Qué color o aspecto tiene el agua?' AND "codigo" IS NULL;

UPDATE "Pregunta" SET "codigo" = 'AGUA_PARTICULAS'
  WHERE "texto" = 'A simple vista, ¿se observan partículas, sedimentos o material en suspensión en el agua?'
    AND "codigo" IS NULL;

UPDATE "Pregunta" SET "codigo" = 'AGUA_SABOR'
  WHERE "texto" = '¿Notaste que el sabor del agua sea distinto al habitual?' AND "codigo" IS NULL;

UPDATE "Pregunta" SET "codigo" = 'AGUA_MALESTAR'
  WHERE "texto" = '¿Alguien reportó malestar luego del contacto o consumo?' AND "codigo" IS NULL;

-- El paso de fotos no se puntua, pero igual necesita codigo: es la pregunta que
-- `asegurarPreguntaFoto` da por obligatoria en toda version.
UPDATE "Pregunta" SET "codigo" = 'FOTOS'
  WHERE "tipo" = 'FOTO' AND "codigo" IS NULL;

-- Red de seguridad: cualquier pregunta que no matcheo ningun texto conocido
-- (cuestionarios cargados a mano desde el panel) queda con un codigo derivado del
-- id. Es unico y no rompe nada; el panel permite corregirlo.
UPDATE "Pregunta" SET "codigo" = 'PREGUNTA_' || "id" WHERE "codigo" IS NULL;

-- ---------------------------------------------------------------------------
-- Backfill: opciones, por pregunta. Los codigos son locales a su pregunta, asi
-- que `SI` / `NO_SABE` se repiten entre preguntas sin conflicto.
-- ---------------------------------------------------------------------------

UPDATE "PreguntaOpcion" o SET "codigo" = m.cod
FROM (VALUES
    ('AGUA_FUENTE',     'Pozo propio',                  'POZO_PROPIO'),
    ('AGUA_FUENTE',     'Junta de Saneamiento',         'JUNTA_SANEAMIENTO'),
    ('AGUA_FUENTE',     'Aguatería privada',            'AGUATERIA_PRIVADA'),
    ('AGUA_FUENTE',     'ESSAP (red pública)',          'ESSAP'),
    ('AGUA_FUENTE',     'Agua embotellada o de bidón',  'EMBOTELLADA'),
    ('AGUA_FUENTE',     'No sé',                        'NO_SABE'),

    ('LUGAR_REPORTE',   'Vivienda',                     'VIVIENDA'),
    ('LUGAR_REPORTE',   'Oficina laboral',              'OFICINA'),
    ('LUGAR_REPORTE',   'Escuela',                      'ESCUELA'),
    ('LUGAR_REPORTE',   'Hospital/puesto de salud',     'HOSPITAL'),
    ('LUGAR_REPORTE',   'Empresa',                      'EMPRESA'),
    ('LUGAR_REPORTE',   'Club',                         'CLUB'),

    ('AGUA_ANTIGUEDAD', 'Ahora',                        'AHORA'),
    ('AGUA_ANTIGUEDAD', 'Hoy',                          'HOY'),
    ('AGUA_ANTIGUEDAD', 'Hace varios días',             'VARIOS_DIAS'),
    ('AGUA_ANTIGUEDAD', 'Hace semanas',                 'SEMANAS'),
    ('AGUA_ANTIGUEDAD', 'Es recurrente',                'RECURRENTE'),
    ('AGUA_ANTIGUEDAD', 'No sabe',                      'NO_SABE'),

    ('AGUA_COLOR',      'Normal / sin cambios',                        'NORMAL'),
    ('AGUA_COLOR',      'Amarilla o marrón (hierro o sedimento)',      'AMARILLA_MARRON'),
    ('AGUA_COLOR',      'Verde (algas)',                               'VERDE_ALGAS'),
    ('AGUA_COLOR',      'Oscura, negra o gris (manganeso o sulfuros)', 'OSCURA'),
    ('AGUA_COLOR',      'Blanquecina o lechosa (turbidez o aire)',     'BLANQUECINA'),
    ('AGUA_COLOR',      'Otro',                                        'OTRO'),

    -- Ojo: en la DB esta SIN tilde ("Si"), y la config v1 dependia de ese detalle
    -- exacto (`p05Texto: 'Si'`). Con el codigo, corregir la ortografia deja de
    -- romper el bonus de F2.
    ('AGUA_PARTICULAS', 'Si',                           'SI'),
    ('AGUA_PARTICULAS', 'No',                           'NO'),

    ('AGUA_SABOR',      'Sí, sabor raro',               'SABOR_RARO'),
    ('AGUA_SABOR',      'Sí, sabor salado',             'SABOR_SALADO'),
    ('AGUA_SABOR',      'No, igual que siempre',        'IGUAL'),
    ('AGUA_SABOR',      'No lo probé',                  'NO_PROBE'),

    ('AGUA_MALESTAR',   'Sí',                           'SI'),
    ('AGUA_MALESTAR',   'No',                           'NO'),
    ('AGUA_MALESTAR',   'No sabe',                      'NO_SABE')
  ) AS m(pregunta_codigo, opcion_texto, cod)
WHERE o."codigo" IS NULL
  AND o."texto" = m.opcion_texto
  AND EXISTS (
    SELECT 1 FROM "Pregunta" p
    WHERE p."id" = o."preguntaId" AND p."codigo" = m.pregunta_codigo
  );

-- Red de seguridad, igual que con las preguntas: derivado del id, unico por
-- construccion.
UPDATE "PreguntaOpcion" SET "codigo" = 'OPCION_' || "id" WHERE "codigo" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "PreguntaOpcion_preguntaId_codigo_key" ON "PreguntaOpcion"("preguntaId", "codigo");
