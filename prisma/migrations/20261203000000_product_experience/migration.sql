-- CreateTable
CREATE TABLE "product_feedback" (
    "id" TEXT NOT NULL,
    "userId" INTEGER,
    "kind" TEXT NOT NULL,
    "score" INTEGER,
    "comment" TEXT,
    "page" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_usage_events" (
    "id" TEXT NOT NULL,
    "userId" INTEGER,
    "event" TEXT NOT NULL,
    "path" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_usage_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "getting_started_dismissals" (
    "userId" INTEGER NOT NULL,
    "dismissedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "getting_started_dismissals_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "product_feedback_kind_createdAt_idx" ON "product_feedback"("kind", "createdAt");

-- CreateIndex
CREATE INDEX "product_feedback_userId_kind_createdAt_idx" ON "product_feedback"("userId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "product_usage_events_event_createdAt_idx" ON "product_usage_events"("event", "createdAt");

-- CreateIndex
CREATE INDEX "product_usage_events_userId_createdAt_idx" ON "product_usage_events"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "product_feedback" ADD CONSTRAINT "product_feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
