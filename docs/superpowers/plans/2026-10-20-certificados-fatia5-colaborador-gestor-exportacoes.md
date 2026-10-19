# Certificados — Fatia 5: Colaborador, gestor e exportações Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline, escolhido pelo utilizador). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Dar ao colaborador uma área pessoal completa (filtros, pendentes, obrigatórias em falta, partilha real), ao gestor uma visão consolidada da equipa com aprovação, e a quem gere/audita exportações CSV, Excel e PDF filtradas e limitadas às suas permissões.

**Architecture:** Âmbito de dados num único sítio (`CertificateScopeService`: ver tudo | só a equipa directa | nada). `CertificatesAdminService` passa a aceitar esse âmbito; novos serviços de equipa, resumo pessoal e exportação. Sem alterações de schema (esta fatia não tem migração).

**Tech Stack:** NestJS, Prisma, exceljs e pdfkit (já instalados), Jest (unit + `test/integration`); Next.js, TanStack Query, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-19-certificados-design.md` (§9, §10.2, §10.4, §16 de `docs/prompt_certificados_claude_code.md`). Fatias 1, 3 e 4 já entregues.

**Fora desta fatia:** os 9 templates e o editor (F2). Não há integração oficial de "enviar o PDF anexado" (o e-mail leva a ligação de verificação, não o anexo).

## Global Constraints

- Mesmas das fatias anteriores (campos Prisma confirmados, DTOs com class-validator, autorização no backend com `Role`, commits locais PT com `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`, nunca push/merge, prettier só em ficheiros alterados do backend e nunca em pastas inteiras do frontend).
- **Âmbito:** ADMIN, RH e AUDITOR veem tudo; GESTOR, LIDER e DIRECTOR veem **só a equipa directa** (`User.managerId = actor.id`, como `enrollments.service.ts`); qualquer outro papel não acede às rotas de gestão. O âmbito é aplicado no backend em listas, resumos, exportações e aprovação — nunca só na interface.
- Gestores aprovam apenas certificados pendentes de titulares da sua equipa; ADMIN/RH aprovam qualquer um. AUDITOR nunca altera.
- Exportações: máximo 5000 linhas por pedido (acima → 400 a pedir para filtrar); CSV com escape de aspas/vírgulas/quebras e neutralização de fórmulas (`=`, `+`, `-`, `@` no início da célula); cada exportação é auditada (`CERTIFICATE_EXPORTED`, formato, contagem, filtros — nunca o conteúdo).
- Partilha: só botões que funcionem — ligação pública de verificação (existe), LinkedIn por **URL oficial "Add to profile"** (`https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME&…`), e-mail **só se o SMTP estiver configurado** (`MailService.isConfigured()`).
- Colaborador só vê os próprios certificados; o e-mail vai sempre para o endereço do próprio titular.
- Frontend: `AlertCard`, `QueryError`, `EmptyState`, `PillNav`, rótulos em português sem enums crus, download via o helper existente (`components/audit/downloadAuditFile.ts`, revogação diferida do blob).

## Review Focus

- Gestor a pedir `GET /certificates/admin/list?userId=<fora da equipa>` ou a exportar com filtros que apanhariam outra equipa → só devolve a sua equipa; gestor sem subordinados → lista vazia (nunca a empresa inteira).
- Gestor a aprovar certificado pendente de alguém fora da equipa → 404 (não revela existência); aprovar o de um subordinado → 201.
- COLABORADOR e INSTRUCTOR a chamar exportação, resumo de equipa ou lista administrativa → 403.
- Exportar > 5000 linhas → 400; exportar com `format` inválido → 400; CSV com célula `=HYPERLINK(...)` no nome da formação → começa por `'` (não executa) e título com vírgula/aspas/quebra de linha mantém a linha íntegra.
- `email-me` com SMTP não configurado → 409 claro; certificado revogado/pendente/de outro titular → 404/409; nunca envia para outro endereço.
- Resumo pessoal: formação obrigatória já concluída com certificado válido não aparece como "em falta"; obrigatória cancelada/expirada não conta.

## File Structure

- Create `src/certificates/certificate-scope.service.ts` — `resolveScope(actor)`.
- Create `src/certificates/certificates-team.service.ts` — `teamSummary(actor, departmentId?)`, `assertCanApprove(actor, certificateId)`.
- Create `src/certificates/certificates-export.service.ts` + `certificates-csv.ts` (CSV seguro) — `exportCertificates(q, format, actor)`.
- Create `src/certificates/certificates-me.service.ts` — `mySummary(userId)`, `emailMe(id, user)`; `CertificatesService.listMine` ganha `verifyUrl` e `linkedInUrl`.
- Modify `src/certificates/certificates-admin.service.ts` (aceitar âmbito), `certificates.controller.ts`, `certificates.module.ts`, `src/mail/mail.service.ts` (`isConfigured()`).
- Frontend: create `components/certificates/{TeamSummaryTab,MySummaryPanel,ExportMenu}.tsx`; modify `components/courses/CertificatesView.tsx`, `CertificatesCenter.tsx`, `CertificatesTab.tsx`, `types.ts`, `labels.ts`; testes ao lado.

---

### Task 1: Âmbito e resumo da equipa

**Files:** Create `src/certificates/certificate-scope.service.ts`, `src/certificates/certificates-team.service.ts`; Modify `src/certificates/certificates-admin.service.ts`; Test `certificate-scope.service.spec.ts`, `certificates-team.service.spec.ts`, `certificates-admin.service.spec.ts`.

**Interfaces:**
- Produces:
```ts
export type CertificateScope = { kind: 'ALL' } | { kind: 'TEAM'; userIds: number[] }
CertificateScopeService.resolveScope(actor: { id: number; role?: { name: string } | null }): Promise<CertificateScope>   // lança ForbiddenException para papéis sem acesso
CertificatesAdminService.overview(now?: Date, scope?: CertificateScope): Promise<AdminOverview>
CertificatesAdminService.list(q: ListCertificatesQueryDto, now?: Date, scope?: CertificateScope): Promise<Paginated<AdminCertificateRow>>
CertificatesTeamService.teamSummary(actor, departmentId?: number): Promise<{ members: TeamMemberRow[]; totals: { members: number; active: number; expired: number; expiringSoon: number; pendingApproval: number; mandatoryPending: number; inProgress: number; mandatoryCoveragePct: number | null } }>
interface TeamMemberRow { userId: number; fullName: string; active: number; expired: number; expiringSoon: number; pendingApproval: number; mandatoryPending: number; inProgress: number }
CertificatesTeamService.assertCanApprove(actor, certificateId: number): Promise<void>   // 404 se fora do âmbito
```
`resolveScope`: ADMIN/RH/AUDITOR → `ALL`; GESTOR/LIDER/DIRECTOR → `TEAM` com os ids de `user.findMany({ where: { managerId: actor.id }, select: { id: true } })`; outros → `ForbiddenException`. Com âmbito `TEAM`, `list` e `overview` acrescentam `userId: { in: ids }` (lista vazia → `userId: { in: [] }`, que não devolve nada) e ignoram qualquer filtro de departamento que saia do âmbito (o filtro só restringe, nunca alarga). `teamSummary` por gestor usa a equipa directa; ADMIN/RH/AUDITOR podem passar `departmentId` (membros activos desse departamento, máx. 500). Contagens por estado efectivo (`effectiveStatus`); `mandatoryPending` = matrículas `mandatory:true` com estado fora de `COMPLETED/CANCELLED/EXPIRED`; `inProgress` = matrículas `IN_PROGRESS`; cobertura = obrigatórias `COMPLETED` com certificado válido ÷ obrigatórias (null se não houver).

- [ ] **Step 1: Tests (Prisma mockado)** — `resolveScope`: ADMIN/RH/AUDITOR → ALL; GESTOR com 2 subordinados → `{TEAM,[ids]}`; COLABORADOR e INSTRUCTOR → `ForbiddenException`; `list` com âmbito TEAM e `userIds:[]` gera `userId:{in:[]}`; com TEAM `userIds:[1,2]` o `where` contém `userId:{in:[1,2]}` e `departmentId` de outro departamento não o alarga; `overview` TEAM filtra as contagens; `teamSummary`: dois membros, um com certificado válido a 10 dias e outro expirado e uma obrigatória pendente → contagens por membro e `totals`; obrigatória cancelada não conta; `assertCanApprove`: titular na equipa → ok; fora → `NotFoundException`; ADMIN → ok sem consultar equipa.
- [ ] **Step 2: Run** `npx jest src/certificates/certificate-scope src/certificates/certificates-team src/certificates/certificates-admin` → FAIL.
- [ ] **Step 3: Implement** (scope aplicado em `list`/`overview` como `AND` adicional).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(certificates): âmbito de equipa e resumo para gestores`.

### Task 2: Exportações (CSV, Excel, PDF)

**Files:** Create `src/certificates/certificates-csv.ts`, `src/certificates/certificates-export.service.ts`; Modify `src/certificates/certificates-admin.dto.ts` (`ExportCertificatesQueryDto extends ListCertificatesQueryDto` + `format`); Test `certificates-csv.spec.ts`, `certificates-export.service.spec.ts`.

**Interfaces:**
- Consumes `CertificatesAdminService.list`/`CertificateScopeService.resolveScope`, `buildXlsxBuffer` (`src/common/utils/xlsx-export.util.ts`), `AuditService.log`.
- Produces:
```ts
export function safeCsvCell(value: unknown): string
export function buildSafeCsv(headers: string[], rows: unknown[][]): string
type ExportFormat = 'csv' | 'xlsx' | 'pdf'
CertificatesExportService.exportCertificates(q: ExportCertificatesQueryDto, actor): Promise<{ buffer: Buffer; contentType: string; filename: string; rows: number }>
```
`safeCsvCell`: `null/undefined` → vazio; datas → `YYYY-MM-DD`; texto com `"`, `,`, `\n` ou `\r` entre aspas com `"` duplicadas; célula que começa por `=`, `+`, `-` ou `@` recebe `'` à frente. CSV com BOM UTF-8. `format` por omissão `csv`; valor fora de csv/xlsx/pdf → 400 (decorador `@IsIn`). Linhas: todas as da lista com os mesmos filtros (sem paginação), no âmbito do actor, máx. 5000 (`take: 5001`; se vier mais de 5000 → `BadRequestException('Demasiados resultados…')`). Colunas (pt): Titular, Departamento, Formação, Tipo, Origem, Estado, Emissão, Validade, Código. Estado e tipo em português. PDF: A4 horizontal com cabeçalho, filtros aplicados em texto, tabela paginada (repete cabeçalho em cada página) e rodapé com data/hora e total. `filename`: `certificados-AAAA-MM-DD.<ext>`. Auditoria `CERTIFICATE_EXPORTED` (strict) com `{ format, rows, filters }` onde `filters` não inclui o texto de pesquisa em claro nem códigos.

- [ ] **Step 1: Tests** — `safeCsvCell('=HYPERLINK("x")')` começa por `'`; `'+1'`, `'-2'`, `'@x'` idem; texto com vírgula, aspas e quebra de linha fica entre aspas íntegro (e um parser CSV mínimo no teste recupera a célula original); `null` → ''; Date → `2026-10-20`; `buildSafeCsv` com BOM; export: `format:'xlsx'` devolve buffer que começa por `PK` (zip) e `contentType` correcto; `'pdf'` começa por `%PDF-`; `'csv'` começa por BOM e tem 1 linha por certificado; mais de 5000 → `BadRequestException` e nada auditado; auditoria chamada uma vez com `rows` e sem `search`; TEAM scope é passado ao `list`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(certificates): exportação CSV, Excel e PDF com âmbito e auditoria`.

### Task 3: Área do colaborador — resumo, partilha e e-mail

**Files:** Create `src/certificates/certificates-me.service.ts`; Modify `src/certificates/certificates.service.ts` (`listMine` com `verifyUrl`/`linkedInUrl`), `src/mail/mail.service.ts` (`isConfigured()`); Test `certificates-me.service.spec.ts`, `certificates.service.spec.ts`, `src/mail/mail.service.spec.ts` (se existir; senão cobrir no spec novo).

**Interfaces:**
- Produces:
```ts
MailService.isConfigured(): Promise<boolean>
CertificatesMeService.mySummary(userId: number): Promise<{ emailEnabled: boolean; pending: { id: number; title: string }[]; expiringSoon: { id: number; title: string; expiresAt: Date }[]; mandatoryMissing: { enrollmentId: number; courseId: number; title: string; deadline: Date | null; status: string }[] }>
CertificatesMeService.emailMe(id: number, user: { id: number }): Promise<{ emailed: true }>
buildLinkedInUrl(c: { title: string; issuerName: string | null; issuedAt: Date; expiresAt: Date | null; validationCode: string }): string
```
`listMine` acrescenta a cada linha `verifyUrl = buildVerifyUrl(validationCode)` e (só estado efectivo ACTIVE) `linkedInUrl`. `buildLinkedInUrl` → `https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME&name=…&organizationName=…&issueYear=&issueMonth=&expirationYear=&expirationMonth=&certUrl=<verifyUrl>&certId=<code>` com todos os valores `encodeURIComponent` (mês 1–12, omitir expiração se null). `mySummary`: `pending` = certificados do utilizador `PENDING_APPROVAL`; `expiringSoon` = válidos a expirar em `EXPIRING_SOON_DAYS`; `mandatoryMissing` = matrículas `mandatory:true` do utilizador com estado fora de `COMPLETED/CANCELLED/EXPIRED`; `emailEnabled = await mail.isConfigured()`. `emailMe`: 404 se o certificado não existe ou não é do utilizador; 409 se não for `ACTIVE`; 409 `E-mail não configurado` se `!isConfigured()`; envia para `user.email` do próprio titular (lido da BD, nunca do pedido) com o título e a ligação de verificação; audita `CERTIFICATE_EMAILED_TO_SELF`.

- [ ] **Step 1: Tests** — `buildLinkedInUrl` com título `Segurança & Saúde` codifica `%26`, inclui `certId`, omite expiração quando null, e `certUrl` termina em `/verify/<código>`; `listMine`: ACTIVE tem `linkedInUrl`, REVOKED/EXPIRED não; `mySummary`: obrigatória COMPLETED não aparece, CANCELLED não aparece, IN_PROGRESS aparece; pendentes e a vencer separados; `emailEnabled` reflecte `isConfigured`; `emailMe`: de outro titular → NotFound, REVOKED → Conflict, SMTP não configurado → Conflict sem enviar, sucesso envia para o e-mail do titular da BD.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(certificates): área do colaborador com partilha e e-mail`.

### Task 4: Rotas HTTP e integração

**Files:** Modify `src/certificates/certificates.controller.ts`, `certificates.module.ts`; Test `test/integration/certificates/certificates-scope.integration-spec.ts`.

**Interfaces:** (declaradas antes de `:id/...`; `Query` validado pelos DTOs)
- `GET /certificates/admin/overview` e `GET /certificates/admin/list`: papéis passam a **ADMIN, RH, AUDITOR, GESTOR, LIDER, DIRECTOR**, com `resolveScope(user)` (os restantes endpoints `admin/history`, `rules`, `templates` continuam só ADMIN/RH/AUDITOR).
- `GET /certificates/admin/export?format=&…filtros` — mesmos papéis e âmbito.
- `GET /certificates/team/summary?departmentId=` — GESTOR, LIDER, DIRECTOR (equipa directa) e ADMIN, RH, AUDITOR (`departmentId` opcional).
- `POST /certificates/:id/approve` — papéis ADMIN, RH, GESTOR, LIDER, DIRECTOR; `assertCanApprove` antes de `issuance.approve`.
- `GET /certificates/my/summary` (todos os papéis autenticados); `POST /certificates/:id/email-me` (todos os autenticados; o serviço valida o dono).

- [ ] **Step 1: Integration tests (Postgres real)** — gestor (`int.manager`) vê só a equipa: cria subordinado do gestor (utilizador de teste com `managerId` do gestor) e um colaborador fora da equipa, ambos com certificado; `admin/list` do gestor devolve apenas o do subordinado; `admin/overview` conta só a equipa; gestor sem subordinados (novo utilizador sem equipa) → lista vazia; colaborador → 403 em `admin/list`, `admin/export` e `team/summary`; gestor aprova certificado pendente do subordinado → 201 e do de fora → 404; export CSV pelo RH devolve `text/csv` com BOM e a linha do certificado, XLSX começa por `PK`, PDF por `%PDF-`, `format=zip` → 400; export do gestor só contém a equipa; `team/summary` do gestor lista o subordinado com contagens correctas; `my/summary` do colaborador mostra a obrigatória em falta (matrícula `mandatory:true` IN_PROGRESS) e não mostra a concluída; `email-me` com SMTP não configurado no ambiente de teste → 409; `email-me` de certificado de outro titular → 404; `GET /certificates/my` devolve `verifyUrl` e, para o válido, `linkedInUrl` com `startTask=CERTIFICATION_NAME`. Teardown filhos→pais (certificado → matrícula → utilizador de teste → curso).
- [ ] **Step 2: Run** (`NODE_OPTIONS=--max-old-space-size=8192`, `--runInBand`, segundo plano, só esta spec) → FAIL.
- [ ] **Step 3: Implement** rotas e registo no módulo. **Step 4: Run** esta spec e depois, **em grupos separados** (`certificates`, `courses`, `enrollments`, `events`) para não esgotar o pool de ligações → PASS.
- [ ] **Step 5: Commit** `feat(certificates): rotas de equipa, exportação e área pessoal`.

### Task 5: Frontend — área do colaborador

**Files:** Create `frontend/components/certificates/MySummaryPanel.tsx`; Modify `frontend/components/courses/CertificatesView.tsx`, `frontend/components/courses/types.ts` (`Certificate` com `verifyUrl`, `linkedInUrl`, `origin`), `frontend/components/certificates/types.ts`; Test `MySummaryPanel.test.tsx`, `CertificatesView.test.tsx`.

**Interfaces:** Consumes `GET /certificates/my`, `GET /certificates/my/summary`, `POST /certificates/:id/email-me`. `MySummaryPanel()` mostra três blocos só quando houver dados: **A aguardar aprovação**, **A expirar em breve** (data de validade) e **Formações obrigatórias por concluir** (com prazo); nada de enums crus. `CertificatesView`: filtros no cliente (pesquisa por título, estado, tipo curso/evento/trilha, emissão de/até, só com validade) com contagem "N de M"; cartão com **Descarregar PDF** (só ACTIVE/EXPIRED), **Copiar ligação** (`navigator.clipboard`, toast; fallback para seleccionar o texto se falhar), **LinkedIn** (abre `linkedInUrl` num separador novo, só se existir) e **Enviar por e-mail** (só se `summary.emailEnabled`; confirma com `useConfirm`; erro do servidor em toast). Revogados/expirados continuam listados com o estado.

- [ ] **Step 1: Tests (vitest)** — botão "Enviar por e-mail" não aparece com `emailEnabled:false` e aparece com `true`; "LinkedIn" só em certificados com `linkedInUrl`; revogado mostra o selo "Revogado" e não oferece PDF/LinkedIn/e-mail; filtro de estado "Expirados" esconde os válidos e mostra "1 de 3"; "Copiar ligação" chama `navigator.clipboard.writeText` com o `verifyUrl`; `MySummaryPanel` mostra "Formações obrigatórias por concluir" com o título e não mostra blocos vazios; nenhum enum cru no DOM.
- [ ] **Step 2: Run** `npx vitest run components/certificates components/courses/CertificatesView` → FAIL. **Step 3: Implement.** **Step 4: Run** + `tsc --noEmit` + eslint → PASS.
- [ ] **Step 5: Commit** (repo frontend) `feat(certificates): área pessoal com filtros, partilha e obrigatórias em falta`.

### Task 6: Frontend — gestor, aprovação e exportações

**Files:** Create `frontend/components/certificates/TeamSummaryTab.tsx`, `ExportMenu.tsx`; Modify `frontend/components/certificates/CertificatesCenter.tsx`, `CertificatesTab.tsx`, `labels.ts`, `types.ts`; Test `TeamSummaryTab.test.tsx`, `ExportMenu.test.tsx`, `CertificatesCenter.test.tsx`, `CertificatesTab.test.tsx`.

**Interfaces:** `CertificatesTab` separa `canManage` (ADMIN/RH: revogar/reemitir/reenviar/importar/lote) de `canApprove` (ADMIN/RH/GESTOR/LIDER/DIRECTOR). `CertificatesCenter` por papel: ADMIN/RH/AUDITOR → 6 separadores actuais + **Equipa** (resumo por departamento opcional); GESTOR/LIDER/DIRECTOR → **Visão da equipa · Certificados · Os meus**; os restantes só `CertificatesView`. `TeamSummaryTab`: cartões de totais (cobertura, expirados, a vencer, pendentes de aprovação, obrigatórias em falta, em formação) e tabela por colaborador; estado vazio "Sem colaboradores na sua equipa". `ExportMenu({ params })`: menu com **CSV · Excel · PDF** que chama `downloadAuditFile('/certificates/admin/export', { ...params, format })` com os filtros activos da lista; mostra o erro (ex.: demasiados resultados) num toast; aparece para todos os papéis que veem a lista.

- [ ] **Step 1: Tests** — gestor vê só "Visão da equipa", "Certificados" e "Os meus" (sem Modelos/Regras/Histórico) e sem botões de importar/lote/revogar, mas com "Aprovar" numa linha pendente; RH vê "Equipa" além dos 6; `ExportMenu` chama `downloadAuditFile` com `format:'xlsx'` e os filtros; erro do download aparece como aviso e não rebenta; `TeamSummaryTab` com 0 membros mostra o estado vazio e com 2 mostra as contagens.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `vitest run components/certificates components/trainings components/courses` + `tsc --noEmit` + eslint → PASS.
- [ ] **Step 5: Commit** (repo frontend) `feat(certificates): vista da equipa, aprovação por gestores e exportações`.

### Task 7: Verificação final

- [ ] `tsc --noEmit` e eslint (BE não-spec, FE novos); prettier só nos ficheiros alterados do backend.
- [ ] Suite unitária completa BE, `vitest run` FE (módulos tocados) e integração por grupos separados (`certificates`, `courses`, `enrollments`, `events`).
- [ ] Resumo ao utilizador: o que ficou funcional por papel, decisões (equipa directa; e-mail só com link e só com SMTP; LinkedIn por URL oficial), pendências (templates F2; anexo de PDF no e-mail).
