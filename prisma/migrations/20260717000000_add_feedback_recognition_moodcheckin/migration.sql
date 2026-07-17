-- CreateTable
CREATE TABLE "MoodCheckin" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "mood" INTEGER NOT NULL,
    "note" TEXT,
    "tags" TEXT[],
    "date" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MoodCheckin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Feedback" (
    "id" SERIAL NOT NULL,
    "fromUserId" INTEGER,
    "toUserId" INTEGER,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "anonymous" BOOLEAN NOT NULL DEFAULT false,
    "projectRef" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "reply" TEXT,
    "repliedAt" TIMESTAMP(3),
    "repliedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recognition" (
    "id" SERIAL NOT NULL,
    "fromUserId" INTEGER NOT NULL,
    "toUserId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "public" BOOLEAN NOT NULL DEFAULT true,
    "value" TEXT,
    "badgeId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Recognition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MoodCheckin_userId_idx" ON "MoodCheckin"("userId");

-- CreateIndex
CREATE INDEX "MoodCheckin_createdAt_idx" ON "MoodCheckin"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MoodCheckin_userId_date_key" ON "MoodCheckin"("userId", "date");

-- CreateIndex
CREATE INDEX "Feedback_toUserId_idx" ON "Feedback"("toUserId");

-- CreateIndex
CREATE INDEX "Feedback_fromUserId_idx" ON "Feedback"("fromUserId");

-- CreateIndex
CREATE INDEX "Feedback_status_idx" ON "Feedback"("status");

-- CreateIndex
CREATE INDEX "Feedback_createdAt_idx" ON "Feedback"("createdAt");

-- CreateIndex
CREATE INDEX "Recognition_toUserId_idx" ON "Recognition"("toUserId");

-- CreateIndex
CREATE INDEX "Recognition_fromUserId_idx" ON "Recognition"("fromUserId");

-- CreateIndex
CREATE INDEX "Recognition_public_idx" ON "Recognition"("public");

-- CreateIndex
CREATE INDEX "Recognition_createdAt_idx" ON "Recognition"("createdAt");

-- AddForeignKey
ALTER TABLE "MoodCheckin" ADD CONSTRAINT "MoodCheckin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_repliedById_fkey" FOREIGN KEY ("repliedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recognition" ADD CONSTRAINT "Recognition_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recognition" ADD CONSTRAINT "Recognition_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recognition" ADD CONSTRAINT "Recognition_badgeId_fkey" FOREIGN KEY ("badgeId") REFERENCES "Badge"("id") ON DELETE SET NULL ON UPDATE CASCADE;
