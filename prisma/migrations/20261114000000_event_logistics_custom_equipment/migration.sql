-- Equipamentos livres (fora do enum EventEquipmentType) adicionados pelo utilizador.
ALTER TABLE "EventLogistics" ADD COLUMN "customEquipment" TEXT[] DEFAULT ARRAY[]::TEXT[];
