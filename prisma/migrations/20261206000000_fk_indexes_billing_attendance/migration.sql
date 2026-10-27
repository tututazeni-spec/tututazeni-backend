-- Índices em FKs sem índice (joins e verificações de ON DELETE RESTRICT em tabelas que crescem).
CREATE INDEX IF NOT EXISTS "billing_subscriptions_planId_idx" ON "billing_subscriptions"("planId");
CREATE INDEX IF NOT EXISTS "AttendanceAdjustment_adjustedById_idx" ON "AttendanceAdjustment"("adjustedById");
