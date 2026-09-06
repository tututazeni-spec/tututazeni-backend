-- Fase F3: Badge/BadgeAward absorvem DigitalBadge/BadgeIssuance (deprecados).
-- Colunas nullable/defaulted -> escritores existentes (gamificação) não são afectados.

ALTER TABLE "Badge"
  ADD COLUMN "code" TEXT,
  ADD COLUMN "imageUrl" TEXT,
  ADD COLUMN "criteria" TEXT,
  ADD COLUMN "skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "level" "BadgeLevel" NOT NULL DEFAULT 'BASIC',
  ADD COLUMN "issuerName" TEXT DEFAULT 'INNOVA',
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "createdById" INTEGER,
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "legacyDigitalBadgeId" TEXT;

CREATE UNIQUE INDEX "Badge_code_key" ON "Badge"("code");
CREATE UNIQUE INDEX "Badge_legacyDigitalBadgeId_key" ON "Badge"("legacyDigitalBadgeId");

ALTER TABLE "BadgeAward"
  ADD COLUMN "verifyCode" TEXT,
  ADD COLUMN "assertionId" TEXT,
  ADD COLUMN "evidenceUrl" TEXT,
  ADD COLUMN "shareUrl" TEXT,
  ADD COLUMN "isRevoked" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "revokedAt" TIMESTAMP(3),
  ADD COLUMN "revokeReason" TEXT,
  ADD COLUMN "expiresAt" TIMESTAMP(3),
  ADD COLUMN "issuedById" INTEGER,
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "legacyBadgeIssuanceId" TEXT;

CREATE UNIQUE INDEX "BadgeAward_verifyCode_key" ON "BadgeAward"("verifyCode");
CREATE UNIQUE INDEX "BadgeAward_assertionId_key" ON "BadgeAward"("assertionId");
CREATE UNIQUE INDEX "BadgeAward_legacyBadgeIssuanceId_key" ON "BadgeAward"("legacyBadgeIssuanceId");

-- ⚠️ PRODUÇÃO: correr antes deste ponto:
--   SELECT "badgeId","userId",count(*) FROM "BadgeAward" GROUP BY 1,2 HAVING count(*)>1;
-- e, se houver linhas, o DELETE de dedup do corpo do PR. Se ficarem duplicados,
-- este índice falha e o deploy pára (comportamento seguro).
CREATE UNIQUE INDEX "BadgeAward_badgeId_userId_key" ON "BadgeAward"("badgeId", "userId");
