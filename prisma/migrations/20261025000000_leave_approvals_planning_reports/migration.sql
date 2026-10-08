-- AlterTable
ALTER TABLE "LeaveApproval" ADD COLUMN     "dueAt" TIMESTAMP(3),
ADD COLUMN     "stage" TEXT NOT NULL DEFAULT 'MANAGER';

-- AlterTable
ALTER TABLE "leave_type_configs" ADD COLUMN     "approvalLevels" INTEGER,
ADD COLUMN     "countsAsAbsenteeism" BOOLEAN NOT NULL DEFAULT true;

-- Férias aprovadas não contam como absentismo (docs/Modulo_Leave.md §9)
UPDATE "leave_type_configs" SET "countsAsAbsenteeism" = false WHERE "code" = 'VACATION';

-- AlterTable
ALTER TABLE "leave_policies" ADD COLUMN     "decisionSlaDays" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "hrValidationOverDays" INTEGER;

-- CreateTable
CREATE TABLE "LeaveApprovalReassignment" (
    "id" SERIAL NOT NULL,
    "approvalId" INTEGER NOT NULL,
    "fromApproverId" INTEGER NOT NULL,
    "toApproverId" INTEGER NOT NULL,
    "byUserId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'REASSIGN',
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaveApprovalReassignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeaveApprovalReassignment_approvalId_idx" ON "LeaveApprovalReassignment"("approvalId");

-- AddForeignKey
ALTER TABLE "LeaveApprovalReassignment" ADD CONSTRAINT "LeaveApprovalReassignment_approvalId_fkey" FOREIGN KEY ("approvalId") REFERENCES "LeaveApproval"("id") ON DELETE CASCADE ON UPDATE CASCADE;
