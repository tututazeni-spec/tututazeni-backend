# Arquitetura Modular — Análise do Monólito Atual e Plano de Evolução

> Executa as Fases 2–17 de `docs/arquitetura-modular.md`. Resultado da Fase 2 (análise), com 5 sub-análises paralelas por cluster de domínio de negócio, mais verificação directa ao `schema.prisma`. Serve de base às Fases 3–17 (decomposição, fronteiras, contratos, multi-tenancy, RBAC, eventos, observabilidade, testes).
>
> **Estado do sistema hoje: ~80 módulos NestJS "flat" em `src/`, todos registados directamente em `app.module.ts`, 321 modelos Prisma, zero camada de repositório — todo o acesso a dados é `PrismaService` injectado directamente nos services.** Não há fronteiras de domínio hoje — é um monólito não-modular, apesar de já estar fisicamente separado em pastas por feature.

---

## 1. Como ler este documento

Cada secção corresponde a uma secção do `arquitetura-modular.md`. Os achados citam sempre `ficheiro:linha` (recolhidos por 5 agentes de exploração dedicados, um por cluster, mais verificação directa nossa ao schema). Nada aqui foi alterado no código — é só análise, como o documento-fonte exige na Fase 2 ("Não faça alterações antes de compreender a arquitetura existente").

---

## 2. Inventário do monólito atual

### 2.1 — Escala
- **~80 módulos** em `src/*`, todos importados directamente em `app.module.ts` (nenhum agrupamento por domínio hoje).
- **321 modelos Prisma** num único `schema.prisma` de ~8800 linhas.
- **Zero repositórios** — todos os ~80 services injectam `PrismaService` e acedem a `this.prisma.<model>` directamente, incluindo modelos que pertencem a outros módulos.
- **Zero dependências circulares** entre módulos (achado consistente nos 5 clusters) — mas isto é enganador: não há ciclos porque **quase não há imports entre módulos de todo**. O acoplamento existe, só que é invisível ao grafo de DI do Nest — acontece via acesso directo `this.prisma.<model>` a tabelas "alheias".

### 2.2 — O padrão dominante: acoplamento por Prisma partilhado, não por imports
Em nenhum dos 5 clusters foi encontrado um caso significativo de "módulo A importa serviço interno não-exportado de módulo B" (o anti-padrão clássico de acoplamento NestJS). O problema real, sistemático e transversal aos ~80 módulos é outro:

> `this.prisma.<model-de-outro-domínio>.findX(...)` em vez de `this.outroDominioService.metodoPublico(...)`

Isto significa que a violação da regra fundamental do documento-fonte (§4: *"um módulo não deve aceder directamente à implementação interna de outro módulo"*) já acontece hoje, de forma massiva, só que através da base de dados partilhada em vez de imports de código. Qualquer plano de fronteiras de módulo tem de resolver isto primeiro — é o pré-requisito de tudo o resto (contratos, eventos, extração futura).

### 2.3 — Duplicação de regras de negócio: o achado mais grave e mais transversal

Os 5 clusters, de forma independente, encontraram o **mesmo padrão estrutural** repetido: duas (ou três) implementações paralelas da mesma capacidade de negócio, sobre os mesmos modelos Prisma ou modelos gémeos, com regras divergentes. Consolidado por gravidade:

| # | Capacidade duplicada | Implementações | Tabela(s) partilhada(s) | Divergência concreta |
|---|---|---|---|---|
| 1 | **Identidade de pessoa** | `User` (moderno) vs `Employee` (legado) | Sem FK entre os dois modelos | Dois grafos de dados paralelos e não cruzados para a mesma pessoa (ver §2.4) |
| 2 | **Presença/clock-in** | `attendance` (`AttendanceRecord`, GPS/selfie) vs `employees` (`Attendance`, sem geo) | Modelos diferentes, mesmo conceito | Dois sistemas de picagem de ponto coexistem |
| 3 | **Licenças/ausências** | `leave-management` (motor completo, `LeaveBalance`) vs `attendance.createLeaveRequest/reviewLeave/getLeaveBalance` | **Mesma tabela** `LeaveRequest` | `attendance` bypassa `LeaveBalance`/aprovação multi-nível, usa direitos anuais **hardcoded**; saldo pode divergir entre os dois ecrãs |
| 4 | **Concluir curso / emitir certificado** | `courses.completeLesson→completeCourse→issueCertificate` vs `course-modules.checkAndCompleteCourse` (dá pontos, não emite certificado) vs `enrollments.generateCertificate` (3ª cópia quase byte-a-byte) | `Enrollment`, `LessonProgress`, `Certificate` | Consoante o endpoint usado, o utilizador recebe certificado OU pontos+notificação, nunca ambos; critério de "curso completo" diverge (100% lições vs. módulos obrigatórios) |
| 5 | **Certificação/Badges** — **resolvido (Fases F2 + F3)**. **F2**: `Certificate` é o modelo único de certificado. `IssuedCertificate` foi absorvido — colunas ricas (`hashCode`, `title`, `recipientName`, revogação com autor/motivo/data, contadores, `issuedById`, `templateId`) passaram para `Certificate`; dados migrados (`legacyIssuedCertId` + backfill idempotente); `/certification/*` mantém a forma histórica via adaptador (`legacyType` guarda o `CertificateTemplateType` original — tradução para `CertificateType` lossy). **F3 (2026-09-06)**: badges unificados em `Badge`/`BadgeAward` (o par simples, já usado por ~13 serviços de gamificação). `DigitalBadge`/`BadgeIssuance` (só escritos por `certification`) absorvidos — `code`/`imageUrl`/`criteria`/`skills`/`level`/revogação/`verifyCode`/`assertionId`/`issuedById` passaram para `Badge`/`BadgeAward`; `BadgeAward` ganhou `@@unique([badgeId, userId])`; dados migrados (`legacyDigitalBadgeId`/`legacyBadgeIssuanceId` + backfill idempotente); `CertificationService` (métodos de badge) e `dashboard-institutional` passaram a `Badge`/`BadgeAward`; `/certification/badges*` mantém a forma histórica via adaptador (`badgeToDigitalShape`/`badgeAwardToIssuanceShape`; `courseId`/`programId` de `DigitalBadge` descartados). `IssuedCertificate`/`DigitalBadge`/`BadgeIssuance`/`CertificateTemplate` ficam no schema (deprecados; remoção física = follow-up). | Era 4 modelos / 2 pares; agora `Certificate` único + `Badge`/`BadgeAward` único | Domínio de certificação/badges totalmente unificado |
| 6 | **Learning Path** — **resolvido (Fase F1)**. **F1a**: `content-library` deixou de ter endpoints de learning path (`/content-library/paths/*` eram no-ops via `safeModel` — assumiam um shape de `LearningPath` inexistente e nunca persistiam nada; **removidos**). **F1b** (decisão do dono do produto, 2026-09-06): **`LmsLearningPath` NÃO se migra** — é uma capacidade distinta, não uma 3ª cópia do mesmo conceito. O modelo do LMS usa **códigos de curso opacos** (`courseIds String[]` — ex. `"course-a"`, não FKs `Course`), **progresso auto-reportado** (`PUT /lms/paths/:id/progress` com `completedCourseId` → append a `completedCourseIds[]`) e chave humana `code` (`@unique`). O canónico usa FKs `Course` reais, progresso derivado de `Enrollment.status`, milestones, assignments a alvos organizacionais e workflow de publicação. Fundir os dois exigiria mudar materialmente o comportamento do LMS (ou poluir o modelo canónico com "LMS-isms"). `/lms/paths*` fica como feature própria (checklist leve de cursos); o canónico (`/learning-paths`) é o sistema de trilhas guiadas formal. | `LearningPath`/`LearningPathEnrollment` (dono: `learning-paths`) + `LmsLearningPath` (feature LMS separada, por decisão) | Era "3 sistemas" na análise; na prática: 1 canónico (`learning-paths`) + 1 morto removido (`content-library`) + 1 feature distinta (`lms`) |
| 7 | ~~**`Competency`**~~ **— resolvido (Fase G1, 2026-09-06)**: `CompetenciesService` (`src/competencies/`) é o dono único de escrita/leitura de catálogo de `Competency`. `evaluation360.createCompetency`/`updateCompetency`/`listCompetencies` deixaram de tocar `prisma.competency` — delegam em `CompetenciesService.create`/`update` (estendidos com os campos do catálogo 360: `type`/`scaleMin`/`scaleMax`/`isGlobal`/`tenantId`/`indicators`) e no novo `CompetenciesService.listCatalogue` (vista tenant-scoped em array, com indicadores). Rotas/verbos/DTOs de `/evaluation360/competencies` inalterados; a auditoria específica de 360º e a conversão `id` string→number ficam no lado de `evaluation360`. `competency-map` é sobre `CompetencyMap`/`SkillMap` (modelo diferente, apesar do nome) — não foi tocado. `dashboard.service.ts` só lê `Competency` (agregação) — fica (§4). | `Competency` | Ver `docs/superpowers/plans/2026-09-05-fase-g1-competency-consolidation.md` + `notes/fase-g1-competency-map.md` |
| 8 | ~~**`SuccessionPlan`**~~ **— resolvido (Fase G2, 2026-09-06)**: `SuccessionService` é o dono único de escrita. `career.createSuccessionPlan` resolve o cargo crítico por `positionId` (contrato de `/career/succession`) e delega em `succession.create`; `career.updateSuccessionReadiness` delega em `succession.update`. `succession.create` passou a aceitar `priority` do DTO **ou** calculá-la por contagem posicional (`computePriority`, portada de `career`) e trata `P2002` como `ConflictException`; notificação unificada em `SUCCESSION_PLAN_ADDED` (nenhum consumidor distinguia os dois tipos). Adaptador `toCareerSuccessionShape` preserva a forma histórica (`position` de topo + `candidate`). `talent-development` só **lê** `SuccessionPlan` (agregação) — nada a delegar; `dashboard-rh`/`reports` idem (§4). | `SuccessionPlan` | Ver `docs/superpowers/plans/2026-09-05-fase-g2-succession-plan-consolidation.md` + `notes/fase-g2-succession-map.md` |
| 9 | ~~**PDI / `DevelopmentPlan`**~~ **— resolvido (Fase G3, 2026-09-06)**: `DevelopmentPlansService` é o dono único do lifecycle de PDI. `talent-development` (`createPlan`/`updatePlan`/`pausePlan`/`completePlan`/`cancelPlan`) e `leader.approvePlan` passaram a delegar. `talent-development.activatePlan` **deixou de fazer `DRAFT → ACTIVE` directo** — o handler passa por `submitForApproval` (`DRAFT → PENDING_APPROVAL`) ou `approvePlan` (`PENDING_APPROVAL → ACTIVE`, com linha em `PdiApproval`); "activar" um PDI em DRAFT passa a significar "submeter para aprovação" (decisão do dono do produto). O canónico ganhou `pause(id, reason?)` (`ACTIVE → PAUSED`, portado de `talent-development`) e `complete` passou a gravar `overallProgress: 100`. `completePlan` de `talent-development` passa a emitir certificado + 300 XP flat (decisão de produto — antes somava `action.xpReward`, sem certificado). O ownership de `approvePlan` (chave `plan.managerId` + `PdiApproval`) e a 4ª cópia em `leader` ficam num só sítio; `leader` passou a exigir `PENDING_APPROVAL` (deixou de forçar `ACTIVE` de qualquer estado). `employees`/`LegacyPdi` continua isolado (fora do âmbito). Planos activados antes desta data não têm rasto retroactivo em `PdiApproval`. | `DevelopmentPlan`/`PdiGoal`/`PdiEvidence` + `LegacyPdi` isolado | Ver `docs/superpowers/plans/2026-09-05-fase-g3-pdi-development-plan-consolidation.md` + `notes/fase-g3-pdi-map.md` |
| 10 | ~~**Reuniões 1:1**~~ **— resolvido (Fase G4, 2026-09-06)**: modelo único (`OneOnOneMeeting`) e serviço único (`OneOnOneService`, `src/one-on-one/`). `engagement`, `leader` e `leadership` (os **3** caminhos de escrita — a análise dizia que `leader` só lia, mas escrevia `OneOnOneMeeting` em `createOneOnOne`/`completeOneOnOne`) passaram a delegar. `leadership` usava o modelo legado `OneOnOne` (managerId/subordinateId) — os dados migram para `OneOnOneMeeting` (`legacyOneOnOneId Int? @unique` + `prisma/backfill-one-on-ones.ts` idempotente), e o contrato de `/leadership/1on1` é preservado por `meetingToLeadershipShape` (`hostId→managerId`, `participantId→subordinateId`, `id = legacyOneOnOneId ?? meeting.id`; `completeOneOnOne` aceita ambos os ids). Dashboards de `leadership` passaram a contar `OneOnOneMeeting` (o modelo legado ficaria congelado). Removida a degradação silenciosa `.catch()` de `leader` (falha real passa a propagar). `OneOnOne` fica no schema (deprecado; remoção física = follow-up). Ownership mantém-se nos callers. | `OneOnOne` (legado, migrado) + `OneOnOneMeeting` (canónico) | Ver `docs/superpowers/plans/2026-09-05-fase-g4-one-on-one-consolidation.md` + `notes/fase-g4-one-on-one-map.md` |
| 11 | **Departamentos/Posições/Unidades** | `departments` (dono, `DepartmentsService`/`PositionsService`/`UnitsService`) vs `organization` (CRUD completo duplicado, rotas REST paralelas) | `Department`/`Position`/`Unit` (mesmas tabelas) | `organization` não importa `DepartmentsModule` — bypass total, validações podem divergir |
| 12 | ~~**Roles/Permissions**~~ **— resolvido (Fase D)**: `RolesPermissionsService` é o serviço único; `acl.AclService` e `departments.RolesService` eliminados; motor ABAC removido | `Role`/`Permission`/`RolePermission` | As 3 implementações concorrentes deram lugar a um só serviço; enforcement continua no `RolesGuard` (role-name) |
| 13 | ~~**Declarações/certidões de colaborador**~~ **— resolvido (Fase E, E-full)**: `Declaration`/`WorkDeclarationService` é o caminho único de emissão. `/declarations/documents/*` é servido pela tabela `declarations` via `LegacyDocumentDeclarationsService` (colunas `legacyRequestId`/`legacyStatus`/`legacyPurposeId`/`legacyGeneratedAt` + adaptador de forma preservam o contrato do frontend); `DocumentDeclarationsService` eliminado; `DeclarationRequest`/`DeclarationApproval` deixam de ser escritos (backfill idempotente `prisma/backfill-declaration-requests.ts`; remoção física do modelo é follow-up). `resolveTenantId()`/`getDefaultTenantId()` tem uma só implementação (`src/common/helpers/tenant.helper.ts` — 5 cópias → 1). `/declarations/work` (forms de compliance, `WorkDeclarationsService` plural) intocado. | `DeclarationTemplate` partilhada | Ver `docs/superpowers/plans/2026-09-05-fase-e-declarations-merge.md` + `notes/fase-e-declaration-field-map.md` |
| 14 | **Auditoria** | `src/audit` (cadeia de hash SHA-256, `verifyIntegrity()`) — **órfão**, nada da app chama-o — vs `src/common/services/audit.service.ts` (usado por 20 services via fila Bull, sem hash) | `AuditLog` partilhada | `verifyIntegrity()` reporta "cadeia quebrada" para dados que nunca tiveram intenção de fazer parte da cadeia — compliance theatre |
| 15 | ~~**Dashboards/Relatórios/ROI**~~ **— resolvido (Fase H, 2026-09-06)**: `MetricsAggregationService` (`src/metrics-aggregation/`, só leitura, `this.prisma.read.*`) é a fonte de leitura única de headcount/headcountTrend/turnover/trainingRoi/alertas/managerDashboard. Cada métrica tem **uma** fórmula canónica (escolhida a partir das 2–10 variantes — ver `docs/superpowers/plans/notes/fase-h-metrics-variants.md`): headcount por `hireDate` + breakdowns `active`-scoped; turnover por `exitDate ∈ janela` / headcount médio; trainingRoi = modelo financeiro do `roi-impact` + horas reais (`Σ Course.workloadHours`); catálogo único de 13 regras de alerta (`alert-rules.ts`, funções puras; união de `dashboard.getAlerts`+`buildManagerAlerts`+`dashboard-rh.getAlerts`+`analytics.getRiskAlerts`); `managerDashboard` = superconjunto `dashboard` ⊕ `analytics`. Os 5 módulos (`dashboard`/`dashboard-rh`/`reports`/`analytics`/`roi-impact`) consomem-na e embrulham o resultado canónico na sua forma histórica (adaptador local + `.catch` de degradação por consumidor); rotas/verbos/shape preservados, **valores** convergem (deltas listados no PR para ratificação). **Escrita de `DashboardSnapshot`** (2 módulos, fórmulas divergentes) **fica como follow-up** — Fase H é extracção de leitura. | `DashboardSnapshot`, contagens ad-hoc | Ver `docs/superpowers/plans/2026-09-05-fase-h-metrics-aggregation-service.md` + `notes/fase-h-metrics-variants.md` |

*(Ver os 5 relatórios completos — preservados nesta conversa — para o detalhe ficheiro:linha de cada item.)*

### 2.4 — O caso mais fundacional: `User` vs `Employee`

`User` (`schema.prisma:550`) e `Employee` (`schema.prisma:5930`) são **dois grafos de identidade completamente independentes, sem FK nem relação em nenhum sentido**. `User.employeeNumber` e `Employee.matricula` são dois identificadores de "número de colaborador" nunca cruzados. Isto não é um detalhe de schema — é a causa-raiz de pelo menos 4 dos 15 itens da tabela acima (presença, carreira/PDI, skills, feedback), porque o módulo `employees` reimplementa sobre `Employee` funcionalidades que módulos "modernos" já fazem sobre `User`. Qualquer decomposição por domínio tem de decidir isto primeiro: qual é a identidade canónica de uma pessoa no sistema.

### 2.5 — Acesso directo a tabelas de outro domínio que ignora invariantes de negócio (não é só leitura)

A maioria dos acessos cross-domain via Prisma directo é leitura para agregação (dashboards/relatórios) — aceitável em geral. Mas há **escritas** cross-domain que ignoram validações do dono do modelo, com impacto funcional real:

- `automation.executeAction()` (`ASSIGN_COURSE`, `CREATE_PDI`, `AWARD_POINTS`, `AWARD_BADGE`) escreve directamente em `Enrollment`/`DevelopmentPlan`/`UserPoints`, ignorando: guarda contra matrícula duplicada, validação de curso `PUBLISHED`, actualização de `CourseAnalytics`, notificação ao colaborador. Pode criar matrículas duplicadas e em cursos arquivados, e desalinhar métricas de ROI.
- `course-modules` lê `Quiz`/`QuizAttempt`/`Assessment` (donos: `courses`/`assessments`) para decidir regras de conclusão.
- `attendance` escreve em `LeaveRequest` (dono: `leave-management`) sem tocar no ledger `LeaveBalance`.
- `scalability` escreve em `IntegrationConfig`/`IntegrationSyncLog` (dono: `api-integration`).

### 2.6 — Multi-tenancy: vestigial, não funcional (achado transversal aos 5 clusters)

Confirmado de forma independente pelos 5 agentes e por verificação directa ao schema:

- **321 modelos, só 14 têm `tenantId`** (`Competency`, `AutomationRule`, `AutomationExecution`, `SlaConfig`, `ContentDeliveryConfig`, `ScalabilityMetric`, `SystemAlert`, `IntegrationConfig`, `Declaration`, `DeclarationTemplate`, `DeclarationTenantConfig`, `Eval360Cycle`, `Eval360Feedback`, `PulseSurvey`).
- **Não existe modelo `Tenant`** — só `TenantConfig` (periférico) e `DeclarationTenantConfig`.
- **`User`/`CurrentUserData`/JWT nunca carregam `tenantId`** — confirmado por comentário explícito no próprio código (`work-declaration.service.ts:69-76`): *"O JWT/auth flow real nunca popula IAuthUser.tenantId ... `where: { tenantId }` em leituras é silenciosamente ignorado pelo Prisma (undefined não filtra)"*. `resolveTenantId()`/`getDefaultTenantId()` colapsam sempre para um único tenant `"DEFAULT"` criado automaticamente — desde a Fase E há **uma só implementação** (`src/common/helpers/tenant.helper.ts#resolveDefaultTenantId`), antes eram 5 cópias literais.
- Onde `tenantId` aparece em controllers (`scalability`, `evaluation360`), é **recebido do cliente via query/param/DTO**, nunca derivado de contexto de autenticação — sem guard que valide correspondência.
- **Não existe nenhum `TenantGuard`/`TenantInterceptor` global.**
- Todas as tabelas centrais consultadas por dashboards/relatórios (`User`, `Enrollment`, `Course`, `DevelopmentPlan`, `PerformanceReview`, `Certificate`, `Department`, `Position`) **não têm `tenantId`** — se o produto operar alguma vez como multi-tenant partilhando a mesma BD, os 8 módulos de dashboard/relatórios (`dashboard`, `dashboard-rh`, `dashboard-institutional`, `reports`, `executive-reports`, `analytics`, `roi-impact`, `history`) agregam globalmente por definição.

**Conclusão:** o sistema é **single-tenant de facto**, com um verniz `TenantConfig` introduzido ad-hoc em ~6 módulos mais recentes, nunca propagado ao núcleo. Ver §7 para a recomendação.

### 2.7 — RBAC: só nome de role; motor de permissões existe mas está desligado

- Enforcement real = `RolesGuard` (`src/common/guards/roles.guard.ts`), que compara `user.role.name` contra `@Roles(...)`. **Fail-open por design**: sem `@Roles()` no handler, o guard deixa passar.
- Existe um motor de permissões granulares M2M + ABAC completo (`AclService`, `Permission`↔`RolePermission`↔`Role`, `AccessPolicy`/`evaluatePolicies()`) — mas **nenhum outro módulo o importa**; só é chamado pelo seu próprio controller de teste manual. É código morto do ponto de vista de autorização real.
- **Duas implementações paralelas de gestão de roles/permissões**: `AclModule` (~811 linhas) e `RolesPermissionsModule` (~669 linhas), mais uma terceira (`departments.RolesService`) — 3 CRUDs concorrentes sobre as mesmas tabelas.
- Scope (department/team) não tem mecanismo genérico — cada service reimplementa a sua própria noção de "é da minha equipa" (`leader.service.ts`, `organization.service.ts`, `payroll-calculation.service.ts`), e há gaps confirmados de ownership: `engagement.replyToFeedback` não verifica que o respondente é o destinatário do feedback; `evaluation.teamDashboard(:managerId)` aceita `managerId` da URL sem checar que é o próprio chamador; `evaluation.service.ts#create` (legacy) não verifica relação entre avaliador e avaliado.
- Ainda existem 6 controllers com arrays de roles "hand-rolled" como strings soltas em vez de `Role.X` (`acl`, `api-integration`, `automation`, `roi-impact`, `roles-permissions`, `search`) — hoje sem bug funcional activo, mas sem protecção do compilador contra drift futuro do enum. **(Fase D: `acl` e `roles-permissions` corrigidos; faltam `api-integration`, `automation`, `roi-impact`, `search`.)**

> **Actualização (Fase D, 2026-09-05):** o motor ABAC (`AccessPolicy`/`evaluatePolicies()`/`AclService`) foi **removido** por decisão do dono do produto — dava falsa sensação de segurança sem nunca estar ligado a enforcement. Roles & permissões têm agora um **único serviço** (`RolesPermissionsService`); as rotas `/acl/*` e `/roles*` delegam nele (formas de resposta preservadas), `AclService` e `departments.RolesService` foram eliminados, e as rotas `GET|POST /acl/policies` e `POST /acl/check` passaram a `404`. Enforcement continua a ser só o `RolesGuard` (role-name vs `@Roles()`).

### 2.8 — Auditoria: dois `AuditService` paralelos (confirmado, já documentado em `CLAUDE.md`)
`src/audit/audit.service.ts` (cadeia de hash) está desligado da app real; `src/common/services/audit.service.ts` (usado por 20 services, sem hash) é o caminho real. `hash`/`previousHash` ficam `null` na esmagadora maioria dos registos, tornando `verifyIntegrity()` enganador em produção — reporta "violação" para dados que nunca fizeram parte da cadeia.

### 2.9 — Observabilidade: já sólida, não é um ponto fraco
Pino estruturado + `AsyncLocalStorage` para correlation/request ID (propagado a todo `new Logger()` durante o pedido) + Terminus health (`/health`, `/health/live`, `/health/ready`, Postgres crítico/Redis informativo) + métricas Prometheus (`/metrics`, token-protegido) + `AllExceptionsFilter` global com corpo de erro uniforme. Não precisa de trabalho estrutural nesta fase — só integrar as correcções de auditoria (§2.8) e, eventualmente, tradução de erros Prisma conhecidos (`PrismaClientKnownRequestError`) para mensagens de negócio.

### 2.10 — Filas: infraestrutura pronta, quase não usada
Só 2 dos ~80 módulos (`audit`, `notifications`) usam a fila Bull já registada globalmente (`QueueModule`). Tudo o resto é síncrono, incluindo casos claramente candidatos a fila: webhooks com retry+backoff dentro do request HTTP (`api-integration.service.ts`, pode bloquear 30-60s+), emails síncronos sem retry a bloquear criação de utilizador (`users.service.ts:602`), exportação XLSX/PDF pesada, `automation.runAllActiveRules` em loop sequencial.

### 2.11 — Segurança pontual encontrada fora do RBAC
- "Encriptação" de credenciais de integração é só Base64 (`scalability.service.ts:1149-1155`, `TODO: Integrar com AWS KMS/Azure Key Vault` nunca resolvido) — credenciais reversíveis trivialmente em BD.
- `ApiKey`/`Webhook`/`WebhookDelivery` não existem no schema; `safeM()` degrada graciosamente (200 OK, zero persistência) — já documentado no `CLAUDE.md`, confirmado sem alteração.

### 2.12 — Ficheiros grandes / responsabilidades misturadas
Praticamente todo `*.service.ts` de domínio excede 500 linhas (vários acima de 1000: `talent-development.service.ts` 1653, `evaluation.service.ts` 1511, `dashboard-rh.service.ts` 1281, `dashboard.service.ts` 1181, `reports.service.ts` 1239, `avatar-training.service.ts` 1323, `content-library.service.ts` 1260, `scalability.service.ts` 1156, `leave-management.service.ts` 1161, `employees.service.ts` 1022, `attendance.service.ts` 1007, `automation.service.ts` 1003, `api-integration.service.ts` 999, `roi-impact.service.ts` 972). Nenhum controller tem lógica de negócio relevante — o problema está concentrado nos services, consistente com o resto do achado: um service por módulo tenta fazer CRUD + regras + analytics + notificações + gamificação tudo junto.

---

## 3–4. Decomposição por domínio de negócio e fronteiras propostas

Com base nos achados acima, os ~80 módulos agrupam-se em **12 domínios de negócio** (bounded contexts). Isto é o **mapa-alvo** para onde as fronteiras devem convergir — não implica mover pastas já nesta fase (isso seria complexidade prematura); implica que **contratos e regras de acesso cross-módulo, daqui para a frente, respeitem estes limites**, e que a consolidação de duplicados (§2.3) aconteça dentro de cada domínio, não entre eles.

| Domínio | Módulos actuais | Dono canónico de identidade/dados-chave | Duplicações a resolver dentro do domínio |
|---|---|---|---|
| **1. Identidade & Acesso** | `auth`, `users`, `acl`, `roles-permissions`, `audit` | `User` | Consolidar `AclModule`+`RolesPermissionsModule`+`departments.RolesService` num único serviço de roles/permissões; decidir entre os 2 `AuditService` |
| **2. Pessoas & Organização** | `employees`, `departments`, `organization`, `onboarding` | `User` (ver §2.4 — `Employee` fica subordinado ou é descontinuado) | Fundir `organization` em `departments` (mesmas tabelas); resolver dualidade `User`/`Employee` |
| **3. Presença & Ausências** | `attendance`, `leave-management` | `LeaveRequest`/`LeaveBalance` (dono: `leave-management`) | `attendance` deixa de escrever `LeaveRequest` directamente — passa a chamar `LeaveManagementService` |
| **4. Compensação** | `payslips` | `Payslip` | Sem duplicação encontrada — módulo bem isolado, manter como referência de bom padrão |
| **5. Documentos & Declarações** | `document-repository`, `declarations`, `work-declaration` | `Declaration` (dono: `work-declaration`) | ~~Fundir `declarations`+`work-declaration`~~ **feito (Fase E)**: `/declarations/documents` servido por `Declaration` via `LegacyDocumentDeclarationsService`; `DeclarationRequest` deprecado (backfill); `/declarations/work` (compliance) fica à parte |
| **6. Academia — Conteúdo & Aprendizagem** | `courses`, `course-modules`, `enrollments`, `assessments`, `learning-paths`, `micro-learning`, `live-classes`, `knowledge`, `library`, `content-library`, `lms`, `academic`, `instructor` | `Course`/`Enrollment` | Unificar "concluir curso" (item 4 da tabela §2.3) num `CourseCompletionService` único; unificar Learning Path (item 6); remover funcionalidades de `content-library` que apontam a tabelas inexistentes |
| **7. Certificação, Competências & IA de Aprendizagem** | `certification`, `competencies`, `competency-map`, `ai-tutor`, `avatar-training` | `Certificate` (certificados), `Badge`/`BadgeAward` (badges) | ~~Unificar certificados e badges~~ **feito (Fases F2 + F3)**: `IssuedCertificate`→`Certificate`, `DigitalBadge`/`BadgeIssuance`→`Badge`/`BadgeAward` (backfill + adaptadores; modelos ricos deprecados). `Competency` só escrito por `competency-map` |
| **8. Talento & Performance** | `career`, `career-plans`, `development-plans`, `talent-development`, `succession`, `performance`, `evaluation`, `evaluation360`, `leadership`, `engagement`, `leader` | a decidir por sub-capacidade (PDI, sucessão, avaliação, 1:1 não têm hoje um dono único) | Maior densidade de duplicação do sistema (itens 7–10 da tabela §2.3) — candidato a sub-fase dedicada |
| **9. Eventos & Comunicação** | `events`, `notifications`, `mail` | `NotificationLog` | Unificar `createNotificationSafe()` com `NotificationsService.send()` (2 caminhos hoje, semântica diferente) |
| **10. Dashboards & Relatórios** | `dashboard`, `dashboard-rh`, `dashboard-institutional`, `reports`, `executive-reports`, `analytics`, `roi-impact`, `history` | leitura agregada de todos os domínios | Extrair um `MetricsAggregationService`/camada de leitura partilhada em vez de 5 implementações de headcount/turnover/ROI/alerts |
| **11. CRM Social** | `crm-beneficiaries`, `crm-partners`, `crm-funders` | próprios modelos | Sem duplicação relevante — domínio bem isolado |
| **12. Integrações, Automação & Escalabilidade** | `api-integration`, `automation`, `process-standard`, `scalability`, `search`, `mobile` | a decidir | `automation` deve chamar serviços de domínio (não Prisma directo); `scalability` não deve escrever `IntegrationConfig` directamente |

**Infra transversal (não é domínio de negócio, fica global):** `prisma`, `queue`, `cache`, `health`, `metrics`, `pdf`, `common`, `config`.

### Regra de fronteira a aplicar a partir de agora
> Um módulo só pode ler/escrever um modelo Prisma que não "possui" (tabela §3–4 acima) através do serviço público exportado pelo módulo dono. Leitura agregada pura para relatórios (contagens/agregações sem regra de negócio) é a única excepção tolerada, e mesmo essa deve preferir `this.prisma.read.*` (réplica) já usado em parte do domínio 10.

---

## 5. Contratos entre domínios — o que falta criar

Hoje não existe nenhum contrato formal entre módulos (nem interface, nem evento) — porque não há composição nenhuma (§2.2). As prioridades de contrato, na ordem que desbloqueiam mais duplicação:

1. **`CourseCompletionService`** (domínio 6) — ponto único de "marcar lição/módulo como concluído → decidir se o curso está completo → emitir certificado + pontos + notificação", consumido por `courses`, `course-modules`, `enrollments`. — **feito** (Fase A, 2026-09-05).
2. ~~**`PdiApprovalContract`**~~ — **feito (Fase G3, 2026-09-06)**: o "contrato" é a delegação directa em `DevelopmentPlansService.submitForApproval`/`approvePlan` — `talent-development.activatePlan` e `leader.approvePlan` deixaram de ter fluxo próprio. Toda a aprovação regista `PdiApproval` e o ownership vive num só sítio (`plan.managerId` + `[ADMIN, RH]`).
3. **`LeaveManagementService` público** consumido por `attendance` em vez de Prisma directo.
4. **`DepartmentsService` público** consumido por `organization` (ou `organization` é descontinuado a favor de `departments`). — **feito** (Fase C, 2026-09-05); nota: as leituras org-chart (`getDepartments`/`getDepartmentDetails`/`getPositions`/`getUnits`) ficaram em `organization` como projecção read-only tolerada.
5. ~~**`RoleAssignmentService` único**~~ — **feito (Fase D)**: `RolesPermissionsService` é o serviço único (`AclService` e `departments.RolesService` eliminados); o motor ABAC foi **removido** em vez de aplicado num `PermissionGuard`.
6. **`MetricsAggregationService`** (domínio 10) — camada de leitura única para headcount/turnover/ROI/alerts, consumida por `dashboard`/`dashboard-rh`/`reports`/`analytics`/`roi-impact` em vez de cada um recalcular. — **feito** (H, 2026-09-06); escrita de `DashboardSnapshot` fica como follow-up.

---

## 6. Base de dados — organização por domínio (sem separação física agora)

Confirma a regra do documento-fonte: **não separar BD por microservice nesta fase**. A tabela do §3–4 já identifica que entidades pertencem a cada domínio proposto — isso é suficiente para "organizar claramente os dados por domínio" sem tocar em infraestrutura. Os candidatos a separação futura (se algum domínio for extraído) são, por ordem de menor acoplamento a maior:
- **CRM Social** (domínio 11) — já isolado, zero dependência cross-domain encontrada.
- **Compensação** (domínio 4) — já isolado.
- **Integrações & Automação** (domínio 12) — isolado desde que pare de escrever directamente noutros domínios (§2.5).

Talento & Performance (domínio 8) e Academia (domínio 6) são os menos prontos para qualquer extracção futura — é onde está concentrada a duplicação.

---

## 7. Multi-tenancy — recomendação

Dado o achado do §2.6 (vestigial, não funcional, só 14/321 modelos), a decisão **não deve ser "reforçar o isolamento existente"** (não há isolamento real para reforçar) — deve ser uma decisão de produto explícita entre duas alternativas, ambas alinhadas com a "Regra Final" do documento-fonte (não introduzir complexidade sem necessidade comprovada):

- **(a) Confirmar que o produto é single-tenant por deployment** (parece ser a realidade operacional actual) → remover/assinalar como legado os campos `tenantId` vestigiais em vez de os deixar half-implementados a sugerir uma garantia que não existe; simplifica em vez de complicar.
- **(b) Se multi-tenant partilhado for de facto um requisito de negócio próximo** → é trabalho de raiz, não incremental: `tenantId` no JWT/`CurrentUserData`, `TenantGuard` global, `tenantId` propagado a `User`/`Department`/`Course`/`Enrollment`/etc. (não só aos 14 modelos periféricos actuais), e só depois os 8 módulos de dashboard/relatórios passam a filtrar por tenant.

Não avançar nenhuma das duas sem confirmação explícita do dono do produto — é a decisão de maior impacto arquitectural deste documento.

> **Decisão confirmada (2026-09-04):** o produto é single-tenant por deployment. Opção (a). Os campos `tenantId` vestigiais (`Declaration`, `DeclarationTemplate`, `DeclarationTenantConfig`, `Eval360Cycle`, `Eval360Feedback`, `PulseSurvey`, `AutomationRule`, `AutomationExecution`, `SlaConfig`, `ContentDeliveryConfig`, `ScalabilityMetric`, `SystemAlert`, `IntegrationConfig`, `Competency`) ficam registados aqui como dívida a assinalar/remover numa fase futura dedicada — não fazem parte do roteiro A–J actual e não devem ser tratados como isolamento real em nenhum código novo.

---

## 8. RBAC e permissões — recomendação

1. ~~Consolidar `AclModule` + `RolesPermissionsModule` + `departments.RolesService` num único serviço/módulo de roles & permissões~~ — **feito (Fase D)**: `RolesPermissionsService` é o único; os outros dois eliminados; rotas `/acl/*` e `/roles*` delegam.
2. ~~Decidir explicitamente: o motor ABAC (`AccessPolicy`/`evaluatePolicies()`) passa a ser aplicado ou removido~~ — **feito (Fase D)**: **removido** (decisão do dono do produto 2026-09-05); rotas `/acl/policies` e `/acl/check` deixaram de existir.
3. Introduzir um helper de scope de equipa genérico (`isInTeamScope(managerId, targetUserId)`), reutilizado pelos ~6 services que hoje reimplementam esta verificação manualmente — e fechar os gaps concretos já identificados (`engagement.replyToFeedback`, `evaluation.teamDashboard`, `evaluation.service.ts#create` legacy). *(fora do âmbito da Fase D — trabalho de ownership/scope, não de consolidação de roles)*
4. Substituir os 6 arrays de roles "hand-rolled" (strings soltas) por `Role.X` do enum canónico. *(Fase D: `acl` e `roles-permissions` feitos; faltam `api-integration`, `automation`, `roi-impact`, `search`.)*

---

## 9. Eventos de domínio — proposta (sem message broker)

Confirmando a orientação do documento-fonte (eventos podem ficar dentro do monólito, não introduzir Kafka/RabbitMQ sem necessidade comprovada): o projecto já usa `EventEmitterModule` (NestJS, in-process) no módulo `scalability` — é a base certa a generalizar, não uma tecnologia nova. Eventos a introduzir, directamente derivados da duplicação encontrada:

- `CourseCompleted` — hoje 3 implementações independentes decidem isto; deveria ser um evento único emitido pelo `CourseCompletionService` (§5.1), consumido por quem emite certificado, atribui pontos, e notifica.
- `EnrollmentCreated` — consumido por `CourseAnalytics` (hoje actualizado inconsistentemente, ver `automation.ASSIGN_COURSE` no §2.5).
- `DevelopmentPlanApproved` — consumido por auditoria/notificação, fecha o buraco do PDI activado via `talent-development` sem `PdiApproval` (§2.3 item 9).
- `LeaveApproved`/`LeaveRejected` — consumido pelo módulo de cursos para pausar/retomar matrículas (hoje `leave-management` já faz isto directo ao Prisma — passaria a evento).
- `EmployeeCreated`/`EmployeeUpdated` — só faz sentido depois de resolvida a dualidade `User`/`Employee` (§2.4).

---

## 10. Observabilidade

Já coberta em detalhe no §2.9. Sem lacunas estruturais. Único trabalho remanescente: corrigir o comportamento de `verifyIntegrity()` (§2.8) para não reportar falsos positivos, e considerar tradução de erros Prisma conhecidos no `AllExceptionsFilter`.

---

## 11. Testes — prioridades

Seguindo a orientação do documento-fonte ("dar prioridade aos domínios críticos: autenticação, autorização, multitenancy, colaboradores, Academia, cursos, inscrições, avaliações, certificados, performance, talentos"), cruzado com os achados acima, a prioridade real de cobertura antes de qualquer consolidação é:

1. **Identidade & Acesso** (domínio 1) — antes de tocar em RBAC/roles (§8), garantir testes de integração que fixem o comportamento actual do `RolesGuard`/fail-open, para não regredir autorização ao consolidar.
2. **Academia — conclusão de curso** (domínio 6) — antes de unificar as 3 implementações (§2.3 item 4), escrever testes de integração que capturem o comportamento actual de cada uma (mesmo sendo divergente), para a unificação ser uma decisão deliberada, não um acidente.
3. **Presença & Ausências** (domínio 3) — idem antes de fazer `attendance` deixar de escrever `LeaveRequest` directamente.
4. **Talento & Performance — PDI/Sucessão/1:1** (domínio 8) — maior densidade de duplicação; testes de integração por fluxo de estado antes de qualquer fusão.

Nada disto é extraível para microservice enquanto os testes de integração destes fluxos não existirem (regra do documento-fonte §11).

---

## 12. Frontend — regra confirmada, sem impacto nesta fase

Nenhum dos achados acima requer alteração de frontend para ser corrigido no backend (são bugs de consistência de dados/regra de negócio, não de contrato de API visível). Onde uma unificação de backend vier a mudar o formato de resposta de um endpoint (ex.: `CourseCompletionService` consolidado), a integração no frontend deve limitar-se à camada técnica, preservando layout/UX/textos, como o documento-fonte exige em §12.

---

## 13. Roteiro proposto (Regra Final: Simplicidade → Organização → Desacoplamento → Segurança → Testabilidade → Observabilidade → Escalabilidade)

Ordem sugerida de sub-projectos, cada um pequeno e independentemente entregável (não um refactor único e gigante):

| Fase | Sub-projecto | Domínio(s) | Risco | Porquê nesta ordem |
|---|---|---|---|---|
| A | ~~Consolidar "concluir curso" num `CourseCompletionService`~~ — **concluída**: `src/course-completion/` é agora o dono único de progresso→conclusão→certificado+pontos+notificação; `courses`/`course-modules`/`enrollments` delegam; critério de conclusão passou a module-aware em todos os caminhos (fallback plano só sem módulos publicados) | 6 | — | Ver `docs/superpowers/plans/2026-09-05-fase-a-course-completion-consolidation.md` |
| B | ~~`attendance` deixa de escrever `LeaveRequest` directo~~ — **concluída**: `createLeaveRequest`/`reviewLeave`/`getLeaveBalance` delegam em `LeaveManagementService`; corrigido também um bug colateral onde auto-aprovação sem gestor atribuído não deduzia saldo (achado durante a implementação, não estava na análise original) | 3 | — | Ver `docs/superpowers/plans/2026-09-04-fase-b-attendance-leave-consolidation.md` |
| C | ~~Fundir `organization` em `departments`~~ — **concluída**: escrita de Department/Position/Unit tem agora uma só implementação (serviços canónicos de `departments`, estendidos para superconjunto); `OrganizationService` delega; rotas `/organization/*` intactas; leituras org-chart mantidas em `organization` (§4) | 2 | — | Ver `docs/superpowers/plans/2026-09-05-fase-c-organization-departments-merge.md` |
| D | ~~Consolidar Roles/Permissions + decisão ABAC~~ — **concluída**: `RolesPermissionsService` é o serviço único; `/acl/*` e `/roles*` delegam; `AclService` e `departments.RolesService` eliminados; **ABAC removido** (decisão do dono do produto 2026-09-05 — `accessPolicy`/`evaluatePolicies`/`/acl/check`/`/acl/policies` apagados). Enforcement continua no `RolesGuard` (role-name). | 1 | — | Ver `docs/superpowers/plans/2026-09-05-fase-d-roles-permissions-consolidation.md` |
| E | ~~Fundir `declarations`+`work-declaration`~~ — **concluída (E-full)**: `Declaration`/`WorkDeclarationService` é o caminho único de emissão de documentos; `/declarations/documents/*` servido pela tabela `declarations` via `LegacyDocumentDeclarationsService` + adaptador de forma (`legacyRequestId`/`legacyStatus`/`legacyPurposeId`/`legacyGeneratedAt`); `DocumentDeclarationsService` eliminado; `DeclarationRequest` migrado (backfill idempotente) e deprecado (remoção física do modelo = follow-up); `getDefaultTenantId` unificado num helper (5→1). `/declarations/work` (forms de compliance) intocado. | 5 | — | Ver `docs/superpowers/plans/2026-09-05-fase-e-declarations-merge.md` |
| F | ~~Unificar Learning Path (3→1) e Certificação/Badges (2→1 cada)~~ — **concluída** em 3 sub-fases: F1 (learning path: F1a removeu endpoints mortos de `content-library`; F1b decidiu **não** migrar `LmsLearningPath` — feature distinta, ver item 6), F2 (certificação → `Certificate`, `legacyType`/`legacyIssuedCertId` + backfill + adaptador), F3 (badges → `Badge`/`BadgeAward`, `legacyDigitalBadgeId`/`legacyBadgeIssuanceId` + backfill + adaptador, `@@unique([badgeId,userId])` novo). Modelos ricos (`LmsLearningPath` mantido, `IssuedCertificate`/`DigitalBadge`/`BadgeIssuance` deprecados) — remoção física em follow-up. | 6, 7 | — | Ver `docs/superpowers/plans/2026-09-05-fase-f{1,2,3}-*.md` |
| G | ~~Sub-fase dedicada: PDI/Sucessão/1:1 no domínio Talento & Performance~~ — **concluída** em 4 sub-fases: **G1** (`Competency` → `CompetenciesService`; `evaluation360` delega — item 7), **G2** (`SuccessionPlan` → `SuccessionService`; `career` delega — item 8), **G3** (PDI → `DevelopmentPlansService`; `talent-development` + `leader` delegam, fecha o buraco de auditoria de `activatePlan` — item 9), **G4** (1:1 → `OneOnOneService`/`OneOnOneMeeting`; `engagement`+`leader`+`leadership` delegam, `OneOnOne` migrado — item 10). Modelos legados (`OneOnOne`, `LegacyPdi`) deprecados/isolados; remoção física = follow-up. | 8 | — | Ver `docs/superpowers/plans/2026-09-05-fase-g{1,2,3,4}-*.md` |
| H | ~~`MetricsAggregationService` para Dashboards/Relatórios~~ — **concluída (2026-09-06)**: `src/metrics-aggregation/` (só leitura) é a fonte única de headcount/headcountTrend/turnover/trainingRoi/alertas (catálogo de 13 regras puras) /managerDashboard; `dashboard`/`dashboard-rh`/`reports`/`analytics`/`roi-impact` consomem-na com adaptador de forma histórica + `.catch` de degradação por consumidor. Fórmulas canónicas fixadas a partir das variantes (`notes/fase-h-metrics-variants.md`); valores convergem (deltas no PR). `analytics.getRiskAlerts` mantém as listas de entidades locais (só os counts do `summary` delegam). Escrita de `DashboardSnapshot` = follow-up. | 10 | — | Ver `docs/superpowers/plans/2026-09-05-fase-h-metrics-aggregation-service.md` |
| I | ~~Decisão de produto sobre multi-tenancy (§7)~~ — **resolvida**: single-tenant confirmado, sem trabalho de execução nesta fase | 1 (transversal) | — | Ver nota em §7 |
| J | `automation`/`scalability` passam a chamar serviços de domínio em vez de Prisma directo; mover webhooks/emails para a fila Bull já existente | 9, 12 | Médio | Resolve o item de segurança/robustez mais concreto (retry síncrono, matrículas duplicadas via automation) |

Cada fase acima deve ser desenvolvida como um plano de implementação próprio (TDD, tarefas pequenas, PR + CI verde antes de merge — per `CLAUDE.md`), não como uma tarefa só. Fases A–C e H são as candidatas mais seguras para começar.

---

## 14. Próximo passo

Este documento cobre as Fases 2–13 (análise + decomposição + fronteiras + contratos + BD + multi-tenancy + RBAC + eventos + observabilidade + testes + roteiro). Não escrevo aqui planos de implementação bite-sized para as 10 fases do §13 de uma vez — cada uma é um sub-projecto independente com o seu próprio plano TDD, testes de integração e PR, como o `writing-plans` e o histórico deste repositório (`CLAUDE.md`) exigem. O passo seguinte é escolher por onde começar.
