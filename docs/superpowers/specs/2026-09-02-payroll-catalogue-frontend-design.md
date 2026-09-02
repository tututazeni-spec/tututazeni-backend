# Catálogo salarial — frontend admin (sub-projeto B da Phase 5)

> Design validado. Sub-projeto B de 4 da camada de frontend do payroll workflow.
> A = "A minha compensação" (ESS) — FEITO, frontend PR #393.
> B = este documento. C = workflow de payroll runs. D = gestão de recibos admin.

## Contexto

O backend `feat/payroll-workflow` (25 commits, verificado na Phase 6: integração
verde, `tsc` verde) entregou o motor de payroll, a máquina de estados do
`PayrollRun`, o catálogo salarial (`SalaryComponent`, `EmployeeCompensation`
efetivo-datada) e o endpoint ESS `GET /payslips/my/compensation`. **Nada disto
tem UI de administração.** Este sub-projeto entrega a UI admin (ADMIN/RH) do
catálogo salarial: gerir componentes salariais e a compensação efetivo-datada
dos colaboradores.

Não é módulo novo nem rota nova — são **duas abas admin-only acrescentadas ao
módulo `/payslips` existente** (que hoje é só self-service do colaborador),
usando o padrão `adminOnly` já estabelecido em `courses`.

### Repositórios

- **backend** (NestJS, `innova/`) — `main` protegido, PR + CI `quality` obrigatório.
- **frontend** (`innova/frontend/`, repo git separado `tututazeni-frontend`) —
  CI `quality.yml` job `build`: `npm run lint` + `npm test` (vitest) +
  `npm run build`. Sem gate de prettier nem de `tsc`.

## Contrato do backend (já existente em `feat/payroll-workflow`)

### `payroll/components` — `SalaryComponentController`, `@Roles(ADMIN, RH)`

| Rota | Semântica |
|---|---|
| `GET /payroll/components` | Filtros `type` (EARNING\|DEDUCTION), `active` (bool), `countryCode`. Devolve **array simples** (não paginado), `orderBy order asc`. |
| `POST /payroll/components` | Criar. |
| `GET /payroll/components/:code` | Detalhe (404 limpo). |
| `PUT /payroll/components/:code` | Actualizar (body sem `code`, **sem `active`**). |
| `DELETE /payroll/components/:code` | Soft-delete (`active=false`) se referenciado por `employeeCompensationComponent` ou `payslipItem`; senão hard-delete. Devolve a linha. |

`SalaryComponent` (schema): `code` (PK, imutável), `name`, `description?`,
`type: ComponentType` (EARNING\|DEDUCTION), `calcType: ComponentCalcType`
(FIXED\|PERCENT\|FORMULA\|TABLE), `fixedValue?`, `rate?`, `formula?`,
`isTaxable` (def true), `isMandatory` (def false), `order` (def 0),
`active` (def true), `countryCode?`, timestamps.

`CreateSalaryComponentDto`: `fixedValue` obrigatório sse `calcType=FIXED`,
`rate` sse `PERCENT`, `formula` sse `FORMULA` (via `@ValidateIf`). `TABLE` não
tem campo de valor obrigatório. `UpdateSalaryComponentDto = PartialType(OmitType(Create, ['code']))`
→ **não tem `active`** → um componente desactivado **não pode ser reactivado
pela API**. Decisão: aceitar a limitação (componentes inactivos ficam só-leitura
na UI).

### `payroll/compensation` — `EmployeeCompensationController`, `@Roles(ADMIN, RH)`

| Rota | Semântica |
|---|---|
| `GET /payroll/compensation?userId=` | **Histórico** de um colaborador (array `desc effectiveFrom`, inclui `components`). `userId` obrigatório (ParseIntPipe → 400). |
| `GET /payroll/compensation/current/:userId` | Registo activo (`effectiveTo: null`) ou `null`. Inclui `components`. IBAN **em claro** (só `myCompensation` mascara). |
| `POST /payroll/compensation` | Cria registo efetivo-datado; **fecha o anterior** (`effectiveTo = effectiveFrom − 1s`). |
| `PUT /payroll/compensation/:id` | Corrige um registo específico no lugar (body sem `userId`). |
| `POST /payroll/compensation/:id/components` | **Substitui integralmente** a lista de overrides: `{ items: [{ componentCode, value, override? }] }`. Devolve a nova lista. |

`EmployeeCompensation` (schema): `id`, `userId`, `baseSalary` (Float, ≥0),
`countryCode?` (def "AO"), `bankName?`, `iban?`, `accountNumber?`,
`effectiveFrom` (def now), `effectiveTo?`, `foodAllowance?`,
`transportAllowance?`, `components: EmployeeCompensationComponent[]`.
`EmployeeCompensationComponent`: `id`, `compensationId`, `componentCode`,
`value` (Float), `override` (def false).

**Não existe endpoint de lista global de compensações.** Decisão: adicioná-lo
(B-1) para alimentar uma tabela global.

## Secção A — Endpoint novo (PR B-1, backend)

**`GET /payroll/compensation/all`** em `EmployeeCompensationController`
(já `@Roles(ADMIN, RH)`), colocado logo a seguir a `@Get()`. Sem risco de
route-shadowing — `all`, `current/:userId`, `:id` são literais distintos e não
há `@Get(':x')` na raiz.

### DTO (novo em `payroll.dto.ts`)

```ts
export class CompensationListFilterDto extends BaseFilterDto {   // page, limit
  @IsOptional() @IsString()                      search?: string;
  @IsOptional() @IsInt() @Type(() => Number)     departmentId?: number;
  @IsOptional() @IsString()                      countryCode?: string;
}
```

### Serviço — `EmployeeCompensationService.listAll(filter)`

- `where: { effectiveTo: null }` (só registos activos, um por colaborador).
- filtro `user` construído uma vez: `departmentId` → `where.user.departmentId`;
  `search` → `where.user.OR = [{ fullName: { contains, mode: 'insensitive' } },
  { employeeNumber: { contains, mode: 'insensitive' } }]` (combinam-se no mesmo
  objecto `user` quando ambos presentes).
- `countryCode` → `where.countryCode`.
- `orderBy: { user: { fullName: 'asc' } }`, `skip`/`take` via `calculatePagination`.
- `include`: `user: { select: { id, fullName, employeeNumber,
  department: { select: { id, name } } } }` + `_count: { select: { components: true } }`.
- **`bankName`/`iban` não são seleccionados** — desnecessários numa tabela; o
  detalhe (`current/:userId`) já os devolve a ADMIN/RH.
- devolve `buildPaginatedResponse(data, total, page, limit)` →
  `{ data, meta: { total, page, limit, totalPages } }`.

### Controlador

```ts
@Get('all')
@ApiOperation({ summary: 'Listar colaboradores com compensação activa (paginado)' })
listAll(@Query() filter: CompensationListFilterDto) {
  return this.service.listAll(filter);
}
```

### Integração (estende `test/integration/payroll/payroll-catalogue.integration-spec.ts`)

- ADMIN & RH → 200; COLABORADOR → 403.
- colaborador com um registo fechado + um activo → a lista devolve exactamente
  1 linha (a activa).
- `search` estreita por `fullName` e por `employeeNumber`; `departmentId` filtra.
- forma da resposta: chaves de `meta` presentes; cada linha tem
  `user.department` + `_count.components`; **sem** chave `iban`/`bankName`.

### Item em aberto

Opcional: acrescentar `include: { user: {...} }` ao endpoint `history`
(`GET /payroll/compensation?userId=`) para o `CompensationDetailView` não ter
de fazer um `GET /users/:id` só para o cabeçalho. Decidir em B-1.

## Secção B — Estrutura no frontend (PR B-2 + B-3)

Sem rota nova, sem entrada na sidebar. Duas abas admin-only em `/payslips`,
padrão `adminOnly` idêntico ao de `courses`.

### `app/(platform)/payslips/page.tsx` (alteração entra em B-2)

- `const { data: me } = useCurrentUser();`
  `const role = me?.role?.name as Role | undefined;`
  `const isAdmin = !!role && ADMIN_ROLES.includes(role);` (`ADMIN_ROLES = ['ADMIN','RH']`, espelha `@Roles`).
- `const visibleNav = isAdmin ? NAV : NAV.filter(n => !n.adminOnly);`
- cada view nova protegida `&& isAdmin` (defesa em profundidade; o backend
  também impõe).
- wrapper continua `max-w-4xl`; a tabela larga de compensações leva o seu
  próprio contentor `overflow-x-auto`.

### `components/payslips/constants.ts`

- tipo do item de `NAV` ganha `adminOnly?: boolean`.
- acrescentar `{ id: 'components', label: 'Componentes', adminOnly: true }` (B-2)
  e `{ id: 'compensations', label: 'Compensações', adminOnly: true }` (B-3).
- entradas em `TITLES` para `components`, `compensations`, `comp-detail`.

### `components/payslips/types.ts` — união `View` estendida

```ts
type View = … | 'components' | 'compensations' | 'comp-detail';
type Nav =
  | { view: Exclude<View, 'detail' | 'comp-detail'> }
  | { view: 'detail'; selectedId: number }
  | { view: 'comp-detail'; userId: number };   // detalhe de compensação é por colaborador
```

### Ficheiros novos

| B-2 (Componentes) | B-3 (Compensações) |
|---|---|
| `ComponentsView.tsx` + `.test.tsx` | `CompensationsView.tsx` + `.test.tsx` |
| `ComponentFormModal.tsx` + `.test.tsx` | `CompensationDetailView.tsx` + `.test.tsx` |
| | `CompensationFormModal.tsx` + `.test.tsx` |
| | `CompensationComponentsEditor.tsx` + `.test.tsx` |

### `lib/queryKeys.ts`

Acrescentar sob `payslips` (todas como funções, convenção do ficheiro):
`salaryComponents(filter)`, `compensationList(filter)`, `compensationHistory(userId)`.

## Secção C — Aba Componentes (PR B-2)

### `ComponentsView.tsx`

`useApiQuery<SalaryComponent[]>(queryKeys.payslips.salaryComponents(filter),
'/payroll/components', { params: filter })`. Array simples (~10–15 linhas).

- **Toolbar:** `Select` tipo (Todos / Rendimento=EARNING / Desconto=DEDUCTION) ·
  `Select` estado (Activos [omissão → `active=true`] / Todos [omitir] /
  Inactivos [`active=false`]) · `Button` "+ Novo componente".
- **Tabela:** Código (mono) · Nome (+ `description` em texto esbatido) ·
  Tipo (`StatusBadge`) · Cálculo (humano: `FIXED → fmtKz(fixedValue)`,
  `PERCENT → taxa`, `FORMULA` com a fórmula em mono, `TABLE`) · Flags (chips:
  Tributável / Obrigatório) · Ordem · badge `Inactivo` + linha esbatida quando
  `!active` · acções: Editar, Remover.
- `Skeleton` / `EmptyState`.

### `ComponentFormModal.tsx`

Props `component?: SalaryComponent | null` (null → criar), `onClose`. Modelado
em `CompetencyFormModal` / `TemplateFormModal` (modal só monta quando aberto).

- **Código** `Input` — só em criar; imutável/oculto em editar; maiúsculas,
  obrigatório. Ajuda: "identificador único, imutável (ex.: BASE, TRANSPORT)".
- **Nome** (obrigatório) · **Descrição** `Textarea` · **Tipo** `Select`
  EARNING/DEDUCTION (obrigatório) · **Tipo de cálculo** `Select`
  FIXED/PERCENT/FORMULA/TABLE (obrigatório).
- **Campo de valor condicional** ao `calcType`: FIXED → "Valor fixo (Kz)" ·
  PERCENT → "Taxa" · FORMULA → "Fórmula" · TABLE → nenhum (ajuda: "os escalões
  são geridos na configuração do país"). Validação no cliente espelha o
  `@ValidateIf`: submissão bloqueada com erro inline (`AlertCircle`) se o campo
  obrigatório do `calcType` escolhido estiver vazio.
- **Tributável** (omissão ligado) · **Obrigatório** (omissão desligado) ·
  **Ordem** número (omissão 0) · **País** `Input` (omissão "AO").
- criar → `apiClient.post('/payroll/components', body)` · editar →
  `apiClient.put('/payroll/components/${code}', body)` (body sem `code`) →
  invalidar `queryKeys.payslips.all` + toast + `onClose()`.

### Remoção

`IconButton` lixo → `useConfirm()` explicando soft-vs-hard ("se já estiver em
uso em compensações ou recibos, é apenas **desactivado** — deixa de estar
disponível para novos usos mas mantém o histórico; caso contrário, é removido
definitivamente") → `apiClient.delete('/payroll/components/${code}')` →
invalidar + toast que reflecte o `active` da linha devolvida (desactivado vs
removido).

### A verificar na implementação

- `rate` é fracção (`0.1`) ou percentagem (`10`)? Confirmar em
  `payroll-engine.service.ts` antes de rotular o campo e formatar a coluna.
- `code` duplicado ao criar → provavelmente **500**, não 409 (não há filtro
  P2002→409 neste repo — ver `project_innova_empty_string_unique_collision`).
  Mostrar o erro do servidor tal como vem; não dá para pré-validar sem a lista.

### Testes

- `ComponentsView.test.tsx`: linhas (código/nome/badge de tipo); `calcType`
  renderizado por tipo; badge `Inactivo`; filtros tipo/estado; array vazio →
  `EmptyState`; "+ Novo componente" abre o modal (stub).
- `ComponentFormModal.test.tsx`: modo criar (campo código presente/editável) vs
  editar (código ausente/desativado, campos preenchidos); mudar `calcType` troca
  o campo condicional; submissão bloqueada com condicional obrigatório vazio;
  criar válido → POST a `/payroll/components` com o body esperado; editar válido
  → PUT a `/payroll/components/:code`, body sem `code`.

## Secção D — Aba Compensações (PR B-3)

### `CompensationsView.tsx` — tabela global

`useApiQuery<Paginated<CompensationListRow>>(compensationList(params),
'/payroll/compensation/all', { params, placeholderData: keepPreviousData })`.

- Toolbar: `Input` de pesquisa com debounce (nome/employeeNumber). `Select`
  departamento só se já existir um hook de departamentos pronto — senão, só
  pesquisa em v1 (anotado).
- Colunas: Colaborador (nome + employeeNumber esbatido) · Departamento
  (`user.department?.name ?? '—'`) · Salário base (`fmtKz`) ·
  Subs. alimentação · Subs. transporte · Em vigor desde
  (`formatDate(effectiveFrom)`) · Nº componentes (`_count.components`). Clique na
  linha → `setNav({ view: 'comp-detail', userId: row.userId })`.
- `Pagination` (componente existe) · `Skeleton` · `EmptyState` ("Nenhum
  colaborador com compensação registada" + dica de que os registos se criam a
  partir do detalhe de um colaborador).
- **"+ Nova compensação"** → `CompensationFormModal` modo criar **sem `userId`**
  → o modal começa com pesquisa de colaborador (`/users?search=`). É o único
  caminho de entrada para um colaborador sem registos (que não aparece em `/all`).

### `CompensationDetailView.tsx` (props `userId`, `onBack`)

- Uma query: `GET /payroll/compensation?userId=` (histórico, inclui
  `components`); deriva `current = history.find(r => r.effectiveTo === null)` no
  cliente.
- Cabeçalho: identidade do colaborador via `GET /users/${userId}` leve
  (nome/employeeNumber/departamento); fallback `#${userId}`. (Ou, se B-1
  acrescentar `include: { user }` ao `history`, usar isso.)
- **Cartão do registo activo**: `baseSalary`, subsídios, `bankName`, **IBAN em
  claro** (espelha o `current/:userId` existente, que o devolve sem máscara a
  ADMIN/RH), `accountNumber`, `countryCode`, "em vigor desde …". Acções:
  **Corrigir registo** (modal editar, `id=current.id`) · **Gerir componentes**
  (editor de overrides) · **Nova versão** (modal criar, `userId` fixo). Sem
  registo activo → aviso + CTA **Criar compensação**.
- **Linha do tempo (histórico)**: linhas `desc effectiveFrom`, intervalo
  `effectiveFrom → effectiveTo | "actual"`, `baseSalary`, nº componentes, badge
  "Activo" na aberta. Só-leitura; cada linha expansível para mostrar os
  `components` desse registo. ("Corrigir" só é oferecido no registo activo em
  v1 — anotado.)

### `CompensationFormModal.tsx` (props `mode`, `record?`, `userId?`, `onClose`)

- criar sem `userId` → campo de pesquisa de colaborador (obrigatório); criar com
  `userId` → colaborador só-leitura; editar → sem campo de colaborador, `id` de
  `record`.
- Campos: **Salário base (Kz)** (obrigatório, ≥0) · **Subsídio de alimentação**
  · **Subsídio de transporte** · **Banco** · **IBAN** · **Nº de conta** ·
  **País** (omissão "AO") · **Em vigor desde** data (criar: omissão hoje, ajuda
  "a versão anterior é fechada automaticamente"; editar: editável).
- criar → `apiClient.post('/payroll/compensation', body)` · editar →
  `apiClient.put('/payroll/compensation/${record.id}', body)` (body sem
  `userId`) → invalidar `queryKeys.payslips.all` + toast + `onClose()`.
- modo editar: banner de aviso "corrige este registo no lugar — não cria uma
  nova versão nem mexe no histórico; para uma mudança salarial com data, usa
  'Nova versão'".

### `CompensationComponentsEditor.tsx` (props `record`, `onClose`)

- carrega `GET /payroll/components?active=true` para o dropdown de códigos +
  rótulos.
- lista editável de linhas: `Select` `componentCode` (do catálogo, rotulado
  EARNING/DEDUCTION) · `Input` valor (número) · checkbox `override` (ajuda em
  tooltip) · remover linha. "+ Adicionar linha".
- Guardar → `apiClient.post('/payroll/compensation/${id}/components',
  { items })` — substituição integral no backend → invalidar + toast + fechar.
- validação: sem `componentCode` duplicado; valor obrigatório por linha.

### A verificar na implementação

- Significado exacto de `override` (`payroll-calculation.service.ts:180` +
  motor) para redigir o tooltip.
- Confirmar que o IBAN em claro para admin neste cartão é intencional (os
  endpoints existentes fazem-no).

### Testes

Um `.test.tsx` por componente:
- `CompensationsView.test.tsx`: linhas (nome, dept, salário base, effectiveFrom,
  nº componentes); pesquisa actualiza params; paginação; estado vazio; clique na
  linha → detalhe; "+ Nova compensação" abre o modal com pesquisa de colaborador.
- `CompensationDetailView.test.tsx`: valores do cartão activo + IBAN em claro;
  linha do tempo com badge "Activo" + intervalos fechados; "sem registo activo"
  → CTA de criação; botões de acção abrem os modais certos (stubbed).
- `CompensationFormModal.test.tsx`: criar-da-toolbar mostra pesquisa de
  colaborador; criar-do-detalhe mostra colaborador fixo; editar mostra banner de
  aviso + sem campo de colaborador; salário base obrigatório; body POST vs PUT
  correcto (PUT sem `userId`).
- `CompensationComponentsEditor.test.tsx`: renderiza overrides existentes;
  adicionar/remover linha; bloqueia código duplicado / valor vazio; Guardar faz
  POST do array `items` completo a `:id/components`.

## Secção E — Testes & verificação

### PR B-1 (backend)

- Casos de integração da Secção A em `payroll-catalogue.integration-spec.ts`.
  Execução focada: `npx cross-env NODE_ENV=test node node_modules/jest/bin/jest.js
  --config test/jest-integration.json --forceExit --runInBand --testPathPatterns
  "test/integration/payroll/"` (precisa de Redis + Postgres de teste).
- Re-correr specs unitários do payroll (`jest --testPathPatterns "src/payslips/"`)
  — `payroll.dto.ts` ganha uma classe.
- `tsc --noEmit` exit 0.
- branch → PR → **esperar CI `quality` verde** (`main` do backend protegido,
  regra 15 do CLAUDE.md) → squash-merge.

### PR B-2 / B-3 (frontend) — TDD por componente

- Escrever cada `.test.tsx` a vermelho primeiro, depois implementar a verde.
  Mock de módulo a `useApiQuery`/`useApiMutation`; `vi.mock` a modais/editores
  filhos como stubs; mock de `Select`/`Combobox` como `<select>` nativo (padrão
  existente).
- Correcções de bugs a meio da implementação levam o ciclo red-green completo.
- Gates por PR = exactamente o que o CI `quality` corre: `npm run lint` (0
  erros), `npm test` (vitest completo), `npm run build`; + `npx tsc --noEmit`
  local.
- prettier: `--write` **só nos ficheiros novos**; nunca reformatar os
  pré-existentes (falsos positivos de CRLF), como no sub-projeto A.

### Smoke manual no browser (por PR de frontend; precisa de backend + frontend a
correr + seed)

- B-2: ADMIN/RH vê a aba "Componentes", COLABORADOR não; criar um componente por
  `calcType`, editar, apagar um referenciado (→ desactivado) e um não
  referenciado (→ removido).
- B-3: a tabela carrega + pesquisa + paginação; abrir um colaborador →
  histórico/activo; "Nova versão" cria e fecha o anterior (visível na linha do
  tempo); "Corrigir" edita no lugar; "Gerir componentes" persiste overrides;
  "+ Nova compensação" → pesquisa de colaborador → primeiro registo de um
  colaborador novo.

### Sem gate de cobertura %

Em nenhum dos CIs. O critério é "cada componente/método de serviço novo tem um
teste colocado que exercita os seus ramos reais".

### Verificação cross-repo final (depois dos 3 merged)

Pull dos dois repos para `main`, re-correr o batch de payroll do backend + a
suite completa do frontend, confirmar verde — espelha a Phase 6.

## Secção F — Sequenciamento

```
B-0 ─┬─► B-1 ─┐
     └─► B-2 ─┴─► B-3
```

| Passo | Repo | Branch | Conteúdo | Gate antes do seguinte |
|---|---|---|---|---|
| **B-0** *(pré-requisito — fecha a Phase 6)* | backend | push `feat/payroll-workflow` | Os 25 commits verificados → PR para `main` | CI `quality` verde → squash-merge |
| **B-1** | backend | `feat/payroll-compensation-list` a partir de `main` fresco | `GET /payroll/compensation/all` + DTO + serviço + spec de integração (Secção A) | CI `quality` verde → merge |
| **B-2** | frontend | `feat/payslips-components-tab` a partir de `main` | Aba Componentes + o scaffold partilhado de abas admin em `page.tsx` (Secções B, C) | CI `quality` (`build`) verde → merge |
| **B-3** | frontend | `feat/payslips-compensations-tab` a partir de `main` (depois de B-2) | Aba Compensações (Secção D) — precisa do endpoint de B-1 + do scaffold de B-2 | CI `quality` verde → merge |

B-1 e B-2 são independentes (paralelizáveis depois de B-0). B-3 precisa de ambos.

### Itens em aberto para resolver na implementação

1. `rate` fracção vs percentagem — ver `payroll-engine.service.ts` antes de
   rotular o campo.
2. `code` duplicado ao criar → provavelmente 500, não 409 — mostrar erro cru.
3. Significado de `override` — ver `payroll-calculation.service.ts:180` antes de
   redigir o tooltip.
4. IBAN em claro no cartão de detalhe admin — confirmar que é intencional (os
   endpoints existentes fazem-no).
5. Filtro de departamento na tabela de B-3 — só pesquisa se não houver hook de
   departamentos pronto.
6. Identidade do colaborador no cabeçalho do `CompensationDetailView` — `GET
   /users/:id` extra, **ou** acrescentar `include: { user }` ao endpoint
   `history` em B-1.
7. O gap do frontend PR #393 (endpoint ainda não em `main`) resolve-se sozinho
   quando B-0 fizer merge.

### Rollback

Cada PR é squash-merged e independente → revert de um commit. Reverter B-3 deixa
B-1 (endpoint sem uso) + B-2 (um scaffold) inócuos. Reverter B-2 deixa o
scaffold `adminOnly` sem uso.
