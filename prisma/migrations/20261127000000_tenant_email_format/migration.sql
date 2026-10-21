-- CreateEnum
CREATE TYPE "EmailPolicyMode" AS ENUM ('SUGGEST', 'ENFORCE');

-- AlterTable
ALTER TABLE "tenant_configs"
  ADD COLUMN "emailDomain" TEXT,
  ADD COLUMN "emailPattern" TEXT NOT NULL DEFAULT '{primeiroNome}.{apelido}',
  ADD COLUMN "emailPolicyMode" "EmailPolicyMode" NOT NULL DEFAULT 'SUGGEST';
