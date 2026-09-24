# Competencies — Fase 2: Níveis de Proficiência + Modelos de Competências

Escopo: implementar as abas **3. Níveis de Proficiência** e **4. Modelos de
Competências** de `docs/módulo_competencies.md`, sobre o módulo `competencies`
já existente (backend `src/competencies/*`, frontend
`frontend/components/competencies/*`).

Restantes abas (Matriz — já existe/só ganha filtros, Avaliações, Gaps,
Desenvolvimento, Relatórios) ficam para fases seguintes.

## Decisões de design

1. **Níveis de proficiência continuam por-competência**, não passam a ser um
   catálogo global de templates. O modelo `ProficiencyLevel` já existe
   (`competencyId`, `name`, `value` 1–5, `description`) e já é usado por
   `createProficiencyLevel`/`removeProficiencyLevel`. A "Escala proposta" do
   spec (Nível 1 Inicial … 5 Especialista) é só um preset sugerido no
   formulário de criação, não uma tabela à parte — evita duplicar o conceito
   de nível que já existe e mantém "Competências associadas" trivial (é
   sempre a própria competência dona do registo, mostrada como coluna na
   listagem da aba).
2. **`ProficiencyLevel` ganha os campos ricos do spec** (pontuação
   mín/máx, comportamentos esperados, evidências, critérios, conhecimentos
   demonstrados, autonomia, complexidade, estado) em vez de nascer um
   segundo modelo. Reaproveita `CompetencyStatus` (ACTIVE/INACTIVE/IN_REVIEW)
   para o campo `status` — mesmo enum já usado em `Competency.status`, em vez
   de um enum novo só para isto.
3. **Adiciona `updateProficiencyLevel`** — hoje só existe create/delete: a
   aba dedicada precisa de editar um nível existente sem apagar e recriar
   (perderia o histórico/relações caso viessem a existir).
4. **"Modelos de Competências" é novo** — não havia nada equivalente no
   schema. Dois modelos:
   - `CompetencyModel` — o modelo em si (nome, código, descrição, objetivo,
     tipo, departamento, família de cargo, nível hierárquico, estado, versão,
     vigência, responsável).
   - `CompetencyModelItem` — competência incluída no modelo, com peso, nível
     esperado, obrigatória/crítica. `@@unique([modelId, competencyId])`
     evita duplicar a mesma competência no mesmo modelo.
5. **`type` e `positionFamily` ficam free-text**, não enums — espelha a
   decisão já tomada para `Competency.family` na Fase 1 (mesmo padrão,
   mesma razão: os exemplos do spec — Liderança/Vendas/Logística/Indústria/
   RH — são categorias abertas definidas pelo RH, não uma lista fechada).
6. **`hierarchyLevel` reaproveita o enum `SeniorityLevel`** já existente no
   schema (`JUNIOR…C_LEVEL`, usado em `CareerRole`/outros) em vez de criar
   um enum novo equivalente.
7. **`departmentId` é opcional e único** (não `@@unique` composto) — um
   modelo pode não estar ligado a nenhum departamento (ex.: modelo
   organização-wide "Liderança").
8. **Sem nova relação Position→CompetencyModel.** O spec pede "cargo" como
   informação do modelo, mas não pede aplicar o modelo automaticamente a
   `PositionCompetency` (isso já existe via `mapToPosition`, é fluxo
   distinto). `positionFamily` é só descritivo nesta fase.

## Schema (Prisma)

```prisma
model ProficiencyLevel {
  id                     Int              @id @default(autoincrement())
  competencyId           Int
  name                   String
  value                  Int
  description            String?
  code                   String?
  minScore               Int?
  maxScore               Int?
  expectedBehaviors      String?          @db.Text
  knowledgeDemonstrated  String?          @db.Text
  autonomy               String?
  taskComplexity         String?
  observableEvidence     String?          @db.Text
  evaluationCriteria     String?          @db.Text
  status                 CompetencyStatus @default(ACTIVE)
  competency             Competency       @relation(fields: [competencyId], references: [id], onDelete: Cascade)

  @@unique([competencyId, value])
}

model CompetencyModel {
  id             Int                   @id @default(autoincrement())
  name           String
  code           String?               @unique
  description    String?
  objective      String?
  type           String?
  departmentId   Int?
  positionFamily String?
  hierarchyLevel SeniorityLevel?
  status         CompetencyStatus      @default(ACTIVE)
  version        Int                   @default(1)
  effectiveDate  DateTime?
  endDate        DateTime?
  ownerId        Int?
  department     Department?           @relation(fields: [departmentId], references: [id])
  owner          User?                 @relation("CompetencyModelOwner", fields: [ownerId], references: [id])
  items          CompetencyModelItem[]
  createdAt      DateTime              @default(now())
  updatedAt      DateTime              @updatedAt
}

model CompetencyModelItem {
  id            Int             @id @default(autoincrement())
  modelId       Int
  competencyId  Int
  weight        Float           @default(1)
  expectedLevel Int
  isMandatory   Boolean         @default(false)
  isCritical    Boolean         @default(false)
  model         CompetencyModel @relation(fields: [modelId], references: [id], onDelete: Cascade)
  competency    Competency      @relation(fields: [competencyId], references: [id])

  @@unique([modelId, competencyId])
}
```

`Competency` ganha `modelItems CompetencyModelItem[]`; `Department` ganha
`competencyModels CompetencyModel[]`; `User` ganha
`ownedCompetencyModels CompetencyModel[] @relation("CompetencyModelOwner")`.

## Backend

- `competencies.dto.ts`:
  - `CreateProficiencyLevelDto` ganha os novos campos (todos opcionais salvo
    os já existentes).
  - Novo `UpdateProficiencyLevelDto` (`PartialType`, omite `competencyId` —
    não se move um nível para outra competência, apaga-se e recria-se).
  - Novos `CreateCompetencyModelDto`, `UpdateCompetencyModelDto`
    (`PartialType`), `CompetencyModelFilterDto` (paginação + `search`,
    `departmentId`, `status`), `UpsertCompetencyModelItemDto`
    (`modelId`, `competencyId`, `weight?`, `expectedLevel`, `isMandatory?`,
    `isCritical?`).
- `competencies.service.ts`:
  - `updateProficiencyLevel(levelId, dto)`.
  - CRUD de `CompetencyModel`: `findAllModels`, `findOneModel` (com `items`
    incluindo `competency`), `createModel` (valida unicidade de `code` como
    já se faz em `create`/`update` de `Competency`), `updateModel`,
    `removeModel` (bloqueia se tiver `items`, mesmo padrão de `remove` de
    Competency bloquear se tiver `userCompetencies`).
  - `upsertModelItem` / `removeModelItem` — find-then-write sobre
    `@@unique([modelId, competencyId])`, mesmo padrão de `mapToPosition`.
- `competencies.controller.ts`:
  - `PATCH /competencies/proficiency-levels/:levelId`, `@Roles(ADMIN, RH)`.
  - `GET/POST /competencies/models`, `GET/PUT/DELETE
    /competencies/models/:id`, `@Roles(ADMIN, RH)` para escrita, sem
    restrição para leitura (mesmo nível de acesso do catálogo principal —
    RH/Admin gerem, todos podem consultar para saber o que se espera do seu
    cargo).
  - `POST /competencies/models/:modelId/items`,
    `DELETE /competencies/models/:modelId/items/:competencyId`,
    `@Roles(ADMIN, RH)`.
  - Rotas `models`/`models/:id` registadas antes de `GET :id` do catálogo
    geral só se necessário — não colidem porque têm prefixo `models` (Nest
    já resolve `:id` de `competencies/:id` vs literal `competencies/models`
    correctamente desde que `models` não seja um id numérico válido, mas
    mantemos a convenção do ficheiro de registar rotas literais antes de
    `:id` por clareza, tal como `overview`/`top`/`skill-matrix`).

## Frontend

- `types.ts`: `ProficiencyLevel` ganha os novos campos; novos tipos
  `CompetencyModel`, `CompetencyModelItem`, `CompetencyModelDetail`.
- `constants.ts`:
  - `NAV` ganha `{ id: 'levels', label: 'Níveis de Proficiência',
    roles: NON_COLABORADOR_ROLES }` e `{ id: 'models', label: 'Modelos de
    Competências', roles: NON_COLABORADOR_ROLES }`, inseridos depois de
    `catalog` (ordem do spec: Visão Geral, Competências, Níveis, Modelos,
    Matriz…).
  - `TITLES` ganha `levels`/`models`.
  - `PROFICIENCY_SCALE_PRESET` — os 5 nomes/descrições sugeridos
    (Inicial…Especialista), usados só para pré-preencher o formulário de
    criação de nível, não persistidos como tabela.
- Novo `frontend/components/competencies/LevelsView.tsx`:
  - Lista todos os `ProficiencyLevel` (via novo `GET
    /competencies/proficiency-levels` — falta no backend actual, que só tem
    create/delete; adicionar `findAllProficiencyLevels` com filtro opcional
    `competencyId`/`search`, reaproveitando o padrão de paginação de
    `findAll`), agrupados por competência.
  - Modal de criação/edição com os campos novos; botão "usar escala
    proposta" aplica o preset aos 5 níveis de uma competência de uma vez
    (cria os que faltarem via chamadas sequenciais ao POST existente).
- Novo `frontend/components/competencies/ModelsView.tsx`:
  - Lista `CompetencyModel` (cards, como `CatalogView`), com filtro por
    departamento/estado.
  - Modal de criação/edição com os campos do modelo + gestor de itens
    (adicionar/remover competência com peso e nível esperado) — mesmo
    padrão de picker de utilizador reaproveitado na Fase 1 para o
    `ownerId`.
  - Modal de detalhe em modo leitura.
- `app/(platform)/competencies/page.tsx`: renderiza `LevelsView`/`ModelsView`
  para `view === 'levels' | 'models'`.

## Fora de escopo

- Aplicar automaticamente os itens de um `CompetencyModel` a
  `PositionCompetency` (ficaria para quando a aba Matriz/Gaps consumir
  modelos directamente).
- Enum fechado para `type` de modelo.
- Qualquer UI/schema das abas 5–9 (Matriz-filtros à parte, Avaliações,
  Gaps, Desenvolvimento, Relatórios).

## Testes

Specs unitárias (`*.spec.ts`) para o novo código do service/controller,
mocks de `PrismaService`, mesmo padrão do módulo. Correm no fim da
implementação (ao contrário da Fase 1, aqui não há instrução para os saltar).
