-- DropForeignKey
ALTER TABLE "Alerta" DROP CONSTRAINT "Alerta_puntoCriticoId_fkey";

-- DropForeignKey
ALTER TABLE "Alerta" DROP CONSTRAINT "Alerta_reporteId_fkey";

-- AddForeignKey
ALTER TABLE "Alerta" ADD CONSTRAINT "Alerta_reporteId_fkey" FOREIGN KEY ("reporteId") REFERENCES "Reporte"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alerta" ADD CONSTRAINT "Alerta_puntoCriticoId_fkey" FOREIGN KEY ("puntoCriticoId") REFERENCES "PuntoCritico"("id") ON DELETE CASCADE ON UPDATE CASCADE;
