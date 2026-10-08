-- modulo_audit.md §15: contexto normalizado + índices + imutabilidade ao nível da BD
ALTER TABLE "AuditLog"
  ADD COLUMN "eventType" TEXT,
  ADD COLUMN "module" TEXT,
  ADD COLUMN "actorType" TEXT NOT NULL DEFAULT 'USER',
  ADD COLUMN "source" TEXT,
  ADD COLUMN "correlationId" TEXT,
  ADD COLUMN "schemaVersion" INTEGER NOT NULL DEFAULT 1;

CREATE INDEX "AuditLog_timestamp_idx" ON "AuditLog"("timestamp");
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");
CREATE INDEX "AuditLog_severity_idx" ON "AuditLog"("severity");
CREATE INDEX "AuditLog_module_idx" ON "AuditLog"("module");
CREATE INDEX "AuditLog_correlationId_idx" ON "AuditLog"("correlationId");

-- Append-only: UPDATE/DELETE só passam em três casos:
--  1) FK ON DELETE SET NULL de User (única coluna alterada: userId -> NULL);
--  2) marcadores de preferência do utilizador (favoritos/bookmarks), que não são eventos de auditoria;
--  3) purga de retenção autorizada: set_config('app.audit_purge','on',true) dentro da transação.
CREATE OR REPLACE FUNCTION audit_log_immutable() RETURNS trigger AS $$
BEGIN
  IF current_setting('app.audit_purge', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF OLD."action" IN ('CONTENT_BOOKMARK', 'DOC_FAVORITE') THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'AuditLog é append-only: DELETE não permitido (id=%)', OLD."id";
  END IF;
  IF NEW."userId" IS NULL AND OLD."userId" IS NOT NULL
     AND (to_jsonb(NEW) - 'userId') = (to_jsonb(OLD) - 'userId') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'AuditLog é append-only: UPDATE não permitido (id=%)', OLD."id";
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_immutable_trg
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
