-- CreateEnum
CREATE TYPE "IntegrationCategory" AS ENUM ('ERP', 'SSO', 'LMS', 'COMMUNICATION', 'HR', 'FINANCE', 'PAYROLL', 'IDENTITY_ACCESS', 'OTHER');

-- CreateEnum
CREATE TYPE "IntegrationEnvironment" AS ENUM ('PRODUCTION', 'STAGING', 'DEVELOPMENT', 'SANDBOX');

-- CreateEnum
CREATE TYPE "IntegrationDataFormat" AS ENUM ('JSON', 'XML', 'CSV', 'EXCEL');

-- CreateEnum
CREATE TYPE "IntegrationCommunicationMethod" AS ENUM ('PULL', 'PUSH', 'POLLING', 'STREAMING');

-- CreateEnum
CREATE TYPE "IntegrationSyncDirection" AS ENUM ('INBOUND', 'OUTBOUND', 'BIDIRECTIONAL');

-- AlterEnum
ALTER TYPE "AuthType" ADD VALUE 'NONE';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "IntegrationStatus" ADD VALUE 'CONFIGURING';
ALTER TYPE "IntegrationStatus" ADD VALUE 'SUSPENDED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "IntegrationType" ADD VALUE 'REST_API';
ALTER TYPE "IntegrationType" ADD VALUE 'SOAP_API';
ALTER TYPE "IntegrationType" ADD VALUE 'WEBHOOK';
ALTER TYPE "IntegrationType" ADD VALUE 'SFTP';
ALTER TYPE "IntegrationType" ADD VALUE 'OAUTH2';
ALTER TYPE "IntegrationType" ADD VALUE 'LDAP';
ALTER TYPE "IntegrationType" ADD VALUE 'SAML2';
ALTER TYPE "IntegrationType" ADD VALUE 'OPENID_CONNECT';
ALTER TYPE "IntegrationType" ADD VALUE 'DATABASE';
ALTER TYPE "IntegrationType" ADD VALUE 'CSV_FILE';
ALTER TYPE "IntegrationType" ADD VALUE 'EXCEL_FILE';
ALTER TYPE "IntegrationType" ADD VALUE 'OTHER';

-- AlterTable
ALTER TABLE "integration_configs" ADD COLUMN     "activatedAt" TIMESTAMP(3),
ADD COLUMN     "apiVersion" TEXT,
ADD COLUMN     "authUrl" TEXT,
ADD COLUMN     "category" "IntegrationCategory",
ADD COLUMN     "communicationMethod" "IntegrationCommunicationMethod",
ADD COLUMN     "dataFormat" "IntegrationDataFormat",
ADD COLUMN     "dataToSync" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "description" TEXT,
ADD COLUMN     "environment" "IntegrationEnvironment" DEFAULT 'PRODUCTION',
ADD COLUMN     "fieldMapping" JSONB,
ADD COLUMN     "maxRetries" INTEGER,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "platform" TEXT,
ADD COLUMN     "responsibleUserId" TEXT,
ADD COLUMN     "retryIntervalMs" INTEGER,
ADD COLUMN     "syncDirection" "IntegrationSyncDirection",
ADD COLUMN     "timeoutMs" INTEGER;
