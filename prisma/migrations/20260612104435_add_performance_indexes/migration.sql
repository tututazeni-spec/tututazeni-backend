-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "BadgeAward_userId_idx" ON "BadgeAward"("userId");

-- CreateIndex
CREATE INDEX "BadgeAward_awardedAt_idx" ON "BadgeAward"("awardedAt");

-- CreateIndex
CREATE INDEX "Certificate_userId_idx" ON "Certificate"("userId");

-- CreateIndex
CREATE INDEX "Certificate_courseId_idx" ON "Certificate"("courseId");

-- CreateIndex
CREATE INDEX "Certificate_enrollmentId_idx" ON "Certificate"("enrollmentId");

-- CreateIndex
CREATE INDEX "LegacyPdi_employeeId_idx" ON "LegacyPdi"("employeeId");

-- CreateIndex
CREATE INDEX "LegacyPdi_status_idx" ON "LegacyPdi"("status");

-- CreateIndex
CREATE INDEX "QuizAttempt_userId_idx" ON "QuizAttempt"("userId");

-- CreateIndex
CREATE INDEX "QuizAttempt_quizId_idx" ON "QuizAttempt"("quizId");
