# Competencies — Fase 1: Visão Geral + Competências

Escopo: implementar as duas primeiras abas da estrutura final descrita em
`docs/módulo_competencies.md` — **1. Visão Geral** e **2. Competências** —
reaproveitando o módulo `competencies` já existente (backend
`src/competencies/*`, frontend `frontend/components/competencies/*`).

As restantes abas do spec (Níveis de Proficiência, Modelos, Matriz,
Avaliações, Gaps, Desenvolvimento, Relatórios) ficam para fases seguintes,
cada uma com o seu próprio ciclo de design/plano.

## Decisões já tomadas (aprovadas pelo utilizador)

1. **Abas antigas mantidas por agora.** "Dashboard RH" e "Mapa de
   Competências" continuam nas abas principais nesta fase — só serão
   removidas quando as abas de substituição (Gaps, Relatórios) existirem
   numa fase futura. `DashboardView.tsx` e `CompetencyMapView.tsx`
   não são tocados.
2. **Formulário "Nova Competência" — só Geral + Configuração nesta fase.**
   As secções "Aplicabilidade" (unidade/departamentos/cargos/funções/níveis
   hierárquicos/grupos) e "Critérios"/"Desenvolvimento" ficam para quando as
   abas Modelos/Matriz/Desenvolvimento existirem — nesta fase o catálogo não
   ganha campos de aplicabilidade nem de critérios/desenvolvimento.

## Schema (Prisma)

Nova migration sobre o modelo `Competency`:

```prisma
model Competency {
  // ...campos existentes inalterados...
  code           String?  @unique
  family         String?
  objective      String?
  isCritical     Boolean  @default(false)
  isStrategic    Boolean  @default(false)
  isMandatory    Boolean  @default(false)
  isAssessable   Boolean  @default(true)
  isDevelopable  Boolean  @default(true)
  ownerId        Int?
  owner          User?    @relation(fields: [ownerId], references: [id])
}

enum CompetencyCategory {
  HARD_SKILL
  SOFT_SKILL
  LANGUAGE
  TOOL
  LEADERSHIP
  FUNCTIONAL   // novo — "Competências funcionais" do tab 1/2
}

enum CompetencyStatus {
  ACTIVE
  INACTIVE
  IN_REVIEW    // novo — "Competências em revisão" do tab 1
}
```

Notas de mapeamento (por que não se criam mais enums/tabelas):

- **"Competências estratégicas"** (tab 1) e o campo booleano "Competência
  estratégica" (tab 2, secção Configuração) são o mesmo conceito: contam-se
  via `isStrategic = true`, não é um valor de categoria.
- **"Competências por área"** (tab 1) reaproveita a dimensão `category` já
  existente — a UI atual (`CATEGORY_CFG`) já rotula `HARD_SKILL` como
  "Competências Técnicas" e `SOFT_SKILL` como "Competências
  Comportamentais", coincidindo com a terminologia do spec.
- `code` é `@unique` mas opcional — múltiplos `NULL` são permitidos pelo
  Postgres, não colide com o histórico de `User.employeeNumber`
  ([[project_innova_empty_string_unique_collision]] foi causado por `""`,
  não por `NULL` — aqui o campo fica sempre `undefined`/omitido, nunca
  `""`, quando não preenchido).

## Backend

- `src/competencies/competencies.dto.ts`:
  - `CreateCompetencyDto`/`UpdateCompetencyDto` (via `PartialType`) ganham:
    `code?`, `family?`, `objective?`, `isCritical?`, `isStrategic?`,
    `isMandatory?`, `isAssessable?`, `isDevelopable?`, `ownerId?` (todos
    opcionais, `@IsOptional()`).
  - `CompetencyFilterDto` ganha `isCritical?: boolean` e
    `isStrategic?: boolean` (com `@Type(() => Boolean)` +
    `@Transform`, mesmo padrão do
    [[project_innova_boolean_query_filter_coercion]]).
- `src/competencies/competencies.service.ts`:
  - `create`/`update` passam os novos campos ao Prisma sem transformação
    especial.
  - `findAll` inclui `owner: { select: { id: true, fullName: true } }` no
    `select`/`include` e devolve `code`, `family`, `isCritical`,
    `isStrategic` (já vêm por default ao não restringir `select`, mas o
    `include` de `owner` precisa ser acrescentado explicitamente).
  - Novo método `getOverview()`:
    - Contagens por `category` (técnica/comportamental/liderança/funcional
      + idioma/ferramenta ficam de fora dos KPIs nomeados no spec, mas
      continuam a existir como categorias no catálogo).
    - Contagens `isCritical`, `isStrategic`, `status=ACTIVE`,
      `status=IN_REVIEW`.
    - Média global de proficiência: `avg(UserCompetency.currentLevel)`
      sobre toda a organização.
    - Maior lacuna / alertas críticas: extrai a lógica de cálculo de gap já
      usada em `getOrgGapDashboard` (linhas ~630+), mas sem filtro de
      `departmentId` — top N competências por `gapsCount`, cruzado com
      `isCritical` para os "alertas".
    - Mais avaliadas / top competências: reaproveita `getTopCompetencies`.
    - Colaboradores avaliados: contagem de `userId` distintos em
      `UserCompetency`.
    - **"Avaliações pendentes" — gap conhecido, não fabricado.** Este KPI
      depende do tab 6 (Avaliações), que ainda não existe neste módulo.
      `getOverview()` devolve `pendingEvaluations: null` com um comentário a
      apontar para essa fase futura — a UI trata `null` como "—", nunca
      como `0` (0 seria uma afirmação factual falsa).
- `src/competencies/competencies.controller.ts`:
  - `GET /competencies/overview`, `@Roles(ADMIN, RH, GESTOR)` (mesmo nível
    de acesso de `dashboard/gaps` e `skill-matrix`), chama `svc.getOverview()`.
    Registado **antes** de `GET :id` para não colidir com o parâmetro de
    rota (mesmo padrão de `top`/`skill-matrix`/`dashboard/gaps` já
    existentes no ficheiro).

## Frontend

- `frontend/components/competencies/types.ts`:
  - `Competency`/`CompetencyDetail` ganham `code?`, `family?`, `objective?`,
    `isCritical`, `isStrategic`, `isMandatory`, `isAssessable`,
    `isDevelopable`, `owner?: { id: number; fullName: string } | null`.
  - Novo tipo `CompetencyOverview` espelhando a resposta de
    `getOverview()`.
- `frontend/components/competencies/constants.ts`:
  - `CATEGORY_CFG` ganha `FUNCTIONAL: { label: 'Competências Funcionais', ... }`.
  - Novo `STATUS_CFG`-like para `IN_REVIEW` → "Em revisão" onde já existir
    rotulagem de estado (hoje o estado só aparece como badge "Arquivada" ad
    hoc em `CatalogView.tsx` — ver se compensa extrair um `StatusBadgeMap`
    dedicado ou manter inline; decisão de implementação, não de design).
  - `NAV` ganha `{ id: 'overview', label: 'Visão Geral' }` como primeira
    entrada (antes de `catalog`), sem restrição de `roles` adicional além
    do que já existe.
  - `TITLES` ganha `overview: 'Visão Geral de Competências'`.
  - Label da entrada `catalog` passa de "Catálogo" para "Competências"
    (spec usa esse nome para o tab); o `id: 'catalog'` interno mantém-se
    para minimizar churn em queries/testes existentes.
- Novo `frontend/components/competencies/OverviewView.tsx`:
  - Consome `GET /competencies/overview` via `useApiQuery`.
  - Grid de `KpiCard` com os totais (geral, por categoria, críticas,
    estratégicas, ativas, em revisão, colaboradores avaliados, média
    global de proficiência).
  - Lista "Competências com maior lacuna" e "Alertas de competências
    críticas" (mesmo padrão visual de `DashboardView.tsx` — barra de
    progresso + texto de severidade, não recoloração).
  - Lista "Top competências" (reaproveita a mesma renderização já usada em
    `DashboardView.tsx` para `top`, extraída ou duplicada — decisão de
    implementação).
  - KPI "Avaliações pendentes" mostra "—" quando a API devolve `null`.
- `frontend/components/competencies/CatalogView.tsx`:
  - Cartões passam a mostrar `code` (se existir), `family` (se existir),
    badge "Crítica" quando `isCritical`, badge "Estratégica" quando
    `isStrategic`, e o nome do responsável (`owner.fullName`) quando
    existir.
- `frontend/components/competencies/CompetencyFormModal.tsx`:
  - Acrescenta campos: Código, Família, Objetivo (textarea curto),
    Crítica (switch/checkbox), Estratégica (switch/checkbox), Obrigatória
    (switch/checkbox), Avaliável (switch/checkbox, default true),
    Desenvolvível (switch/checkbox, default true), Responsável (picker de
    utilizador — reaproveitar o combobox de pesquisa de utilizador já usado
    noutro módulo, ex.: atribuição de PDI/onboarding, em vez de criar um
    novo).
- `frontend/components/competencies/CompetencyDetailModal.tsx`:
  - Mostra os mesmos novos campos em modo leitura.
- `frontend/app/(platform)/competencies/page.tsx`:
  - Passa a renderizar `OverviewView` quando `view === 'overview'`.

## Fora de escopo (fica para fases seguintes)

- Aplicabilidade (unidade/departamentos/cargos/funções/níveis
  hierárquicos/grupos) no catálogo e no formulário.
- Critérios (indicadores comportamentais/evidências/comportamentos
  esperados/exemplos) e Desenvolvimento (formações/cursos/conteúdos/
  atividades relacionadas) no formulário — `CompetencyIndicator` já
  existe no schema e continua a ser usado apenas onde já está (avaliação
  360°), sem expansão nesta fase.
- Remoção de "Dashboard RH"/"Mapa de Competências" das abas principais.
- Qualquer schema/UI para as abas 3–9 do spec (Níveis, Modelos, Matriz,
  Avaliações, Gaps, Desenvolvimento, Relatórios).

## Testes

Seguem o padrão do módulo (specs unitárias em `*.spec.ts` para o service e
controller, mocks de `PrismaService`). Por instrução explícita do
utilizador nesta sessão, **os testes não são executados** (`jest`/`vitest`)
até ele pedir — apenas escritos/atualizados junto com o código.
