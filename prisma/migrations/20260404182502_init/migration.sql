-- CreateTable
CREATE TABLE "AvatarScenario" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "difficulty" INTEGER NOT NULL DEFAULT 1,
    "competencyId" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AvatarScenario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvatarSession" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "scenarioId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "score" DOUBLE PRECISION,
    "feedback" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AvatarSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AvatarScenario_competencyId_idx" ON "AvatarScenario"("competencyId");

-- CreateIndex
CREATE INDEX "AvatarSession_userId_idx" ON "AvatarSession"("userId");

-- CreateIndex
CREATE INDEX "AvatarSession_scenarioId_idx" ON "AvatarSession"("scenarioId");

-- AddForeignKey
ALTER TABLE "AvatarScenario" ADD CONSTRAINT "AvatarScenario_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "Competency"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvatarSession" ADD CONSTRAINT "AvatarSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvatarSession" ADD CONSTRAINT "AvatarSession_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "AvatarScenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
