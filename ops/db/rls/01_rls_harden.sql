-- 01_rls_harden.sql — RLS deny-by-default em TODAS as tabelas de public + policies de dono.
-- Idempotente. Corre como OWNER das tabelas (ex.: doadmin/postgres), NUNCA como innova_app.
-- NOTA: este projecto usa Postgres puro + NestJS/Prisma (sem Supabase): não existe auth.uid().
--       O equivalente é app.uid(), lido de set_config('app.user_id', <id do JWT>, true)
--       que o backend define em cada transacção (ver README.md).
-- Opcional: psql -v force_rls=on -> FORCE ROW LEVEL SECURITY (sujeita também o owner;
--           exige que migrations/pg_dump corram com role BYPASSRLS — indisponível no DO gerido).

\if :{?force_rls}
\else
\set force_rls off
\endif
SELECT set_config('app.force_rls', :'force_rls', false);

BEGIN;

-- ---------- Role da aplicação (sem BYPASSRLS, sem ser owner) ----------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'innova_app') THEN
    CREATE ROLE innova_app LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
  ALTER ROLE innova_app NOSUPERUSER NOBYPASSRLS;
END $$;
-- Definir a password fora deste ficheiro: ALTER ROLE innova_app PASSWORD '...';

-- ---------- Funções de identidade (equivalente a auth.uid()) ----------
CREATE SCHEMA IF NOT EXISTS app;
GRANT USAGE ON SCHEMA app TO innova_app;

CREATE OR REPLACE FUNCTION app.uid() RETURNS integer
LANGUAGE sql STABLE AS
$f$ SELECT nullif(current_setting('app.user_id', true), '')::integer $f$;

-- Elevação explícita para caminhos de confiança (login, jobs, endpoints já validados por RBAC)
CREATE OR REPLACE FUNCTION app.is_privileged() RETURNS boolean
LANGUAGE sql STABLE AS
$f$ SELECT coalesce(nullif(current_setting('app.privileged', true), ''), 'off') = 'on' $f$;

CREATE OR REPLACE FUNCTION app.my_email() RETURNS text
LANGUAGE sql STABLE AS
$f$ SELECT lower(u.email) FROM "User" u WHERE u.id = app.uid() $f$;

-- Gestor directo do utilizador (para /users/me mostrar o gestor sem abrir a tabela User)
CREATE OR REPLACE FUNCTION app.my_manager_id() RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$f$ SELECT u."managerId" FROM "User" u WHERE u.id = app.uid() $f$;

CREATE OR REPLACE FUNCTION app.my_employee_id() RETURNS integer
LANGUAGE sql STABLE AS
$f$ SELECT e.id FROM "Employee" e WHERE lower(e.email) = app.my_email() LIMIT 1 $f$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO innova_app;

-- ---------- Privilégios mínimos ----------
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO innova_app;
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
           WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relname <> '_prisma_migrations'
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO innova_app', t);
  END LOOP;
END $$;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO innova_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO innova_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO innova_app;

-- ---------- RLS + policies ----------
DO $$
DECLARE
  force_on  boolean := (current_setting('app.force_rls') = 'on');
  -- Tabelas SEM coluna de dono: por omissão legíveis por qualquer utilizador autenticado
  -- (catálogos, cursos, eventos, roles...; escrita só privilegiada). Esta lista NEGRA exclui as
  -- sensíveis (folha salarial, avaliações, auditoria interna, CRM, integrações, segredos):
  -- essas ficam deny-by-default. REVER periodicamente; o NOTICE no fim lista as tabelas abertas.
  sensitive text := '^(_prisma|Payroll|PayslipItem|EmployeeCompensation|SalaryComponent|Eval360Feedback|'
    || 'Evaluation(Answer|Attempt|Response|Result|Request)|EvaluatorAssignment|PerformanceEvaluation|CalibrationLog|'
    || 'GoalEvaluation|CompetencyEvaluation|LeadershipFeedback360|LeadershipParticipant|InternalAudit|'
    || 'SecurityIncident|Funder|Partner|Beneficiary|Declaration|declaration_|backup_|integration_|'
    || 'system_alerts|Webhook|ApiIntegrationLog|scalability_|database_size|frontend_perf|AttendanceAdjustment|'
    || 'LeaveApproval|LeaveDocument|LeaveImpact|absence_|Mentoring|OneOnOne|Kudos|Feedback|Recognition|'
    || 'KeyResult|SuccessionP|CriticalPosition|Pdi|LegacyPdi|DevelopmentPlanAction|AiMessage|AvatarTraining(Session|Interaction|Assessment)|'
    || 'SurveyAnswer|OnboardingCheckin|PostClassEvaluation|TrainingImpact|Executive|AuditPolicy|tenant_configs|'
    || 'RoiConfig|ProcessIntegrationLog|MonitoringRecord|Dashboard(Snapshot)|AllowedLocation|CountryConfig|'
    || 'automation_dead_letters|InstructorPayout|ReportApproval|ReportLog|TeamHealth|TrainingAssessment|AssessmentAttemptAnswer|WorkDeclReview|EnrollmentRun|'
    || 'ApiKey|AuditExport|AvatarTrainingProviderConfig|CostEntry|FundingGrant|GrantDisbursement|RoiAnalysis|LeadershipProgramCost|'
    || 'SavedReport|ReportSchedule|InstitutionalSnapshot|ScalabilitySnapshot|GlobalSearchIndex|'
    || 'leave_delegations|leave_setting_versions|content_delivery_configs|automation_connections)';
  -- Tabelas filhas sem coluna de dono: acesso decidido pelo pai (que já está sob RLS).
  -- formato 'filha:coluna_fk:pai' (pai com PK "id").
  via       text[] := ARRAY['PayslipItem:payslipId:Payslip',
                            'AssessmentAttemptAnswer:attemptId:AssessmentAttempt',
                            'AiMessage:sessionId:AiTutorSession'];
  v text[];
  opened    text[] := ARRAY[]::text[];
  prio      text[] := ARRAY['userId','employeeId','ownerId','authorId','createdById','requesterId','assigneeId'];
  weak      text[] := ARRAY['createdById','authorId','ownerId'];  -- "quem criou": escrita do criador, leitura partilhada
  t text; col text; typ text; expr text; pol text; sel text;
BEGIN
  FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
           WHERE n.nspname='public' AND c.relkind IN ('r','p') ORDER BY 1
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    IF force_on THEN EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t); END IF;

    -- limpa policies geridas por este script
    FOR pol IN SELECT policyname FROM pg_policies
               WHERE schemaname='public' AND tablename=t AND policyname LIKE 'rls\_%'
    LOOP EXECUTE format('DROP POLICY %I ON public.%I', pol, t); END LOOP;

    -- caminhos de confiança do backend (app.privileged=on)
    EXECUTE format('CREATE POLICY rls_privileged ON public.%I FOR ALL TO innova_app
                    USING (app.is_privileged()) WITH CHECK (app.is_privileged())', t);

    -- expressão de dono
    expr := NULL; col := NULL; typ := NULL;
    IF t = 'User' THEN expr := '"id" = app.uid()';
    ELSIF t = 'Employee' THEN expr := 'lower("email") = app.my_email()';
    ELSE
      SELECT k.column_name, k.data_type INTO col, typ
      FROM information_schema.columns k
      WHERE k.table_schema='public' AND k.table_name=t AND k.column_name = ANY(prio)
      ORDER BY array_position(prio, k.column_name::text) LIMIT 1;
      IF col IS NOT NULL THEN
        IF col = 'employeeId' THEN expr := format('%I = app.my_employee_id()', col);
        ELSIF typ = 'integer' THEN expr := format('%I = app.uid()', col);
        ELSE expr := format('%I = app.uid()::text', col);
        END IF;
      END IF;
    END IF;

    v := NULL;
    SELECT string_to_array(x, ':') INTO v FROM unnest(via) x WHERE split_part(x, ':', 1) = t;
    IF v IS NOT NULL THEN
      expr := format('%I IN (SELECT id FROM public.%I)', v[2], v[3]);
      EXECUTE format('CREATE POLICY rls_via_parent_select ON public.%I FOR SELECT TO innova_app USING (%s)', t, expr);
      EXECUTE format('CREATE POLICY rls_via_parent_insert ON public.%I FOR INSERT TO innova_app WITH CHECK (%s)', t, expr);
      EXECUTE format('CREATE POLICY rls_via_parent_update ON public.%I FOR UPDATE TO innova_app USING (%s) WITH CHECK (%s)', t, expr, expr);
      EXECUTE format('CREATE POLICY rls_via_parent_delete ON public.%I FOR DELETE TO innova_app USING (%s)', t, expr);
    ELSIF expr IS NOT NULL THEN
      sel := expr;
      IF col = ANY(weak) AND t !~ sensitive THEN  -- conteúdo criado por alguém mas legível por todos
        sel := format('%s OR app.uid() IS NOT NULL', expr);
        opened := opened || t;
      END IF;
      EXECUTE format('CREATE POLICY rls_owner_select ON public.%I FOR SELECT TO innova_app USING (%s)', t, sel);
      EXECUTE format('CREATE POLICY rls_owner_update ON public.%I FOR UPDATE TO innova_app USING (%s) WITH CHECK (%s)', t, expr, expr);
      IF t = 'User' THEN  -- o gestor e a equipa directa também são visíveis
        EXECUTE format('CREATE POLICY rls_user_manager_team ON public.%I FOR SELECT TO innova_app
                        USING ("id" = app.my_manager_id() OR "managerId" = app.uid())', t);
      END IF;
      IF t NOT IN ('User','Employee') THEN  -- criar/apagar contas e fichas: só privilegiado
        EXECUTE format('CREATE POLICY rls_owner_insert ON public.%I FOR INSERT TO innova_app WITH CHECK (%s)', t, expr);
        EXECUTE format('CREATE POLICY rls_owner_delete ON public.%I FOR DELETE TO innova_app USING (%s)', t, expr);
      END IF;
    ELSIF t !~ sensitive THEN
      EXECUTE format('CREATE POLICY rls_shared_select ON public.%I FOR SELECT TO innova_app USING (app.uid() IS NOT NULL)', t);
      opened := opened || t;
    END IF;
    -- sem expr e na lista negra: nenhuma policy de utilizador => deny-by-default
  END LOOP;
  RAISE NOTICE 'Tabelas abertas a leitura autenticada (%): %', cardinality(opened), array_to_string(opened, ', ');
END $$;

-- pg_stat_statements expõe texto de queries
DO $$ BEGIN
  EXECUTE 'REVOKE ALL ON pg_stat_statements FROM PUBLIC';
  EXECUTE 'REVOKE ALL ON pg_stat_statements_info FROM PUBLIC';
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'pg_stat_statements: %', SQLERRM; END $$;

COMMIT;
