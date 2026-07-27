# Auditoria A-10 — Autenticação e Autorização (Varredura Sistémica IDOR)

> Auditoria completa de autenticação/autorização pedida em 2026-07-27. Âmbito:
> os 5 eixos clássicos — (1) autenticação válida e não expirada em rotas
> sensíveis, (2) verificação de papel antes de operações restritas, (3)
> ownership em read/update/delete, (4) invalidação de tokens no logout e por
> inactividade, (5) isolamento de endpoints administrativos. Cobre os **70
> controllers** do backend (varredura manual dos módulos centrais + 3
> sub-varreduras cobrindo os 51 controllers não tocados pelas auditorias A3/A9
> anteriores). **Este documento só reporta e planeia — nenhuma correção foi
> aplicada.**

---

## 1. Resumo executivo

**Eixos 1, 4 e 5 estão sólidos** e não precisam de trabalho novo:

- `JwtAuthGuard` + `RolesGuard` + `ThrottlerGuard` são globais (`APP_GUARD` em
  `src/app.module.ts:220-222`) — toda rota exige JWT válido e não expirado por
  omissão; `@Public()` é usado só onde devia (login/refresh/logout/reset,
  health, métricas com token próprio, verificação pública de certificado).
- Refresh tokens rodam com deteção de reutilização (`auth.service.ts:156-213`):
  token roubado e reutilizado revoga a cadeia inteira; troca de password
  invalida todas as sessões activas (`passwordChangedAt` + `JwtStrategy`
  rejeita tokens emitidos antes da troca). Access token dura 15 min — não há
  invalidação por inactividade explícita, mas a janela curta limita o impacto.
- Módulos administrativos que **foram varridos em auditorias anteriores**
  (`users` escrita, `acl`, `audit`, `roles-permissions`) isolam correctamente
  as operações sensíveis atrás de `@Roles(ADMIN, RH, ...)`.

**Eixos 2 e 3 têm um problema sistémico e generalizado.** A auditoria A-3
(2026-07-12) e as duas Faixas A de remediação (2026-07-24) corrigiram o padrão
em ~10 módulos (`payslips`, `work-declaration`, `mobile`, `certification`,
`courses`, `assessments`, `departments`) e criaram o utilitário correto —
`assertCanAccess` / `isPrivileged` / `ownershipWhere` em
`src/common/authz/ownership.ts`. **Esse padrão nunca foi aplicado aos
restantes ~51 controllers.** A varredura desta auditoria (manual nos módulos
centrais + 3 sub-varreduras automatizadas cobrindo o resto do backend)
encontrou **25 endpoints** com o mesmo defeito: ou não há `@Roles()` a
restringir quem pode chamar a rota, ou o `userId`/`:id` vem do pedido sem
nenhuma comparação com o utilizador autenticado.

O achado mais grave (**A10-1**) é novo em relação a tudo o que já tinha sido
reportado: `GET /users/:id` devolve o **hash bcrypt da password** de qualquer
utilizador a qualquer colaborador autenticado, porque o serviço usa `include`
(em vez de `select`) no topo da query Prisma sobre o modelo `User` — que tem
`password String?` como coluna escalar — e não existe nenhuma camada de
serialização (`ClassSerializerInterceptor` ou equivalente) a filtrar a
resposta em lado nenhum da aplicação.

## 2. Cenários de ataque (porquê importa)

**Dump de password hashes.** Um colaborador autenticado (qualquer papel)
itera `GET /users/1`, `/users/2`, … `/users/6000`. Cada resposta inclui o
`password` (hash bcrypt), `phone`, `birthDate`, `gender`, `city`, `country`,
`employeeNumber` de outro colaborador. Os hashes podem ser atacados offline
(rainbow tables / força bruta) sem qualquer rate-limit, porque o ataque não
passa pelo endpoint de login.

**Dossier de RH completo por colaborador.** `employees.controller.ts` exige
apenas `COLABORADOR` (o papel base de todos os ~6000 funcionários) em todas as
rotas `:id`, e nenhum método do serviço filtra por quem pede. Isto expõe PDI,
avaliações 360, feedback qualitativo, planos de carreira, documentos de RH,
assiduidade e a timeline completa de qualquer colega — o ficheiro de RH
inteiro, não só um campo isolado.

**Forjar auto-avaliações e avaliações de gestor.** `POST
/performance/submit` não tem `@Roles()` e o serviço nunca verifica se quem
submete é o dono da revisão (`review.userId`) ou o gestor responsável
(`review.reviewerId`). Qualquer colaborador pode submeter uma pontuação em
nome de outra pessoa e avançar o workflow de avaliação de desempenho para
`PENDING_MANAGER`/`CALIBRATION`.

**Tamper de PDI e XP farming.** Em `development-plans` e `talent-development`,
adicionar/editar/apagar acções, metas, checkpoints e evidências de PDI não
verifica o dono do plano — incluindo um caso em que completar uma acção de
**outro** colaborador atribui XP ao atacante.

**Fuga de banda salarial.** `GET /organization/users/:userId/profile` não tem
`@Roles()` e devolve `position.salaryMin`/`salaryMax` do colega alvo.

## 3. Achados

### 3.1 🔴 Crítico

| # | Achado | Evidência |
|---|---|---|
| A10-1 | `GET /users/:id` sem `@Roles()`; `findOne()` usa `include` (não `select`) e devolve o hash da password + PII de qualquer utilizador a qualquer autenticado. Sem `ClassSerializerInterceptor` em nenhum ponto da app | `users.controller.ts:102-106`; `users.service.ts:139-192`; `prisma/schema.prisma` (`User.password String?`) |
| A10-2 | `employees.controller.ts` — todas as rotas `:id` só exigem `COLABORADOR` (papel base); nenhum método do serviço filtra por `employeeId` vs. autenticado. Expõe PDI, 360, feedback, planos de carreira, documentos, assiduidade, timeline de qualquer colega | `employees.controller.ts:88-358`; `employees.service.ts:164-789` |
| A10-3 | `evaluation.controller.ts` `GET /evaluations/results/:userId` e `/evolution/:userId` — `@Roles(...ALL_ROLES)` inclui `COLABORADOR`; sem comparação com o autenticado. Expõe pontuação 360, nomes de avaliadores e texto qualitativo de qualquer colega | `evaluation.controller.ts:182-196`; `evaluation.service.ts:799,1275` |
| A10-4 | `performance.controller.ts` `POST /performance/submit` sem `@Roles()`; `submitReview()` chama `findOne(dto.reviewId)` sem passar `user`, saltando o ownership check que existe no caminho de leitura. Permite forjar auto-avaliação ou avaliação de gestor de qualquer colega | `performance.controller.ts:169`; `performance.service.ts:255` |
| A10-5 | `development-plans.controller.ts` — `addAction/updateAction/removeAction/addGoal/updateGoalProgress/addCheckpoint/completeCheckpoint/addEvidence` sem `@Roles()` e sem ownership; `updateAction` atribui XP ao chamador ao completar acção de outro colaborador | `development-plans.controller.ts:137-195`; `development-plans.service.ts` |
| A10-6 | `talent-development.controller.ts` `updateGoal`/`updateActionProgress` — sem verificação de dono apesar do comentário "colaborador actualiza o seu próprio progresso" | `talent-development.controller.ts:184-224`; `talent-development.service.ts:640,731` |

### 3.2 🟠 Alto

| # | Achado | Evidência |
|---|---|---|
| A10-7 | `process-standard.controller.ts` `getInstanceDetail`/`completeStep`/`rejectStep` sem `@Roles()`; sem verificar que o chamador é o `responsibleId` do passo ou o `targetUserId` da instância — permite ver e forjar aprovação/rejeição de qualquer workflow | `process-standard.controller.ts:187-240`; `process-standard.service.ts:501,567` |
| A10-8 | `organization.controller.ts` `GET /organization/users/:userId/profile` sem `@Roles()`; devolve `salaryMin`/`salaryMax` de qualquer colega | `organization.controller.ts:96-100`; `organization.service.ts:560` |
| A10-9 | `crm-beneficiaries.controller.ts` — leituras (`findAll`/`findOne`/`getInteractions`) sem `@Roles()` embora escrita seja `ADMIN/RH/GESTOR`; devolve nif, telefone, email, notas de caso de beneficiários | `crm-beneficiaries.controller.ts:46,75,112` |
| A10-10 | `crm-funders.controller.ts` — leituras e `addInteraction` sem `@Roles()`; expõe montantes de subsídios e histórico de desembolsos | `crm-funders.controller.ts:49,79,117,151,163` |
| A10-11 | `career-plans.controller.ts` `getReadiness`/`simulate` sem `@Roles()` nem ownership; `userId` vem do pedido sem filtro | `career-plans.controller.ts:152,161` |
| A10-12 | `enrollments.controller.ts` `PATCH /enrollments/my/:id/cancel` sem comparar `e.userId` com o autenticado (o equivalente em `leave-management` faz esta verificação) | `enrollments.controller.ts:58-67`; `enrollments.service.ts:332` |

### 3.3 🟡 Médio

| # | Achado | Evidência |
|---|---|---|
| A10-13 | `crm-partners.controller.ts` — leituras + `completeMilestone` sem `@Roles()` | `crm-partners.controller.ts:46,80,117,140` |
| A10-14 | `career-plans.controller.ts` `addGoal` — `careerPlanId` do cliente sem ownership (write IDOR); `requestPromotion` — `dto.userId` não verificado | `career-plans.controller.ts:223,248` |
| A10-15 | `academic.controller.ts` `enroll` — `dto.userId` do cliente sem verificação; `getEnrollmentGrades` — sem filtro por dono, expõe notas via `enrollmentId` | `academic.controller.ts:105,137` |
| A10-16 | `enrollments.controller.ts` `generateCertificate` sem ownership | `enrollments.controller.ts:69-74`; `enrollments.service.ts:384` |
| A10-17 | `leader.controller.ts` `getTeamFeedbacks` — `userId` da query sem verificar que pertence à equipa do líder chamador | `leader.controller.ts:130-132`; `leader.service.ts:525-527` |
| A10-18 | `evaluation360.controller.ts` `giveConsent` sem `@Roles()` nem verificação de identidade — permite forjar consentimento LGPD de outro colaborador | `evaluation360.controller.ts:182-190`; `evaluation360.service.ts:321` |
| A10-19 | `declarations.controller.ts` (`WorkDeclarationsController.findOne`) sem `@Roles()`/`@CurrentUser()`; sem filtro por dono — módulo distinto do `work-declaration` já corrigido na A3 | `declarations.controller.ts:271`; `work-declarations.service.ts:202` |
| A10-20 | `pdf.controller.ts` — `declaration/:id`, `certificate/:id`, `payslip/:id`, `report/:id` sem `@Roles()` nem desenho de ownership; hoje devolve dados placeholder (`TODO: buscar dados reais`), mas fica IDOR latente assim que ligado a dados reais | `pdf.controller.ts:9-95` |
| A10-21 | `performance.controller.ts` `createGoal` — `dto.userId` não verificado | `performance.controller.ts:191` |
| A10-22 | `engagement.controller.ts` `humanSuccessScore` — `@Roles(...ALL_ROLES)` deixa qualquer `COLABORADOR` ver a pontuação composta de outro utilizador, inconsistente com a restrição mais apertada do mesmo dado em `performance.controller.ts` | `engagement.controller.ts:315-320` |

### 3.4 🟢 Baixo

| # | Achado | Evidência |
|---|---|---|
| A10-23 | `leave-management.controller.ts` `GET /leave/conflict-check?userId=` sem gate de papel/ownership — permite sondar se um colega tem férias marcadas num período | `leave-management.controller.ts:110-121` |
| A10-24 | Não há invalidação de sessão por inactividade (só expiração fixa de 15 min no access token); aceitável dado o TTL curto, mas registar como decisão consciente, não omissão | `jwt.strategy.ts`; `auth.service.ts:223-242` |

### O que está bem (não alterar)

- Guards globais, `@Public()` mínimo, rotação de refresh token com deteção de
  reutilização, invalidação de sessão em troca de password.
- `payslips`, `work-declaration` (módulo original), `mobile`, `certification`,
  `courses`, `assessments`, `departments`, `users` (escrita), `acl`, `audit`,
  `roles-permissions` — já usam `@Roles()` e/ou `assertCanAccess` correctamente
  (resultado das auditorias A3 e Faixa A de 2026-07-24).
- O utilitário `src/common/authz/ownership.ts` (`assertCanAccess`,
  `isPrivileged`, `ownershipWhere`) é a peça que falta replicar — não precisa
  de ser reinventado, só aplicado nos 51 controllers ainda não tocados.

## 4. Plano de remediação proposto (não aplicado)

Ordem = ordem de risco. Cada bloco reaplica o padrão já validado em produção
(`assertCanAccess`/`isPrivileged`/`ownershipWhere` + `@Roles()` explícito),
não introduz nenhum utilitário novo.

1. **A10-1** — `select` explícito (sem `password`) em `UsersService.findOne`;
   avaliar `@Roles()` ou ownership em `GET /users/:id`.
2. **A10-2 a A10-6** — aplicar `@Roles()`/`assertCanAccess` em `employees`,
   `evaluation`, `performance` (submitReview + createGoal),
   `development-plans`, `talent-development`.
3. **A10-7 a A10-12** — `process-standard`, `organization` (ocultar banda
   salarial de não-privilegiados), `crm-beneficiaries`, `crm-funders`,
   `career-plans` (readiness/simulate), `enrollments` (cancel).
4. **A10-13 a A10-22** — restantes achados médios (`crm-partners`,
   `career-plans` addGoal/requestPromotion, `academic`, `enrollments`
   certificate, `leader`, `evaluation360` consent, `declarations`, `pdf`,
   `engagement`).
5. **A10-23** — `leave-management` conflict-check.
6. Teste de regressão por achado: "colaborador A não acede/edita recurso de B
   → 403/404", seguindo o padrão de testes já usado nas specs de
   `certification.service.ownership.spec.ts` e `mobile.controller.spec.ts`.

## 5. Critérios de aceitação

- [ ] `GET /users/:id` e `GET /users/me` nunca devolvem o campo `password`.
- [ ] Todas as rotas `:id`/`:userId` listadas na secção 3 usam `@Roles()`
      e/ou `assertCanAccess`/`ownershipWhere` — nenhuma depende só de
      "está autenticado" quando o recurso é pessoal ou administrativo.
- [ ] Cada achado tem um teste de regressão "não-dono → 403/404".
- [ ] `pdf.controller.ts` ganha desenho de ownership antes de ser ligado a
      dados reais (não pode ficar como débito técnico até ao lançamento).
