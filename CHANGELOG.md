# Changelog

Todas as alterações relevantes deste projecto são documentadas neste ficheiro.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/)
e o projecto adere ao [Versionamento Semântico](https://semver.org/lang/pt-BR/).

---

## [1.0.0] — 2026-06-17

Primeira versão estável. Entrega dos **9 módulos corporativos** (Opção C), cada um com
schema + migração, DTOs, service, controller, testes, colecção Bruno e frontend.

### Added — Backend (NestJS + Prisma)

- **CRM Beneficiários** (`/crm/beneficiaries`) — `Beneficiary`, `BeneficiaryInteraction`,
  `BeneficiaryDocument`, `BeneficiaryNeed`. Código `BEN-#####`, interacções com satisfação
  média, necessidades, follow-ups, dashboard e relatórios.
- **CRM Parceiros** (`/crm/partners`) — `Partner`, `PartnerInteraction`, `PartnerMilestone`.
  Código `PAR-#####`, contratos, milestones, contratos a expirar, dashboard com valor AOA.
- **CRM Financiadores** (`/crm/funders`) — `Funder`, `FundingGrant`, `GrantDisbursement`,
  `FunderInteraction`, `FunderReport`. Grants `GRT-#####`, desembolsos com validação de
  excesso, recálculo de totais e taxa de execução, relatórios, dashboard financeiro.
- **Biblioteca Digital** (`/library`) — `LibraryCollection`, `LibraryItem`, `LibraryAccess`,
  `LibraryRating`, `LibraryComment`. Itens `LIB-#####`, aprovação, tracking de views/downloads,
  avaliações, comentários, dashboard com rankings.
- **Certificação Digital** (`/certification`) — `CertificateTemplate`, `IssuedCertificate`,
  `DigitalBadge`, `BadgeIssuance`. Emissão `CERT-#####` com `verificationCode` + hash SHA-256,
  **verificação pública sem autenticação**, revogação, badges `BDG-#####`, dashboard.
- **Dashboard Institucional** (`/dashboard-institutional`) — `InstitutionalSnapshot`,
  `DashboardWidget`. Agregação dos módulos 1-5: resumo executivo, tendências, distribuição
  geográfica, alertas, snapshots de KPIs com comparação de períodos, widgets.
- **Gestão Académica** (`/academic`) — `AcademicYear`, `AcademicPeriod`, `AcademicProgram`,
  `AcademicClass`, `AcademicEnrollment`, `AcademicGrade`, `AcademicTranscript`. Matrícula com
  pré-requisitos/vagas, workflow de aprovação, notas ponderadas, transcrição/GPA, relatório.
- **LMS Completo** (`/lms`) — `LmsLearningPath`, `LmsPathEnrollment`, `LmsLiveSession`,
  `LmsLiveAttendance`, `LmsLearningAnalytics`. Percursos com progresso automático, sessões ao
  vivo `SES-#####`, presenças, recomendações, analytics por utilizador, dashboard.
- **Monitoria e Avaliação** (`/monitoring`) — `OkrCycle`, `Objective`, `KeyResult`,
  `KeyResultUpdate`, `MonitoringIndicator`, `MonitoringRecord`, `EvaluationCycle`,
  `UserEvaluation`. Três pilares: OKRs em cascata, indicadores M&E com variância, avaliação
  de desempenho, dashboard integrado.

### Added — Frontend (Next.js, repo `tututazeni-frontend`)

- ~30 páginas novas em `app/(platform)/...` (lista, detalhe e formulários por módulo).
- Página **pública** de verificação de certificados `app/verify/[code]` (fora do layout autenticado).
- Gráficos em **SVG/flex nativo** no Dashboard Institucional (sem bibliotecas de charting).
- 11 novos itens de navegação na sidebar.

### Added — Qualidade

- ~159 testes unitários novos (Jest), cobertura global **71,35%**.
- 9 colecções Bruno (testes E2E à API), todas verdes e re-executáveis.

### Changed

- `auth.controller.spec.ts` actualizado para a assinatura com `@Res({ passthrough: true })`
  e `req.user.id` (alinhamento com a autenticação por cookie httpOnly).
- `frontend/middleware.ts`: `/verify` passa a rota totalmente aberta (sem redireccionamento),
  para a verificação pública de certificados funcionar com ou sem sessão.

### Database — Migrações (aplicar por ordem)

```
20260615214044_add_crm_beneficiaries
20260616075926_add_crm_partners
20260616090942_add_crm_funders
20260616102422_add_library
20260616125345_add_certification
20260616144337_add_dashboard_institutional
20260616160042_add_academic_management
20260616171304_add_lms_complete
20260616213248_add_monitoring_evaluation
```

> Todas aditivas (novas tabelas/enums + relações inversas no `User`). Sem alterações
> destrutivas a tabelas existentes.

### Notas de compatibilidade

- Nenhum modelo existente foi alterado de forma incompatível. Conflitos de nomes do guia
  resolvidos por renomeação: `DashboardSnapshot`→`InstitutionalSnapshot`; modelos LMS
  prefixados com `Lms`; o enum `Gender` existente foi reutilizado.

---

## [0.0.1] — base

- Núcleo INNOVA: Academia (cursos, lições, matrículas, avaliações, certificados) e RH
  (utilizadores, PDI, presenças, notificações, auditoria), autenticação JWT por cookie
  httpOnly, CI com SonarCloud.

[1.0.0]: #100--2026-06-17
[0.0.1]: #001--base
