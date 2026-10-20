# Certificados — Fatia 3: Aba partilhada (Cursos + Gestão de Formações) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline, escolhido pelo utilizador). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Um único centro de certificados (Visão geral, Certificados, Modelos, Regras, Histórico) acessível em **Cursos → Certificados** e **Gestão de Formações → Certificados**, sobre os mesmos endpoints e dados.

**Architecture:** Novos endpoints de leitura/gestão no módulo `src/certificates/` (serviço admin separado do serviço do colaborador). Um componente frontend `CertificatesCenter` é montado nas duas páginas; colaboradores sem papel de gestão continuam a ver só "Os meus certificados" (`CertificatesView` existente).

**Tech Stack:** NestJS, Prisma, Jest (unit + `test/integration`); Next.js, TanStack Query, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-19-certificados-design.md` (§3 do prompt: `docs/prompt_certificados_claude_code.md`). Fatia 1 já entregue (`docs/superpowers/plans/2026-10-19-certificados-fatia1-motor-central.md`).

**Fora desta fatia:** os 9 templates, editor e versionamento (F2), revogação/reemissão/importação/lote/alertas (F4), vista do gestor/colaborador alargada e exportações (F5). Por isso o separador "Modelos" é só de consulta e não tem botões de edição; a lista não tem acções de revogar/reemitir.

## Global Constraints

- Mesmas do plano da fatia 1 (Prisma só com campos confirmados no schema, `fullName`, `ValidationPipe` whitelist+forbidNonWhitelisted → DTOs com class-validator, autorização no backend com `Role`, commits locais em PT com `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`, prettier, nunca push/merge).
- Leitura admin: `ADMIN`, `RH`, `AUDITOR`. Escrita (regras, aprovar): `ADMIN`, `RH`. GESTOR e INSTRUCTOR ficam sem acesso nesta fatia (âmbito de equipa é F5).
- Estado exibido = `effectiveStatus()` de `src/certificates/certificates.service.ts` (revogação > expiração > gravado); nunca confiar só em `Certificate.status`.
- Frontend: `AlertCard` para avisos, `PillNav` para separadores, `DataTable`/`Pagination` existentes, sem botões sem comportamento real, Português sem enums crus, cor de acção navy `#0F1F3D`.
- Eventos e cursos no frontend continuam a poder ser pedidos pelo mesmo endpoint; "vencimento próximo" = 30 dias (constante nomeada `EXPIRING_SOON_DAYS`, não espalhada).

## Review Focus

- Colaborador (COLABORADOR) ou GESTOR a chamar qualquer `/certificates/admin/*`, `/certificates/rules`, `/certificates/templates` → 403.
- `limit` enorme ou negativo, `page` 0, `sort` inválido na lista → 400 (nunca devolve a tabela inteira nem 500).
- Pesquisa com `%`, `_`, aspas e texto longo → resultado seguro e vazio, sem erro.
- Regra com `minScore` 150 ou negativo, `criteria` vazio, `activityId` inexistente → 400/404 claro, nada gravado.
- Certificado expirado/revogado nunca é contado como "ativo" na visão geral, mesmo com `status` gravado `ACTIVE`.
- Filtros combinados sem resultados → estado vazio no frontend (não erro), e erro de rede → `QueryError`.

## File Structure

- Create `src/certificates/certificates-admin.service.ts` — `overview()`, `list(filters)`, `history(filters)`.
- Create `src/certificates/certificate-rules.service.ts` — `listRules()`, `upsertRule(dto, actorId)`.
- Create `src/certificates/certificates-admin.dto.ts` — `ListCertificatesQueryDto`, `HistoryQueryDto`, `UpsertCertificateRuleDto`.
- Modify `src/certificates/certificates.controller.ts` (+ módulo): rotas `admin/overview`, `admin/list`, `admin/history`, `rules` (GET/PUT), `templates` (GET) — declaradas **antes** de `:id/pdf`.
- Create `frontend/components/certificates/CertificatesCenter.tsx` (separadores) e `OverviewTab.tsx`, `CertificatesTab.tsx`, `TemplatesTab.tsx`, `RulesTab.tsx`, `HistoryTab.tsx`, `hooks.ts`, `labels.ts`; testes ao lado.
- Modify `frontend/components/courses/constants.ts` / `app/(platform)/courses/page.tsx` (vista `certificates` passa a `CertificatesCenter`), `frontend/components/trainings/types.ts`, `constants.ts`, `app/(platform)/trainings/page.tsx` (novo separador `certificates`), `frontend/lib/queryKeys.ts`.

---

### Task 1: Serviço admin — visão geral e lista

**Files:** Create `src/certificates/certificates-admin.service.ts`, `src/certificates/certificates-admin.dto.ts`; Test `src/certificates/certificates-admin.service.spec.ts`.

**Interfaces:**
- Consumes: `effectiveStatus(cert, now)` (fatia 1).
- Produces:
```ts
export const EXPIRING_SOON_DAYS = 30;
overview(now?: Date): Promise<{ total: number; active: number; pendingApproval: number; expired: number; expiringSoon: number; revoked: number; mandatoryCoveragePct: number | null }>
list(q: ListCertificatesQueryDto): Promise<{ data: AdminCertificateRow[]; total: number; page: number; limit: number; totalPages: number }>
interface AdminCertificateRow { id: number; holderName: string; departmentName: string | null; title: string; activityKind: string | null; status: CertificateStatus; code: string; issuedAt: Date; expiresAt: Date | null; hours: number | null }
```
`ListCertificatesQueryDto` (todos opcionais, `@IsOptional`): `search` (≤100, nome do titular ou título), `status` (enum efectivo: ACTIVE|EXPIRED|REVOKED|PENDING_APPROVAL), `activityKind`, `departmentId` (int), `courseId` (int), `issuedFrom`/`issuedTo`/`expiresFrom`/`expiresTo` (ISO date), `code` (≤64, normalizado com `normalizeVerificationCode`), `page` (int ≥1, def. 1), `limit` (int 1–100, def. 20), `sort` (`issuedAt`|`expiresAt`|`holderName`, def. `issuedAt`), `order` (`asc`|`desc`).
Estado efectivo traduzido para `where` Prisma: ACTIVE = `revoked:false`, `status:ACTIVE`, (`expiresAt` null ou > agora); EXPIRED = `revoked:false`, `status` ACTIVE/EXPIRED e `expiresAt` ≤ agora; REVOKED = `revoked:true` ou `status:REVOKED`; PENDING_APPROVAL = `status:PENDING_APPROVAL`. `deletedAt:null` sempre. Cobertura = (matrículas obrigatórias `mandatory:true` COMPLETED com certificado ACTIVE efectivo) / (matrículas `mandatory:true`); `null` se não houver matrículas obrigatórias.

- [ ] **Step 1: Tests (Prisma mockado)** — `overview` com contagens `{ACTIVE sem validade, ACTIVE expirado, REVOKED, PENDING_APPROVAL, ACTIVE a 10 dias}` devolve `active:1, expired:1, revoked:1, pendingApproval:1, expiringSoon:1, total:5` (o expirado com `status` gravado ACTIVE não conta como ativo); cobertura `null` sem obrigatórias e `50` com 1 de 2; `list` com `status:'EXPIRED'` gera `where` com `expiresAt: { lte: now }` e `revoked:false`; `search:'%_'` é passado como `contains` literal (Prisma parametriza) e não rebenta; `limit:100` → `take:100`, `page:2` → `skip:100`; `code:'abcd-1234'` é normalizado para `ABCD1234`; `code` inválido (`"1' OR"`) devolve lista vazia sem consultar.
- [ ] **Step 2: Run** `npx jest src/certificates/certificates-admin` → FAIL (módulo inexistente).
- [ ] **Step 3: Implement** `CertificatesAdminService` (injecta `PrismaService`); linhas mapeadas com `effectiveStatus`, `holderName = recipientName ?? user.fullName`, `departmentName = user.department?.name` (include `user.department`), `title = title ?? course.title ?? event.title`. Contagens da visão geral com `count` por estado (não carregar linhas).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(certificates): visão geral e lista administrativa`.

### Task 2: Histórico e regras de emissão

**Files:** Create `src/certificates/certificate-rules.service.ts`; Modify `src/certificates/certificates-admin.service.ts` (+`history`), `src/certificates/certificates-admin.dto.ts`; Test `src/certificates/certificate-rules.service.spec.ts`, `certificates-admin.service.spec.ts`.

**Interfaces:**
- Consumes: `AuditService.log` (strict), `evaluateEligibility` não é usado aqui.
- Produces:
```ts
history(q: HistoryQueryDto): Promise<{ data: { id: number; action: string; userName: string | null; certificateId: number | null; timestamp: Date; reason: string | null; metadata: unknown }[]; total: number; page: number; limit: number; totalPages: number }>
listRules(): Promise<{ id: number; activityKind: CertificateActivityKind; activityId: number; activityTitle: string | null; mode: CertificateIssueMode; criteria: RuleCriteria; validityDays: number | null; active: boolean; updatedAt: Date }[]>
upsertRule(dto: UpsertCertificateRuleDto, actorId: number): Promise<Rule>
```
`HistoryQueryDto`: `certificateId?` (int), `action?` (`CERTIFICATE_ISSUED`|`CERTIFICATE_APPROVED`|`CERTIFICATE_RULE_UPSERTED`), `page`, `limit` (1–100). Lê `AuditLog` com `entity:'Certificate'` (campo `entity`, nunca `entityType`), `metadata` com `JSON.parse` tolerante.
`UpsertCertificateRuleDto`: `activityKind` (enum), `activityId` (int ≥1), `mode` (enum), `criteria` (objecto validado: `requireFullCompletion?` bool, `minScore?` 0–100, `minAttendancePct?` 0–100, `requireInstructorApproval?`, `requireManagerApproval?`, `requirePracticalPass?` bool; pelo menos um critério definido → 400 caso contrário), `validityDays?` (int 1–3650), `active?` bool. Upsert por `activityKind_activityId`; só `COURSE` e `EVENT` aceites nesta fatia (o `CertificateFactsService` não suporta TRAINING/LEARNING_PATH → 400 `FACTS_UNSUPPORTED`); `activityId` tem de existir (404). Audita `CERTIFICATE_RULE_UPSERTED` (strict) com `before`/`after`.

- [ ] **Step 1: Tests** — `upsertRule` com `criteria:{}` → `BadRequestException`; com `activityKind:'TRAINING'` → `BadRequestException`; curso inexistente → `NotFoundException`; caso válido chama `certificateRule.upsert` com `where:{activityKind_activityId:{...}}` e `audit.log` com `action:'CERTIFICATE_RULE_UPSERTED'` e `before` null na criação; `minScore:150` rejeitado pelo DTO (teste com `validate()` do class-validator); `history` filtra `entity:'Certificate'` e `entityId` quando há `certificateId`, e devolve `metadata` `null` se o JSON for inválido.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(certificates): histórico e gestão de regras de emissão`.

### Task 3: Rotas HTTP, modelos (consulta) e integração

**Files:** Modify `src/certificates/certificates.controller.ts`, `src/certificates/certificates.module.ts`; Test `test/integration/certificates/certificates-admin.integration-spec.ts`.

**Interfaces:** Consumes Task 1–2. Produces (todas declaradas antes de `:id/pdf` para não colidirem):
- `GET /certificates/admin/overview`, `GET /certificates/admin/list`, `GET /certificates/admin/history`, `GET /certificates/rules` — `@Roles(ADMIN, RH, AUDITOR)`.
- `PUT /certificates/rules` — `@Roles(ADMIN, RH)`.
- `GET /certificates/templates` — `@Roles(ADMIN, RH, AUDITOR)`: `CertificateTemplate` com `deletedAt:null`, campos `{ id, name, description, type, isDefault, isActive, validityDays, signatoryName, signatoryTitle }` (sem `html`/`cssStyle`).

- [ ] **Step 1: Integration tests (Postgres real)** — COLABORADOR e GESTOR → 403 em `admin/overview`, `admin/list`, `rules`, `templates`; AUDITOR → 200 em leitura e 403 em `PUT /certificates/rules`; RH `PUT` válido → 200 e `GET /rules` devolve a regra; `PUT` com `criteria:{}` → 400; `admin/list?limit=1000` → 400 e `?page=0` → 400 e `?sort=password` → 400; `admin/list?search=<nome do titular>` devolve o certificado emitido no teste; certificado com `expiresAt` passado e `status` ACTIVE aparece em `?status=EXPIRED` e não em `?status=ACTIVE`; `admin/history?certificateId=<id>` devolve `CERTIFICATE_ISSUED`. Teardown filhos→pais (certificado → regra → matrícula → curso).
- [ ] **Step 2: Run** (`NODE_OPTIONS=--max-old-space-size=8192`, `--runInBand`, em segundo plano) → FAIL (404).
- [ ] **Step 3: Implement** rotas + registar `CertificatesAdminService` e `CertificateRulesService` no módulo.
- [ ] **Step 4: Run** → PASS; correr também `certificates-api` e `courses` para confirmar que a ordem das rotas não quebrou `my`/`:id/pdf`.
- [ ] **Step 5: Commit** `feat(certificates): endpoints do centro de certificados`.

### Task 4: Frontend — centro de certificados partilhado

**Files:** Create `frontend/components/certificates/{CertificatesCenter,OverviewTab,CertificatesTab,TemplatesTab,RulesTab,HistoryTab}.tsx`, `hooks.ts`, `labels.ts`; Test `CertificatesCenter.test.tsx`, `CertificatesTab.test.tsx`; Modify `frontend/lib/queryKeys.ts`, `frontend/components/certificates/types.ts`.

**Interfaces:**
- Consumes endpoints da Task 3 via `useApiQuery`/`useApiMutation`; `CertificatesView` (existente) para "Os meus certificados"; `useCurrentRole()`.
- Produces `CertificatesCenter(): JSX.Element` — se o papel ∈ {ADMIN, RH, AUDITOR} mostra `PillNav` com **Visão geral · Certificados · Modelos · Regras · Histórico · Os meus**; caso contrário só `CertificatesView`. `labels.ts`: `STATUS_LABEL`, `KIND_LABEL`, `MODE_LABEL` (Automático/Manual/Mediante aprovação), `CRITERIA_LABEL` — nenhum enum cru no ecrã.
- Visão geral: cartões (total, ativos, pendentes de aprovação, expirados, vencem em 30 dias, revogados, cobertura obrigatória — "—" quando `null`); clicar num cartão muda para o separador Certificados com o filtro de estado aplicado.
- Certificados: pesquisa, filtros (estado, tipo, departamento via lista existente, datas de emissão/validade, código), ordenação e `Pagination`; acções reais por linha: **Descarregar PDF** (hook `usePdfDownload('certificate', id)`, só ACTIVE/EXPIRED) e **Aprovar** (`POST /certificates/:id/approve`, só PENDING_APPROVAL e só ADMIN/RH, com `useConfirm`); estado vazio (`EmptyState`) e erro (`QueryError`).
- Modelos: lista só de leitura, com texto "A edição de modelos chega numa próxima fase" apenas como nota (sem botões de edição).
- Regras: lista + formulário (modal) para criar/editar regra de Curso ou Evento (selector da atividade com pesquisa nas listas existentes de cursos/eventos), modo, critérios (caixas e números com limites 0–100), validade em dias, activa; só ADMIN/RH vêem o formulário; erro 400/404 mostrado no modal.
- Histórico: tabela paginada com acção em português, quem, quando, motivo.

- [ ] **Step 1: Tests (vitest)** — `CertificatesCenter` com papel COLABORADOR mostra só "Os meus certificados" (sem `PillNav` de gestão); com RH mostra os 6 separadores; `CertificatesTab`: linha `PENDING_APPROVAL` mostra "Aprovar" para RH e não para AUDITOR; linha `REVOKED` não mostra "Descarregar PDF"; lista vazia mostra o estado vazio; nenhum texto cru (`PENDING_APPROVAL`, `ACTIVE`) aparece no DOM.
- [ ] **Step 2: Run** `npx vitest run components/certificates` → FAIL.
- [ ] **Step 3: Implement** os componentes seguindo os padrões de `components/courses/GestaoView.tsx` e `components/trainings/GestaoView.tsx` (Card/NavyCard, Badge, DataTable, Pagination, `useConfirm`, `useToast`).
- [ ] **Step 4: Run** → PASS; `npx tsc --noEmit`; `npx eslint components/certificates`.
- [ ] **Step 5: Commit** (repo frontend) `feat(certificates): centro de certificados partilhado`.

### Task 5: Montar nas duas áreas

**Files:** Modify `frontend/app/(platform)/courses/page.tsx:174`, `frontend/components/courses/constants.ts` (título/hint do separador), `frontend/components/trainings/types.ts` (`View` + `'certificates'`), `frontend/components/trainings/constants.ts` (NAV, TITLES), `frontend/app/(platform)/trainings/page.tsx`; Test `frontend/components/trainings/constants.test.ts` (ou o teste existente da navegação, se houver).

**Interfaces:** Consumes `CertificatesCenter`. Produces: **Cursos → Certificados** renderiza `<CertificatesCenter />` (substitui `<CertificatesView />` directo); **Gestão de Formações → Certificados** (`id:'certificates'`, ícone `Award`, hint "Emissão, regras e histórico") visível para todos os papéis autenticados (colaboradores veem só os seus), usando o mesmo componente e a mesma chave de cache (`queryKeys.certificates.*`) — alterar num lado reflecte-se no outro sem recarregar.

- [ ] **Step 1: Test** — NAV de formações contém o item `certificates`; `TITLES.certificates` definido; em Cursos o separador `certificates` continua em NAV.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** testes dos dois módulos (`components/trainings components/courses components/certificates`) → PASS.
- [ ] **Step 5: Commit** (repo frontend) `feat(certificates): aba Certificados em Gestão de Formações e Cursos`.

### Task 6: Verificação final da fatia

- [ ] `npx tsc --noEmit` e eslint (BE ficheiros não-spec, FE ficheiros novos), prettier nos alterados.
- [ ] Suite unitária completa BE (`npx jest --forceExit`) e `vitest run` FE (módulos tocados), e integração `certificates|courses|trainings` em segundo plano.
- [ ] Verificação visual real: reiniciar o backend (processo único, `prisma generate` feito), abrir as duas páginas como RH e confirmar que mostram os mesmos números; aprovar um certificado pendente e ver o reflexo na outra área e no histórico.
- [ ] Resumo ao utilizador: o que ficou funcional, decisões (GESTOR/INSTRUCTOR sem acesso até F5, Modelos só leitura até F2), pendências.
