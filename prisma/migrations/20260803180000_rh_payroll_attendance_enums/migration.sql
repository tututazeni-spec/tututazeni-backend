-- Lote 8 (sub-projecto 2): conversão de 11 campos String para enums Prisma
-- em RH — Payroll & Presenças (Payslip/PayslipItem/PayslipAccessLog/
-- PayslipDispute, LeaveRequest/LeaveApproval, AttendanceJustification/
-- AttendanceRecord). Todas as tabelas alvo estão vazias em innova_dev/
-- innova_test — sem necessidade de UPDATE defensivo de normalização.
--
-- PayslipStatus já existia declarado no schema mas sem nenhum campo a
-- usá-lo, com valores errados (PENDING/APPROVED/CANCELLED em vez de
-- ISSUED/ACKNOWLEDGED/DISPUTED, confirmados por grep em payslips.service.ts)
-- — recriado (DROP + CREATE) em vez de duplicado com nome diferente, mesmo
-- padrão do lote 2 (CareerPathType/ReadinessLevel).
--
-- ComponentType/ComponentCalcType também já existiam declarados sem nenhum
-- campo a usá-los, mas com os valores correctos (EARNING/DEDUCTION,
-- FIXED/PERCENT/FORMULA/TABLE) — aplicados directamente a PayslipItem sem
-- alterar o tipo. PayslipItem não é escrito por nenhum serviço actualmente
-- (grep confirmou zero ocorrências) — conversão de baixo risco.
--
-- DisputeStatus já existia (PerformanceDispute.status, só 'OPEN' em uso) —
-- adicionado 'RESOLVED' via ALTER TYPE ADD VALUE e reutilizado também em
-- PayslipDispute.status (mesmo conceito, nenhum dos dois fluxos de
-- resolução está implementado ainda).
--
-- AttendanceRecord.status/context/method reutilizam AttendanceStatus/
-- AttendanceContext/CheckInMethod, os mesmos enums já usados pelo modelo
-- quase-duplicado `Attendance` — confirmado por grep em attendance.service.ts
-- (que gere ambos os modelos) que usa exactamente o mesmo vocabulário.
--
-- Deixados como String livre (não convertidos — achados estruturais):
-- WorkDeclaration.type/status e UserAttendance.status — dois modelos
-- confirmados como código morto (zero referências em todo o src/), cada um
-- aparentemente substituído por um sistema mais recente (WorkDeclForm/
-- WorkDeclSubmission, que já usam WorkDeclType/WorkDeclStatus reais; e
-- Attendance/AttendanceRecord, respectivamente). Sem nenhum caminho de
-- código para confirmar valores reais, não há base para inferir um enum.

DROP TYPE "PayslipStatus";
CREATE TYPE "PayslipStatus" AS ENUM ('DRAFT', 'ISSUED', 'ACKNOWLEDGED', 'DISPUTED');
ALTER TABLE "Payslip" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Payslip" ALTER COLUMN "status" TYPE "PayslipStatus" USING "status"::"PayslipStatus";
ALTER TABLE "Payslip" ALTER COLUMN "status" SET DEFAULT 'DRAFT';

ALTER TABLE "PayslipItem" ALTER COLUMN "type" TYPE "ComponentType" USING "type"::"ComponentType";
ALTER TABLE "PayslipItem" ALTER COLUMN "calcType" TYPE "ComponentCalcType" USING "calcType"::"ComponentCalcType";

CREATE TYPE "PayslipAccessAction" AS ENUM ('VIEW', 'ADMIN_VIEW');
ALTER TABLE "PayslipAccessLog" ALTER COLUMN "action" TYPE "PayslipAccessAction" USING "action"::"PayslipAccessAction";

ALTER TYPE "DisputeStatus" ADD VALUE IF NOT EXISTS 'RESOLVED';

ALTER TABLE "PayslipDispute" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "PayslipDispute" ALTER COLUMN "status" TYPE "DisputeStatus" USING "status"::"DisputeStatus";
ALTER TABLE "PayslipDispute" ALTER COLUMN "status" SET DEFAULT 'OPEN';

CREATE TYPE "DayPeriod" AS ENUM ('AM', 'PM');
ALTER TABLE "LeaveRequest" ALTER COLUMN "halfDayPeriod" TYPE "DayPeriod" USING "halfDayPeriod"::"DayPeriod";

CREATE TYPE "LeaveDecision" AS ENUM ('APPROVE', 'REJECT', 'ESCALATE', 'DELEGATE', 'CANCELLED');
ALTER TABLE "LeaveApproval" ALTER COLUMN "decision" TYPE "LeaveDecision" USING "decision"::"LeaveDecision";

CREATE TYPE "JustificationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
ALTER TABLE "AttendanceJustification" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "AttendanceJustification" ALTER COLUMN "status" TYPE "JustificationStatus" USING "status"::"JustificationStatus";
ALTER TABLE "AttendanceJustification" ALTER COLUMN "status" SET DEFAULT 'PENDING';

ALTER TABLE "attendance_records" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "attendance_records" ALTER COLUMN "status" TYPE "AttendanceStatus" USING "status"::"AttendanceStatus";
ALTER TABLE "attendance_records" ALTER COLUMN "status" SET DEFAULT 'PRESENT';

ALTER TABLE "attendance_records" ALTER COLUMN "context" DROP DEFAULT;
ALTER TABLE "attendance_records" ALTER COLUMN "context" TYPE "AttendanceContext" USING "context"::"AttendanceContext";
ALTER TABLE "attendance_records" ALTER COLUMN "context" SET DEFAULT 'WORK';

ALTER TABLE "attendance_records" ALTER COLUMN "method" DROP DEFAULT;
ALTER TABLE "attendance_records" ALTER COLUMN "method" TYPE "CheckInMethod" USING "method"::"CheckInMethod";
ALTER TABLE "attendance_records" ALTER COLUMN "method" SET DEFAULT 'MANUAL';
