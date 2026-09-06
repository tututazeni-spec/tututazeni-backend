-- Fase G4 — rastreio da origem legada (OneOnOne) nas linhas de OneOnOneMeeting
ALTER TABLE "OneOnOneMeeting" ADD COLUMN "legacyOneOnOneId" INTEGER;
CREATE UNIQUE INDEX "OneOnOneMeeting_legacyOneOnOneId_key" ON "OneOnOneMeeting"("legacyOneOnOneId");
