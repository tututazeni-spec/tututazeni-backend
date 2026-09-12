-- Restringe a visibilidade de um Event a departamentos específicos, ou a
-- todos quando vazio ("enviar para todos"). Ver EventsService#applyDeptVisibility.
ALTER TABLE "Event" ADD COLUMN "restrictedDeptIds" INTEGER[] NOT NULL DEFAULT '{}';
