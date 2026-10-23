-- 02_rls_verify.sql — falha (EXCEPTION) se alguma tabela ficou sem RLS ou há policy permissiva.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_class c JOIN pg_namespace s ON s.oid=c.relnamespace
   WHERE s.nspname='public' AND c.relkind IN ('r','p') AND NOT c.relrowsecurity;
  IF n > 0 THEN RAISE EXCEPTION '% tabelas sem RLS', n; END IF;

  SELECT count(*) INTO n FROM pg_policies WHERE schemaname='public'
   AND (coalesce(trim(qual),'') IN ('true','(true)') OR coalesce(trim(with_check),'') IN ('true','(true)')
        OR roles && ARRAY['public','anon']::name[]);
  IF n > 0 THEN RAISE EXCEPTION '% policies permissivas', n; END IF;

  SELECT count(*) INTO n FROM pg_roles WHERE rolname='innova_app' AND (rolsuper OR rolbypassrls);
  IF n > 0 THEN RAISE EXCEPTION 'innova_app tem BYPASSRLS/superuser'; END IF;
  RAISE NOTICE 'OK: RLS activo em todas as tabelas, sem policies permissivas';
END $$;

-- Teste de isolamento (transacção com rollback)
BEGIN;
SET LOCAL ROLE innova_app;
SELECT set_config('app.user_id','1',true);
SELECT 'uid=1 vê users (esperado <=1)' AS teste, count(*) FROM "User";
SELECT set_config('app.user_id','',true);
SELECT 'sem uid vê users (esperado 0)' AS teste, count(*) FROM "User";
SELECT 'sem uid vê payslips (esperado 0)' AS teste, count(*) FROM "Payslip";
ROLLBACK;
