-- CreateTable
CREATE TABLE "EngagementAction" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "assigneeId" INTEGER,
    "createdById" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3),
    "surveyId" INTEGER,
    "departmentId" INTEGER,
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EngagementAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EngagementAction_status_idx" ON "EngagementAction"("status");

-- CreateIndex
CREATE INDEX "EngagementAction_assigneeId_idx" ON "EngagementAction"("assigneeId");

-- CreateIndex
CREATE INDEX "EngagementAction_createdById_idx" ON "EngagementAction"("createdById");

-- CreateIndex
CREATE INDEX "EngagementAction_surveyId_idx" ON "EngagementAction"("surveyId");

-- AddForeignKey
ALTER TABLE "EngagementAction" ADD CONSTRAINT "EngagementAction_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngagementAction" ADD CONSTRAINT "EngagementAction_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngagementAction" ADD CONSTRAINT "EngagementAction_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "EngagementSurvey"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngagementAction" ADD CONSTRAINT "EngagementAction_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
