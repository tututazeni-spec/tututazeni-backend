-- AlterTable
ALTER TABLE "LeaveRequest" ADD COLUMN "referenceYear" INTEGER,
ADD COLUMN "contactDuringLeave" TEXT;

-- CreateIndex
CREATE INDEX "LeaveRequest_leaveTypeCode_status_idx" ON "LeaveRequest"("leaveTypeCode", "status");
