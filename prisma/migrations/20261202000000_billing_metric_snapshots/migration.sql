-- CreateTable
CREATE TABLE "billing_metric_snapshots" (
    "id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "mrr" DECIMAL(14,2) NOT NULL,
    "arr" DECIMAL(14,2) NOT NULL,
    "payingCustomers" INTEGER NOT NULL,
    "trialing" INTEGER NOT NULL,
    "newCustomers" INTEGER NOT NULL,
    "churnRatePct" DECIMAL(7,2) NOT NULL,
    "revenueCollected" DECIMAL(14,2) NOT NULL,
    "outstanding" DECIMAL(14,2) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_metric_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "billing_metric_snapshots_month_key" ON "billing_metric_snapshots"("month");

