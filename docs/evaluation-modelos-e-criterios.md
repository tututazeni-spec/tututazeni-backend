# Avaliação — Modelos e Critérios

> As abas **Modelos** e **Critérios** foram removidas do frontend do módulo
> Avaliação (`/evaluation`). A funcionalidade **continua a existir no backend**
> e pode ser reposta no frontend quando for necessária.

## O que existe

### Critérios (biblioteca central)
Critério reutilizável entre modelos de avaliação: nome, código, descrição,
categoria, peso, escala, competência associada, indicadores comportamentais e
estado ativo.

| Método | Rota | Descrição |
|---|---|---|
| POST | `/evaluations/criteria` | Criar critério |
| GET | `/evaluations/criteria` | Listar critérios |
| PATCH | `/evaluations/criteria/:id` | Editar critério |
| DELETE | `/evaluations/criteria/:id` | Remover (desativar) critério |

### Modelos de avaliação
Conjunto de critérios com pesos, escala e tipo, reutilizável em ciclos e
avaliações. Pode haver um modelo por omissão.

| Método | Rota | Descrição |
|---|---|---|
| POST | `/evaluations/templates` | Criar modelo (`criteria: [{ criteriaId, weight }]`) |
| GET | `/evaluations/templates` | Listar modelos (com contagem de critérios) |
| GET | `/evaluations/templates/:id` | Detalhe com critérios e pesos |
| PATCH | `/evaluations/templates/:id` | Editar; `criteria` substitui a lista de critérios |
| DELETE | `/evaluations/templates/:id` | Remover modelo |

Ciclos já criados a partir de um modelo não são afetados ao removê-lo.
Código: `src/evaluation/evaluation.controller.ts` e `evaluation.service.ts`.

## O que existia no frontend (removido)
- Aba **Modelos**: cartões de modelo com editar, remover e menu de 3 pontos com
  "Adicionar critério" (escolher da lista de critérios criados ou criar um novo
  e ligá-lo ao modelo).
- Aba **Critérios**: listagem, criação, edição e remoção de critérios, com
  sugestões de indicadores comportamentais.

Para os recuperar, ver o histórico git do frontend (PR #620, commit
"feat(evaluation): Adicionar critério no modelo abre lista dos critérios
criados ou novo critério" e anteriores): `ModelsTab.tsx`, `TemplateFormModal.tsx`,
`AddCriterionToTemplateModal.tsx`, `CriteriaTab.tsx`, `CriteriaFormModal.tsx`.
