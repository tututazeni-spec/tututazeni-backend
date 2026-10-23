-- 03_rls_rollback.sql — desfaz 01_rls_harden.sql (desliga RLS, remove policies e funções).
-- Não remove a role innova_app (pode ter ligações); fazer à mão: DROP OWNED BY innova_app; DROP ROLE innova_app;
-- Antes de correr: pôr RLS_ENABLED=false na app (ou voltar a ligar com o owner).

BEGIN;
DO $$
DECLARE t text; pol text;
BEGIN
  FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
           WHERE n.nspname='public' AND c.relkind IN ('r','p')
  LOOP
    FOR pol IN SELECT policyname FROM pg_policies
               WHERE schemaname='public' AND tablename=t AND policyname LIKE 'rls\_%'
    LOOP EXECUTE format('DROP POLICY %I ON public.%I', pol, t); END LOOP;
    EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
DROP SCHEMA IF EXISTS app CASCADE;
COMMIT;
