# RLS — Row Level Security (INNOVA)

Postgres puro + NestJS/Prisma (não é Supabase: não existe `auth.uid()`). O equivalente é `app.uid()`.

## Activar (por esta ordem)
1. `00_audit.sql` — estado actual (só leitura).
2. `01_rls_harden.sql` como **owner** das tabelas (idempotente). Cria a role `innova_app`, as funções `app.*` e as policies.
3. `ALTER ROLE innova_app PASSWORD '...'` e, se houver PgBouncer, registar `innova_app` no userlist/auth.
4. `02_rls_verify.sql` — falha se alguma tabela ficar sem RLS ou houver policy permissiva.
5. Na app: `RLS_ENABLED=true`, `DATABASE_APP_URL=postgresql://innova_app:...` (migrate/backups continuam com o owner em `DATABASE_URL`).
   A app recusa arrancar em produção se a role ligada for superuser/BYPASSRLS.
6. Desfazer: `RLS_ENABLED=false` e `03_rls_rollback.sql`.

## Modelo de acesso
| Tipo de tabela | Leitura | Escrita |
|---|---|---|
| Com dono forte (`userId`, `employeeId`, `requesterId`, `assigneeId`) | só o dono (`col = app.uid()`) | só o dono |
| Com dono "criador" (`createdById`, `authorId`, `ownerId`) | qualquer autenticado, excepto tabelas sensíveis | só o criador |
| Filhas (`PayslipItem`, `AssessmentAttemptAnswer`, `AiMessage`) | via pai (que já está sob RLS) | via pai |
| Sem dono | qualquer autenticado, excepto lista negra `sensitive` em `01` | só privilegiado |
| `User` | próprio + gestor directo + equipa directa | só o próprio (update) |
| `Employee` | a ficha com o seu email | só a própria (update) |

`app.privileged=on` (roles de `RLS_PRIVILEGED_ROLES`, rotas `@Public`, `runAsSystem`, código fora de pedidos HTTP) vê e escreve tudo.
Ao correr `01`, o `NOTICE` final lista as tabelas abertas a leitura autenticada — rever quando o schema mudar e
acrescentar à lista `sensitive` o que for sensível (folha, avaliações, CRM, segredos).

## Integração no backend
- `src/common/rls/rls-context.ts` — `AsyncLocalStorage` por pedido. O `main.ts` abre o contexto (sem uid, sem privilégios);
  o `JwtAuthGuard` preenche uid + privilégio pelo `roleCode`; rotas `@Public` ficam privilegiadas.
- `src/prisma/rls-pool.ts` — pool que, em cada transacção, faz `set_config('app.user_id', …, true)` e `app.privileged`
  (local à transacção ⇒ seguro com PgBouncer em modo `transaction`). Queries soltas correm em `BEGIN; set_config; query; COMMIT`
  (+1 round-trip); transacções interactivas do Prisma recebem o `set_config` depois do `BEGIN`/`SET TRANSACTION`.
- **`runAsSystem(fn)`**: para leituras legítimas entre utilizadores ou criação por omissão (diretório, leaderboard, `TenantConfig`,
  `ScalabilityInfraSettings`, lookup do utilizador no JWT). As queries Prisma são *lazy*: o `await` tem de acontecer dentro de `fn`
  (o helper já o faz). Usar só em caminhos já protegidos por `@Roles`/validação própria e a devolver campos limitados.
- Fora de pedidos HTTP (cron, Bull, arranque) não há contexto ⇒ código de confiança ⇒ privilegiado.

## Verificado (BD de dev, 2026-10-23)
Comparação GET sem RLS vs com RLS, 650 rotas sem parâmetros, como COLABORADOR (2 utilizadores) e ADMIN:
ADMIN idêntico (só ruído de `health`/`metrics`); COLABORADOR idêntico excepto `/talent/plans` (antes qualquer colaborador
via os 6 planos, agora só os seus — correcção de fuga). Login, refresh, `/auth/me` e INSERT do próprio (`clock-in`) funcionam.
Zero violações de RLS nos logs, incluindo jobs em background. **Não coberto:** escritas/rotas com parâmetros de todos os módulos —
correr a suite de integração e o smoke com `RLS_ENABLED=true` antes de activar em produção.

## Limites
- Protege contra credenciais usadas fora da API e contra IDOR na camada de serviço, **não** contra um backend comprometido
  (a role da app consegue chamar `set_config`).
- `FORCE RLS` (`psql -v force_rls=on`) só com role BYPASSRLS para migrations/pg_dump — no DO gerido não existe.
- RLS não filtra colunas: `User.nif/nib` ficam visíveis na linha do próprio/gestor/equipa; a API continua a ter de as omitir.
