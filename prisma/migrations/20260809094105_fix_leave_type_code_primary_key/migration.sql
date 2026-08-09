-- Ver memory project-innova-leave-type-enum-mismatch: LeaveBalance/LeaveRequest.leaveType
-- era o enum fixo de 10 valores `LeaveType`, mas LeaveTypeConfig.code é livre/
-- configurável (ex. "SICK_SHORT") — qualquer código customizado rebentava
-- ("Unknown value") em toda a criação de pedidos e operações de saldo.
--
-- leaveTypeCode passa a ser a chave real (obrigatória); leaveType (enum fixo)
-- passa a opcional, preenchido apenas quando o código coincide literalmente
-- com um dos 10 valores do enum — mantém compatibilidade com leitores
-- antigos sem voltar a rebentar em códigos customizados.
--
-- Ambas as tabelas (LeaveBalance/LeaveRequest/LeaveBalanceHistory) estavam
-- vazias em dev e test no momento desta migração — sem necessidade de
-- backfill de dados existentes.

-- DropIndex
DROP INDEX "LeaveBalance_userId_leaveType_key";

-- AlterTable
ALTER TABLE "LeaveBalance" ADD COLUMN     "leaveTypeCode" TEXT NOT NULL,
ALTER COLUMN "leaveType" DROP NOT NULL;

-- AlterTable
ALTER TABLE "LeaveBalanceHistory" ALTER COLUMN "leaveType" DROP NOT NULL,
ALTER COLUMN "leaveTypeCode" SET NOT NULL;

-- AlterTable
ALTER TABLE "LeaveRequest" ALTER COLUMN "leaveType" DROP NOT NULL,
ALTER COLUMN "leaveTypeCode" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "LeaveBalance_userId_leaveTypeCode_key" ON "LeaveBalance"("userId", "leaveTypeCode");

-- CreateIndex
CREATE INDEX "LeaveBalanceHistory_userId_leaveTypeCode_idx" ON "LeaveBalanceHistory"("userId", "leaveTypeCode");
