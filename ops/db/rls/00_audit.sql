-- 00_audit.sql — auditoria só de leitura (RLS, policies permissivas, grants, role de ligação)
-- Uso: psql "$DATABASE_URL" -f ops/db/rls/00_audit.sql

\echo '== 1. Role de ligação (superuser/BYPASSRLS ignoram RLS por completo) =='
SELECT current_user, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user;

\echo '== 2. Tabelas SEM Row Level Security =='
SELECT c.relname AS tabela
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r','p') AND NOT c.relrowsecurity
ORDER BY 1;

\echo '== 3. Policies permissivas (true / roles anon-public) =='
SELECT tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND ( coalesce(trim(qual),'') IN ('true','(true)')
     OR coalesce(trim(with_check),'') IN ('true','(true)')
     OR roles && ARRAY['public','anon']::name[] );

\echo '== 4. Grants para PUBLIC/anon em objectos do schema public =='
SELECT grantee, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND grantee IN ('PUBLIC','anon')
ORDER BY 2,3;

\echo '== 5. Tabelas sem coluna de dono reconhecida (ficam deny-by-default) =='
SELECT c.relname AS tabela
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
  AND NOT EXISTS (SELECT 1 FROM information_schema.columns k
                  WHERE k.table_schema='public' AND k.table_name=c.relname
                    AND k.column_name IN ('userId','employeeId','ownerId','authorId','createdById','requesterId','assigneeId'))
ORDER BY 1;
