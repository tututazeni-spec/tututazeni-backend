-- Posição entre departamentos do mesmo nível (reordenar a hierarquia)
ALTER TABLE "Department" ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;
