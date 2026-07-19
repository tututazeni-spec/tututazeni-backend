-- CreateTable
CREATE TABLE "Eval360Question" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "competencyId" INTEGER,
    "text" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Eval360Question_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Eval360Question_cycleId_idx" ON "Eval360Question"("cycleId");

-- CreateIndex
CREATE INDEX "Eval360Question_competencyId_idx" ON "Eval360Question"("competencyId");

-- AddForeignKey
ALTER TABLE "Eval360Question" ADD CONSTRAINT "Eval360Question_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Eval360Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Eval360Question" ADD CONSTRAINT "Eval360Question_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "Competency"("id") ON DELETE SET NULL ON UPDATE CASCADE;
