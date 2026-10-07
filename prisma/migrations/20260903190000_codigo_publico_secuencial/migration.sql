-- Numeracion secuencial del codigo publico de reportes: AGD-0000001, AGD-0000002...
-- Reemplaza el hex aleatorio (AGD-XXXXXXXX) y renumera retroactivamente lo ya
-- cargado, por orden de llegada.
--
-- El numero sale de una SECUENCIA de Postgres, no de un MAX()+1: nextval es
-- atomico, asi que dos envios simultaneos nunca reciben el mismo codigo. A
-- cambio, un envio que falle despues de pedir el numero deja un hueco: es el
-- comportamiento normal de una numeracion de tickets y se prefiere al riesgo de
-- duplicados.

CREATE SEQUENCE IF NOT EXISTS "Reporte_codigoPublico_seq" AS bigint START WITH 1 INCREMENT BY 1;

-- Mapa codigo viejo -> codigo nuevo, por fecha de creacion (desempata el id).
CREATE TEMP TABLE mapa_codigos_reporte AS
SELECT
  id,
  "codigoPublico" AS anterior,
  'AGD-' || to_char(ROW_NUMBER() OVER (ORDER BY "fechaCreacion" ASC, id ASC), 'FM0000000') AS nuevo
FROM "Reporte";

-- Renumerar. No puede chocar con el UNIQUE: los codigos viejos tienen 8 hex
-- despues del guion y los nuevos 7 digitos, nunca coinciden.
UPDATE "Reporte" r
SET "codigoPublico" = m.nuevo
FROM mapa_codigos_reporte m
WHERE r.id = m.id;

-- El motivo de una alerta lleva el codigo embebido como texto; si no se
-- reescribe, el panel muestra codigos que ya no existen.
UPDATE "Alerta" a
SET motivo = REPLACE(a.motivo, m.anterior, m.nuevo)
FROM mapa_codigos_reporte m
WHERE POSITION(m.anterior IN a.motivo) > 0;

-- La secuencia sigue despues del ultimo numero asignado (o arranca en 1 si no
-- habia reportes).
SELECT setval(
  '"Reporte_codigoPublico_seq"',
  GREATEST((SELECT COUNT(*) FROM mapa_codigos_reporte), 1),
  (SELECT COUNT(*) > 0 FROM mapa_codigos_reporte)
);

DROP TABLE mapa_codigos_reporte;
