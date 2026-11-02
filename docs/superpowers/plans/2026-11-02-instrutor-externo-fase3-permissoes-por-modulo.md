# Instrutor Externo — Fase 3: Permissões por Módulo

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:executing-plans` (inline, TDD) ou `superpowers:subagent-driven-development`. Steps usam checkbox (`- [ ]`). Pré-requisito: fases 1–2 e endurecimento (ramo `feat/instrutor-externo-fase1`).

**Goal:** O papel `INSTRUCTOR_EXTERNO` só alcança o que a matriz da spec lhe dá e, em cada módulo, só vê/edita o que **ele** criou ou onde é instrutor.

**Architecture:** (1) uma **barreira central** no `RolesGuard`: um instrutor externo só passa em handlers que o listem **explicitamente** em `@Roles(...)` ou os marquem com `@AllowExternal()`; `@AnyAuthenticated()` e `@Roles(...AUTHENTICATED_ROLES)` deixam de o admitir por omissão. (2) Depois, módulo a módulo, abrem-se os handlers necessários e o **serviço** impõe o âmbito (nunca confiar no `instructorId` vindo do cliente). Um teste de inventário "congela" a lista exata de handlers acessíveis ao externo.

**Tech Stack:** NestJS, Prisma/PostgreSQL, Jest (+ `test/authz` e integração com Postgres real), Next.js (`frontend/`).

**Spec:** `docs/superpowers/specs/2026-11-02-instrutor-externo-acesso-design.md` §4.5 e §5 (matriz). Fases anteriores: `docs/superpowers/plans/2026-11-02-instrutor-externo-fase{1,2}-*.md`, `…-endurecimento.md`.

## Factos do código (verificados antes de escrever o plano)

- `RolesGuard` (`src/common/guards/roles.guard.ts`) compara `user.role.name` com `@Roles`; `@AnyAuthenticated()` deixa passar **qualquer** autenticado; sem política → 403.
- **~366 handlers `@AnyAuthenticated()` em 42 controllers** (maiores: ai-tutor 21, career 19, live-classes 18, leave-management 15, knowledge 15, evaluation360 15, development-plans 15, competencies 14, search 12, declarations 12 …).
- **`AUTHENTICATED_ROLES` (`src/auth/enums/role.enum.ts`) contém `INSTRUCTOR_EXTERNO`** e é usado em `@Roles(...)` de assessments, automation, avatar-training (31), certificates, content-library (20), courses, dashboard, departments, evaluation, history, process-standard (40), scalability-infra → o externo **já** entra nestes endpoints hoje.
- `live-classes.controller.ts`: listas (`GET /live-classes`, `upcoming`, `dashboard`, `calendar`, `sessions`, `participants`, `instructors`, `virtual-rooms`, `recordings`, `materials`) são `@AnyAuthenticated()` e o filtro `instructorId` é **opcional e vindo do cliente**; `evaluations`, `reports/overview|export` são ADMIN/RH/LIDER; criar/editar/sessões/materiais/presenças/publicar gravação são ADMIN/RH(/LIDER).
- Módulos/lições: dois sítios — `src/course-modules/course-modules.controller.ts` (`modules/*`, `lessons/*`, ADMIN/RH) e `src/courses/courses.controller.ts` (`modules/:moduleId/lessons`, `lessons/*`, atividades, recursos). Posse de curso: `Course.primaryInstructorId` e tabela `CourseInstructor(courseId, userId)`.
- Turmas (`CourseCohort.instructorId`, `CourseCohortSession.instructorId`) já têm âmbito para o externo (commit `531f3cc1`).
- `enrollments.service.ts:190,293` ramifica só em `Role.INSTRUCTOR`.
- `test/authz/authz-coverage.spec.ts` usa `collectAuthzInventory(src)` (`src/common/guards/authz-inventory`).
- `live-classes.service.ts:199`: moderador = `['ADMIN','RH','INSTRUCTOR']`.

## Global Constraints

- Matriz da spec §5 (inalterada): **cursos** ver (onde é instrutor), **não criar**; **módulos/lições/conteúdo** criar/editar nos seus cursos; **inscritos** ver dos seus cursos/turmas; **turmas** ver abertas (já feito), não criar; **aulas ao vivo/sessões/participantes/material** criar e gerir só as suas; **calendário/gravações/avaliações-feedback/relatórios** só das suas aulas.
- O externo **nunca** acede a: dados de outros utilizadores, diretório de pessoas, RH, pagamentos, recibos, ausências, carreira, PDI, avaliações 360, auditoria, definições, utilizadores, notificações de outros, pesquisa global, IA, biblioteca de conteúdos da empresa.
- Âmbito sempre imposto **no serviço**; `instructorId`/`createdById` recebidos do cliente são ignorados para o externo (forçados a `user.id`). Recurso alheio → **404** (não 403) para não revelar existência.
- Papel comparado por `user.role.name === 'INSTRUCTOR_EXTERNO'` (constante em `src/instructor-invites/constants.ts`).
- Manter `INSTRUCTOR` (interno) exatamente como está.
- Migrations só se necessário (preferir não mudar o schema). `tsc` precisa de `NODE_OPTIONS=--max-old-space-size=8192`; ficheiros com EOL misto: editar preservando o formato (`git ls-files --eol`); heredocs longos no Bash falham — escrever scripts/ficheiros com a ferramenta de escrita.
- Testes de integração em lotes pequenos (`--testPathPatterns=<pasta> --runInBand`, `NODE_OPTIONS=--max-old-space-size=4096`) e **nunca em paralelo** com outra corrida (BD partilhada, pouca memória). `afterAll` apaga filhos antes de pais.
- Commits locais Conventional Commits com `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; `npx prettier --write` nos ficheiros do backend; frontend sem prettier em ficheiros existentes.

## Review Focus

1. **Endpoint novo no futuro**: qualquer `@AnyAuthenticated()` adicionado depois continua inacessível ao externo (a barreira é opt-in, não lista negra).
2. Externo chama `GET /live-classes`, `/calendar`, `/recordings`, `/materials`, `/participants`, `/instructors`, `/dashboard` **sem filtros** → só vê as suas; com `?instructorId=<outro>` → continua a ver só as suas.
3. IDOR por id: `GET/PUT/DELETE /live-classes/:id…`, `…/sessions/:sessionId`, `…/materials`, `…/attendance`, `…/recording/*`, `modules/:id`, `lessons/:id` de outro instrutor ou da empresa → 404, também com id numérico adivinhado.
4. Criar aula com `instructorId`/`coInstructorId` de outro, ou com `courseId`/`moduleId`/`lessonId` onde **não** é instrutor → recusado/forçado.
5. Escalada via módulos adjacentes: o externo não consegue ler o ficheiro de uma lição (`lessons/:id/file|audio`) de curso alheio, nem relatórios gerais (`/reports/*`), nem exports.
6. Conta externa **expirada/inativa** continua a falhar (fases anteriores) e uma lista congelada de handlers acessíveis detecta qualquer acesso novo.

---

## Tasks

### Task 1 — Barreira central no `RolesGuard` (fecha as ~366 rotas abertas)

**Files:** Modify `src/common/guards/roles.guard.ts`, `src/common/decorators/authz.decorators.ts` (novo `AllowExternal`), `src/auth/enums/role.enum.ts` (retirar `INSTRUCTOR_EXTERNO` de `AUTHENTICATED_ROLES`); Test `src/common/guards/roles.guard.spec.ts`, `test/authz/external-reach.spec.ts` (novo).

**Interfaces — Produces:** `AllowExternal = () => SetMetadata(ALLOW_EXTERNAL_KEY, true)`; `RolesGuard`: se `user.role.name === 'INSTRUCTOR_EXTERNO'` e o handler só tem `@AnyAuthenticated()` (sem `@Roles` que o inclua) → `ForbiddenException` **a menos que** `@AllowExternal()`; `@Roles(...)` continua a decidir por lista; `@RequirePermission` inalterado.

- [ ] **Step 1 (testes a falhar)** `roles.guard.spec.ts`: externo + `@AnyAuthenticated` → 403; externo + `@AnyAuthenticated @AllowExternal` → passa; externo + `@Roles(ADMIN)` → 403; externo + `@Roles(INSTRUCTOR_EXTERNO)` → passa; COLABORADOR + `@AnyAuthenticated` → passa (sem regressão); sem utilizador → 403 como hoje.
- [ ] **Step 2** Implementar o guard e o decorador; retirar `INSTRUCTOR_EXTERNO` de `AUTHENTICATED_ROLES` (os handlers que o externo precise passam a declará-lo explicitamente nas tarefas seguintes).
- [ ] **Step 3 (allowlist mínima)** marcar `@AllowExternal()` só o essencial: `GET /auth/me`, `POST /auth/logout`, `PATCH /auth/change-password`, perfil próprio (`/users/me` ou equivalente — confirmar no código), `GET /settings` público de marca/idioma se o frontend os exigir para renderizar. Cada marca com comentário a justificar.
- [ ] **Step 4 (teste de inventário congelado)** `test/authz/external-reach.spec.ts`: com `collectAuthzInventory`, calcular os handlers acessíveis ao externo (declaram `INSTRUCTOR_EXTERNO` em `@Roles` ou têm `@AllowExternal`) e comparar com uma lista fixa em `test/authz/external-reach.snapshot.json`. Qualquer mudança exige atualizar o snapshot de propósito (revisão humana).
- [ ] **Step 5** `npx jest src/common/guards test/authz --config` (authz usa `test/jest-authz.json`): verde. Correr as suites de integração `auth`, `users`, `courses`, `enrollment` (regressão dos papéis normais).
- [ ] **Step 6: Commit** `feat(instructor-externo): barreira central de autorização para o instrutor externo`.

### Task 2 — Âmbito reutilizável

**Files:** Create `src/common/authz/external-scope.ts` (+ `.spec.ts`).

**Interfaces — Produces:**
`isExternalInstructor(user: { role?: { name?: string | null } | null }): boolean`;
`forceOwnInstructor<T extends { instructorId?: number }>(user, filters: T): T` (para o externo devolve `{...filters, instructorId: user.id}`; para os restantes devolve inalterado);
`assertOwnLiveClass(prisma, user, liveClassId): Promise<void>` (404 se `instructorId`/`coInstructorId` ≠ `user.id`; no-op para quem não é externo);
`assertCanManageCourse(prisma, user, courseId): Promise<void>` (404 se não for `primaryInstructorId` nem estiver em `CourseInstructor`; no-op para quem não é externo).

- [ ] **Step 1 (testes)** com Prisma mockado: cada helper para externo-dono, externo-alheio (404), não-externo (no-op); `forceOwnInstructor` sobrepõe um `instructorId` vindo do cliente.
- [ ] **Step 2** Implementar; **Step 3: Commit** `feat(instructor-externo): helpers de âmbito do instrutor externo`.

### Task 3 — Cursos, módulos e lições

**Files:** Modify `src/courses/courses.controller.ts` + `courses.service.ts`, `src/course-modules/course-modules.controller.ts` + service; Test unit + `test/integration/instructor-scope/courses.integration-spec.ts` (novo).

- [ ] **Step 1 (testes de integração a falhar)** com 2 instrutores externos (A, B), 1 curso de A (via `CourseInstructor`/`primaryInstructorId`), 1 curso da empresa: A lista cursos → só o seu; `GET /courses/:id` do curso alheio → 404; A cria módulo/lição no seu curso → 201; no curso alheio/da empresa → 404; **A não cria curso** (`POST /courses` → 403); A edita/apaga/reordena o seu módulo → ok, o de B → 404; `lessons/:id/file|audio` alheio → 404; B não vê nada de A.
- [ ] **Step 2** Em `course-modules.controller.ts` e nos handlers de módulos/lições/atividades/recursos de `courses.controller.ts`: acrescentar `Role.INSTRUCTOR_EXTERNO` aos `@Roles` de **criar/editar/reordenar/mover/apagar/publicar módulos e lições, materiais de módulo, atividades e recursos de lição**; manter fora: `POST /courses`, apagar/arquivar curso, publicar curso, clonar módulo entre cursos.
- [ ] **Step 3** Nos serviços, chamar `assertCanManageCourse` (resolvendo o `courseId` pelo módulo/lição quando o id vem só de `modules/:id` ou `lessons/:id`) **antes** de qualquer escrita/leitura de conteúdo; a lista de cursos do externo filtra por `CourseInstructor`/`primaryInstructorId` (servidor, não cliente).
- [ ] **Step 4** Testes → verdes. **Commit** `feat(instructor-externo): cursos, módulos e lições nos seus cursos`.

### Task 4 — Inscritos e turmas

**Files:** Modify `src/enrollments/enrollments.controller.ts` + `enrollments.service.ts` (ramos nas linhas ~190 e ~293), `src/courses/courses.controller.ts` (turmas); Test integração `test/integration/instructor-scope/enrollments.integration-spec.ts`.

- [ ] **Step 1 (testes)** externo A vê `GET /enrollments` e `GET /enrollments/manageable-courses` **apenas** dos seus cursos/turmas; `GET /enrollments/:id` de curso alheio → 404; **não** consegue `POST/PUT/PATCH` de inscrições (ADMIN/RH), `users/:userId`, `team`, `by-department`, `compliance`.
- [ ] **Step 2** Acrescentar `INSTRUCTOR_EXTERNO` só a `GET /enrollments`, `GET /enrollments/manageable-courses` (e `GET /enrollments/:id` com o âmbito no serviço); no serviço, tratar o externo como o ramo `INSTRUCTOR` mas **filtrado por posse do curso** (`CourseInstructor`/`primary`) ou por `CourseCohort.instructorId`. Nunca expor email/telefone/NIF dos inscritos além de nome e progresso (reutilizar a redação já usada para `INSTRUCTOR`).
- [ ] **Step 3** Confirmar que as turmas (`cohorts/*`) continuam como no commit `531f3cc1` e que o externo **não** cria turmas (`POST courses/:id/cohorts` → 403).
- [ ] **Step 4: Commit** `feat(instructor-externo): inscritos e turmas dos seus cursos`.

### Task 5 — Aulas ao vivo (o módulo maior)

**Files:** Modify `src/live-classes/live-classes.controller.ts` e `live-classes.service.ts`; Test unit + `test/integration/instructor-scope/live-classes.integration-spec.ts`.

- [ ] **Step 1 (testes de integração a falhar)** A e B externos + aula da empresa: (a) listas sem filtro (`GET /live-classes`, `upcoming`, `dashboard`, `sessions`, `participants`, `instructors`, `virtual-rooms`, `recordings`, `materials`, `calendar`) devolvem **só** as de A, mesmo com `?instructorId=<B>`; (b) `GET/PUT/DELETE /live-classes/:id` e `…/room|messages|sessions|materials|attendance|recording/*` de B ou da empresa → 404; (c) `POST /live-classes` por A cria **com `instructorId = A`** ignorando `instructorId`/`coInstructorId` do corpo, e só aceita `courseId/moduleId/lessonId` de cursos onde A é instrutor; (d) A cria sessões, regista presenças/participantes (`attendance`, `attendance/bulk`), carrega material (`materials`, `sessions/:sessionId/materials`) **na sua aula**; (e) A **vê** gravações das suas aulas mas não as publica/despublica; (f) A inicia a sua aula (`:id/start`) e entra como moderador só nas suas; (g) `settings`, `evaluations` e `reports` gerais → 403.
- [ ] **Step 2** Controller: acrescentar `Role.INSTRUCTOR_EXTERNO` às listas e aos handlers acima (`@AnyAuthenticated()` → `@AnyAuthenticated() @AllowExternal()` para as listas/leitura partilhadas com alunos; `@Roles(…)` com o externo para criar/editar/sessões/materiais/presenças/start). **Fora**: `settings`, `postpone`/`cancel`/`duplicate` de aulas alheias (já cobertas pelo âmbito), publicar gravação, `post-evaluation` (criar avaliação pós-aula), `reports` gerais.
- [ ] **Step 3** Serviço: em **todos** os métodos de listagem aplicar `forceOwnInstructor(user, filters)` (inclui `listAllSessions`, `listVirtualRooms`, `listRecordings`, `listMaterials`, `getCalendar`, `listParticipants`, `listInstructors` — este último devolve só o próprio) e `assertOwnLiveClass` em todos os métodos por id; em `create` forçar `instructorId = user.id` e validar `courseId/moduleId/lessonId` com `assertCanManageCourse`. Passar o `user` do controller para estes métodos (assinaturas hoje só recebem filtros) — os restantes papéis mantêm o comportamento (o helper é no-op).
- [ ] **Step 4** Estender `live-classes.service.ts:199` para tratar o externo como moderador **da sua aula**.
- [ ] **Step 5** Testes → verdes. **Commit** `feat(instructor-externo): aulas ao vivo, sessões, participantes e material só das suas aulas`.

### Task 6 — Avaliações/feedback das aulas e relatórios próprios

**Files:** Modify `live-classes.controller.ts` (`evaluations`, `evaluations/summary`, `reports/overview`, `reports/export`, `:id/attendance-report`) + service; Test integração `…/live-classes-reports.integration-spec.ts`.

- [ ] **Step 1 (testes)** A vê `evaluations`, `evaluations/summary`, `reports/overview`, `reports/export` e `:id/attendance-report` **apenas** das suas aulas (totais e exportação não incluem aulas alheias); B não vê os de A; `export` de A não contém linhas de B.
- [ ] **Step 2** Acrescentar `INSTRUCTOR_EXTERNO` a estes `@Roles` e aplicar o âmbito no serviço (filtro por `instructorId`/`coInstructorId` na query agregada, não pós-filtragem em memória). Os módulos `reports/*`, `executive-reports`, `dashboard*`, `analytics` ficam **fechados** (confirmado pelo snapshot da Task 1).
- [ ] **Step 3: Commit** `feat(instructor-externo): avaliações e relatórios das suas aulas`.

### Task 7 — Verificações transversais

- [ ] **RLS:** com `RLS_ENABLED=true`, repetir os testes das tarefas 3–6 (o papel externo **não** entra nos papéis privilegiados de `src/common/rls/rls-context.ts`); corrigir políticas só se alguma query legítima falhar.
- [ ] **Anexos/ficheiros:** `lessons/:id/file|audio`, gravações e materiais (URLs/streams) respeitam o mesmo âmbito (404 para alheios).
- [ ] **Auditoria:** criar/editar/apagar do externo registam o ator (reutilizar `AuditService`); sem novos tipos obrigatórios.
- [ ] **Expiração:** teste de integração: externo com `accessExpiresAt` no passado perde acesso a **todos** os endpoints novos.

### Task 8 — Frontend (repo `frontend/`)

**Files:** Modify `components/Sidebar.tsx` (e `lib/roles.ts`) e as páginas dos módulos abertos (`app/(platform)/courses`, `…/live-classes`, `…/enrollments`/`users` conforme o caso).

- [ ] **Step 1** Filtrar o menu para o papel `INSTRUCTOR_EXTERNO`: só Cursos (os seus), Aulas ao vivo (e as suas abas Calendário, Gravações, Material, Avaliações, Relatórios), Inscritos/Turmas. Tudo o resto escondido (o backend já recusa; o menu não deve mostrar o que dá 403).
- [ ] **Step 2** Esconder ações que o externo não tem (criar curso, criar turma, publicar gravação, definições de aulas) por papel; mostrar estado vazio claro quando não há aulas/cursos.
- [ ] **Step 3** `npx tsc --noEmit` limpo; testes vitest dos filtros de menu (`lib/roles.test.ts` já cobre `filterNavSections`); verificação manual no browser com uma conta externa real (fase 1–2).
- [ ] **Step 4: Commit** `feat(instructor-externo): menu e ações do instrutor externo`.

### Task 9 — Verificação final e revisão

- [ ] `tsc` (BE/FE), prettier no backend, unitários `src/common src/auth src/instructor-invites src/live-classes src/courses src/course-modules src/enrollments`, `test/authz`, integração em lotes: `instructor-invites`, `instructor-scope` (novo), `auth`, `users`, `courses`, `enrollment`, `live-classes`.
- [ ] Revisão independente (modelo mais capaz) com foco nos itens de Review Focus; corrigir críticos/importantes com teste primeiro.
- [ ] Atualizar a spec com o resultado final (matriz efetivamente implementada) e **só então** considerar publicar as fases 1–3.

## Decisões a confirmar antes de executar

1. **Matriz de §5** é a fonte de verdade; "avaliações" = **feedback/avaliação das aulas ao vivo** (não os quizzes de `assessments`, que ficam fechados). Confirmas?
2. **Presenças/participantes**: o externo regista presenças e participantes nas suas aulas (`attendance`, `attendance/bulk`), mas **não** publica gravações. Confirmas?
3. **Inscritos**: o externo vê nome e progresso, **sem** email/telefone/NIF. Confirmas?
4. Allowlist da Task 1 (`/auth/me`, logout, change-password, perfil próprio, marca): algo mais que o frontend precise para renderizar a conta do instrutor?

## Auto-revisão

Cobertura da matriz: cursos/módulos/lições (T3), inscritos/turmas (T4), aulas/sessões/participantes/material/calendário/gravações (T5), avaliações/relatórios (T6), barreira geral (T1), helpers (T2), RLS/ficheiros/expiração (T7), UI (T8). Nomes consistentes: `AllowExternal`, `isExternalInstructor`, `forceOwnInstructor`, `assertOwnLiveClass`, `assertCanManageCourse`.
