-- CreateEnum
CREATE TYPE "RequirementCategory" AS ENUM ('ACADEMIC', 'EXPERIENCE', 'LANGUAGE', 'CERTIFICATION');
CREATE TYPE "AcademicDegree" AS ENUM ('TECNICO', 'BACHARELATO', 'LICENCIATURA', 'POS_GRADUACAO', 'MESTRADO', 'DOUTORAMENTO');
CREATE TYPE "CefrLevel" AS ENUM ('A1', 'A2', 'B1', 'B2', 'C1', 'C2');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "priorExperienceYears" DOUBLE PRECISION DEFAULT 0;

-- CreateTable
CREATE TABLE "PositionRequirement" (
    "id" SERIAL NOT NULL,
    "positionId" INTEGER NOT NULL,
    "category" "RequirementCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "level" TEXT,
    "minYears" DOUBLE PRECISION,
    "mandatory" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PositionRequirement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserQualification" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "degree" "AcademicDegree" NOT NULL,
    "course" TEXT NOT NULL,
    "institution" TEXT,
    "year" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserQualification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserLanguage" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "language" TEXT NOT NULL,
    "level" "CefrLevel" NOT NULL,
    CONSTRAINT "UserLanguage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserExternalCertification" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "issuer" TEXT,
    "issuedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserExternalCertification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PositionRequirement_positionId_category_idx" ON "PositionRequirement"("positionId", "category");
CREATE INDEX "UserQualification_userId_idx" ON "UserQualification"("userId");
CREATE UNIQUE INDEX "UserLanguage_userId_language_key" ON "UserLanguage"("userId", "language");
CREATE INDEX "UserExternalCertification_userId_idx" ON "UserExternalCertification"("userId");

-- AddForeignKey
ALTER TABLE "PositionRequirement" ADD CONSTRAINT "PositionRequirement_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserQualification" ADD CONSTRAINT "UserQualification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserLanguage" ADD CONSTRAINT "UserLanguage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserExternalCertification" ADD CONSTRAINT "UserExternalCertification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
