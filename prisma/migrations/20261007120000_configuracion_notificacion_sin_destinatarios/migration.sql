-- 20261001131855 borraba esta columna antes de que existiera la tabla (se crea
-- en 20261001150031), asi que el historial fallaba en cualquier base nueva.
-- Ahora aquella migracion no hace nada en una base nueva y la columna se borra
-- aca. Donde ya se habia borrado, IF EXISTS la deja igual.
ALTER TABLE "ConfiguracionNotificacion" DROP COLUMN IF EXISTS "destinatarios";
