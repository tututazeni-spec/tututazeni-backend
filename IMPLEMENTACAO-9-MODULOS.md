# INNOVA — Implementação dos 9 Módulos Corporativos

> Documento-resumo da implementação completa (Opção C — um módulo de cada vez)
> Plataforma: Academia Corporativa + RH | NestJS + Prisma + PostgreSQL + Next.js
> Período: 15–17 Junho 2026 | Estado: **9/9 concluídos e em produção**

---

## 1. Visão geral

Foram implementados **9 módulos corporativos completos**, cada um com a stack vertical
inteira: schema Prisma + migração, DTOs com validação, service, controller, módulo
registado, testes unitários, colecção Bruno (testes E2E à API) e páginas de frontend.

Cada módulo seguiu os mesmos 22 passos e só avançou para o seguinte depois de todos os
testes passarem.

| # | Módulo | Rota base | Referência de mercado |
|---|---|---|---|
| 1 | CRM Beneficiários | `/crm/beneficiaries` | Salesforce Nonprofit + MS Dynamics |
| 2 | CRM Parceiros | `/crm/partners` | Salesforce Partner + HubSpot |
| 3 | CRM Financiadores | `/crm/funders` | Blackbaud Raiser's Edge + Salesforce Nonprofit |
| 4 | Biblioteca Digital | `/library` | SharePoint + DocuWare + Springer |
| 5 | Certificação Digital | `/certification` | Credly + DocuSign + Open Badges 2.0 |
| 6 | Dashboard Institucional | `/dashboard-institutional` | SAP Analytics + Power BI + Tableau |
| 7 | Gestão Académica | `/academic` | SAP Education + Blackboard + Banner |
| 8 | LMS Completo | `/lms` | Cornerstone + Workday Learning + Docebo |
| 9 | Monitoria e Avaliação | `/monitoring` | SAP SuccessFactors + OKR + 15Five |

---

## 2. Resultados da verificação global

| Verificação | Resultado |
|---|---|
| Build (`tsc`) | **0 erros** |
| Suite de testes | **200/200 suites · 3304 testes** (+3 skipped) |
| Cobertura global | **71,35% linhas** (alvo > 65%) |
| Bruno (9 colecções novas) | **9/9 verdes** |

Cobertura por módulo (service):

| Módulo | Specs | Service cov. | Bruno |
|---|---|---|---|
| CRM Beneficiários | 17 | 98% | 6/6 |
| CRM Parceiros | 18 | 98% | 6/6 |
| CRM Financiadores | 23 | 99% | 7/7 |
| Biblioteca Digital | 18 | 100% | 6/6 |
| Certificação Digital | 16 | 86% | 6/6 |
| Dashboard Institucional | 13 | 96% | 6/6 |
| Gestão Académica | 22 | 93% | 8/8 |
| LMS Completo | 16 | 81% | 6/6 |
| Monitoria e Avaliação | 16 | 86% | 8/8 |

**Total acumulado:** ~159 specs novos · 9 colecções Bruno · ~30 páginas de frontend · 9 migrações Prisma.

---

## 3. Detalhe por módulo

### Módulo 1 — CRM Beneficiários (`/crm/beneficiaries`)
- **Modelos:** `Beneficiary`, `BeneficiaryInteraction`, `BeneficiaryDocument`, `BeneficiaryNeed` + enums (`BeneficiaryType`, `BeneficiaryStatus`, `AngolaProvince`, `InteractionType`, `NeedPriority`, `NeedStatus`). Reutiliza o enum `Gender` existente.
- **Funcionalidades:** CRUD com código auto-gerado `BEN-#####`, interacções com cálculo de satisfação média, necessidades, follow-ups, dashboard com distribuições por tipo/estado/província, relatórios por período.
- **Frontend:** lista (filtros + paginação), detalhe (interacções/documentos/necessidades), formulário de criação.

### Módulo 2 — CRM Parceiros (`/crm/partners`)
- **Modelos:** `Partner`, `PartnerInteraction`, `PartnerMilestone` + enums (`PartnerType`, `PartnerTier`, `PartnerStatus`, `PartnerInteractionType`, `MilestoneStatus`).
- **Funcionalidades:** código `PAR-#####`, gestão de contratos (valor anual, datas), milestones com conclusão, contratos a expirar, milestones em atraso, dashboard com valor total AOA.
- **Frontend:** lista (filtros nível/estado), detalhe (contrato + milestones + interacções), criação.

### Módulo 3 — CRM Financiadores (`/crm/funders`)
- **Modelos:** `Funder`, `FundingGrant`, `GrantDisbursement`, `FunderInteraction`, `FunderReport` + enums (`FunderType`, `FunderStatus`, `GrantStatus`, `FunderInteractionType`, `ReportStatus`).
- **Funcionalidades:** financiadores `FIN-#####`, grants `GRT-#####`, desembolsos com validação de excesso, recálculo automático de totais (comprometido/recebido/pendente) e taxa de execução, relatórios com prazos, dashboard financeiro.
- **Frontend:** lista, detalhe (resumo financeiro + grants com barra de desembolso + adicionar desembolso), criação.

### Módulo 4 — Biblioteca Digital (`/library`)
- **Modelos:** `LibraryCollection`, `LibraryItem`, `LibraryAccess`, `LibraryRating`, `LibraryComment` + enums (`LibraryItemType`, `LibraryAction`).
- **Funcionalidades:** itens `LIB-#####`, colecções, aprovação, tracking de views/downloads, avaliações com recálculo de média, comentários, dashboard com rankings (mais vistos/descarregados/melhor avaliados).
- **Frontend:** grelha de cards, detalhe (avaliação por estrelas + comentários + download), upload.

### Módulo 5 — Certificação Digital (`/certification`)
- **Modelos:** `CertificateTemplate`, `IssuedCertificate`, `DigitalBadge`, `BadgeIssuance` + enums (`CertificateTemplateType`, `BadgeLevel`). Não altera o `Certificate` antigo.
- **Funcionalidades:** emissão `CERT-#####` com `verificationCode` + hash SHA-256, **verificação pública sem autenticação** (`@Public()`), revogação, download, badges `BDG-#####` com anti-duplicação, dashboard.
- **Frontend:** página **pública** `/verify/[code]`, "Os Meus Certificados", gestão de templates. `middleware.ts` ajustado para `/verify` ser aberto.

### Módulo 6 — Dashboard Institucional (`/dashboard-institutional`)
- **Modelos:** `InstitutionalSnapshot` (o `DashboardSnapshot` já existia a nível departamental), `DashboardWidget` + enums (`SnapshotType`, `WidgetType`).
- **Funcionalidades:** módulo READ-HEAVY que agrega dados dos módulos 1-5 — resumo executivo (people/learning/crm/knowledge), tendência de crescimento, distribuição geográfica, alertas (críticos/avisos/lembretes), snapshots de KPIs com comparação de períodos, widgets.
- **Frontend:** dashboard com cards de KPI + gráfico de barras **SVG/flex nativo** (sem libs de charting).

### Módulo 7 — Gestão Académica (`/academic`)
- **Modelos:** `AcademicYear` → `AcademicPeriod` → `AcademicProgram` → `AcademicClass` → `AcademicEnrollment` → `AcademicGrade` + `AcademicTranscript` (7 modelos) + 6 enums.
- **Funcionalidades:** anos/períodos/programas/turmas, matrícula com verificação de pré-requisitos/duplicados/vagas, workflow de aprovação, lançamento de notas com cálculo ponderado e actualização automática da transcrição/GPA, relatório académico.
- **Frontend:** grelha de programas, detalhe (turmas + matricular), transcrição (GPA + histórico).

### Módulo 8 — LMS Completo (`/lms`)
- **Modelos:** `LmsLearningPath`, `LmsPathEnrollment`, `LmsLiveSession`, `LmsLiveAttendance`, `LmsLearningAnalytics` (prefixo `Lms` para não colidir com os modelos do núcleo) + enums (`PathLevel`, `PathEnrollmentStatus`, `SessionPlatform`, `SessionStatus`).
- **Funcionalidades:** percursos de aprendizagem com progresso/conclusão automática, sessões ao vivo `SES-#####` com vagas/presença/feedback, recomendações, analytics por utilizador, dashboard.
- **Frontend:** cards de percursos, "Os Meus Percursos" (progresso + analytics), sessões ao vivo.

### Módulo 9 — Monitoria e Avaliação (`/monitoring`)
- **3 pilares integrados:** OKRs (`OkrCycle` → `Objective` → `KeyResult` → `KeyResultUpdate`), Indicadores M&E (`MonitoringIndicator` → `MonitoringRecord`), Avaliação (`EvaluationCycle` → `UserEvaluation`) — 8 modelos + 5 enums.
- **Funcionalidades:** OKRs em cascata com cálculo de progresso (ON_TRACK/AT_RISK/OFF_TRACK), variância de indicadores vs target, atribuição/submissão de avaliações de desempenho, dashboard integrado dos 3 pilares.
- **Frontend:** OKRs (objectivos + key results + barras), indicadores (baseline/meta), avaliações (minhas + a completar).

---

## 4. Padrões transversais aplicados (regras INNOVA)

- **`fullName`** (nunca `name`) no modelo `User`.
- **`AuditLog`**: campo `entity` (nunca `entityType`). Como `AuditLog.entityId` é `Int?` e
  os novos modelos usam `cuid` (String), o id real é guardado dentro de `metadata`
  (sempre `JSON.stringify`). Auditoria em todos os CREATE/UPDATE/DELETE.
- **`deletedAt`** (soft delete) em todos os novos modelos.
- **Paginação** uniforme: `{ data, total, page, limit, totalPages }`.
- **`NotificationLog`**: campo `type` é obrigatório; `metadata` sempre `JSON.stringify`.
- **Angola:** AOA, `dd/MM/yyyy`, fuso `Africa/Luanda`.

### Decisões técnicas recorrentes
- **FKs para `User` são `Int`** (o `User.id` é `autoincrement()`), por isso todos os
  campos `userId`/`ownerId`/`createdById`/etc. e os respectivos DTOs usam `number`.
- **Prisma `groupBy`** dá erro TS2615 no build → resolvido com cast `(prisma.x.groupBy as any)`.
- **Guards/decorators** em `src/common/guards` e `src/common/decorators` (o `JwtAuthGuard`
  global respeita `@Public()` via `IS_PUBLIC_KEY`).
- **Frontend** no route group `(platform)` (sidebar + auth); páginas públicas (verify) fora dele.
- O **frontend é um repositório git separado** (`tututazeni-frontend`), distinto do
  backend (`tututazeni-backend`).

---

## 5. Conflitos de nomes resolvidos

Vários nomes do guia colidiam com modelos/enums já existentes no schema INNOVA:

| Guia | Conflito | Solução |
|---|---|---|
| `enum Gender` (M1) | já existia | reutilizado (não redefinido) |
| `DashboardSnapshot` (M6) | já existia (departamental) | criado como **`InstitutionalSnapshot`** |
| `LearningPath`, `LearningPathEnrollment`, `LiveAttendance` (M8) | já existiam (núcleo) | prefixados com **`Lms`** |

Além disso, no Módulo 6 vários campos do guia estavam errados face ao schema real
(ex.: `User.active` e não `isActive`; `Course.status` e não `isActive`; `Enrollment`
usa `enrolledAt`/`completedAt` e status sem `APPROVED`) — corrigidos.

---

## 6. Infraestrutura e gotchas do ambiente

- **Migrações:** `npx prisma migrate dev` falhava com P1001 por causa dos query params
  `?connection_limit=...` no `DATABASE_URL`. Workaround usado em todas as migrações:
  `npx prisma migrate dev --name "x" --url 'postgresql://...@127.0.0.1:5432/innova_dev'`
  (URL sem query params; o `--url` sobrepõe o `prisma.config.ts`).
- **Testes:** Jest 30 usa `--testPathPatterns` (com s). A suite é lenta (~70–350s por
  ficheiro devido ao warmup do Prisma 7). `rootDir: src`, por isso os globs de
  `--collectCoverageFrom` são relativos a `src/`.
- **Bruno:** corre a partir da raiz da colecção (`cd bruno && npx bru run <pasta> --env local`).
  O login devolve status **201** e `res.body.accessToken` + `res.body.user.id`. As
  colecções com escrita usam um `runId` curto (`Date.now().slice(-6)`) para gerar
  códigos/períodos únicos e serem re-executáveis (modelos têm `@unique`).
- **Correcção pré-existente:** a verificação global revelou que o `auth.controller.spec.ts`
  estava partido (desalinhado com o refactor de auth por cookie httpOnly `@Res()` +
  `req.user.id`) — actualizado para a suite ficar 100% verde.

---

## 7. Como verificar localmente

```bash
# Backend
npm run build                 # tsc → 0 erros
npm run test                  # 200 suites, 3304 testes
npm run test:cov              # cobertura global ~71%

# Por módulo (exemplo)
npm run test -- --testPathPatterns=crm-funders --forceExit

# Bruno (com o backend a correr: node dist/main.js)
cd bruno && npx bru run monitoring --env local
```

---

*INNOVA — Academia Corporativa + RH | 9 módulos corporativos*
*DTOs + Service + Controller + Module + Spec + Bruno + Frontend, por módulo*
*Documento gerado em 17 Junho 2026*
