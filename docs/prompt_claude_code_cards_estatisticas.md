# Prompt para Claude Code — Cards de estatísticas

## Migração visual dos cards de estatísticas do dashboard

**Objetivo:** reproduzir o mais fielmente possível o design dos cards da imagem de referência, adaptando-o aos componentes, dados e tecnologias já existentes no projeto.

---

## 1. Referência visual obrigatória

Analisa a imagem de referência e reproduz as seguintes características.

### Estrutura dos cards

- Formato retangular horizontal, fundo branco (`#FFFFFF`).
- Cantos arredondados de aproximadamente 14 px a 16 px.
- Borda exterior fina em azul acinzentado claro (`#D8E2F0`).
- Sombra subtil e elegante.
- Dimensões consistentes e alinhamento perfeito, com espaçamento uniforme.

### Cabeçalho azul-marinho

- Fundo azul-marinho, aproximadamente `#142C54` ou `#152F59`.
- Altura aproximada de 58 px a 62 px num card com cerca de 155 px de altura.
- Cantos superiores arredondados, acompanhando a forma do card.
- Título branco (`#FFFFFF`), semibold, aproximadamente 15 px a 17 px, alinhado verticalmente ao centro.
- O cabeçalho ocupa toda a largura do card, sem margens laterais internas.

### Ícones circulares sobrepostos

- Círculo de aproximadamente 56 px a 60 px de diâmetro, posicionado à esquerda e parcialmente sobre o cabeçalho.
- Sobreposição vertical entre o cabeçalho azul-marinho e a área branca.
- Ícone branco, centralizado, com traço limpo e moderno.
- Cores vivas, mas profissionais.
- Reutiliza a biblioteca de ícones existente; evita dependências desnecessárias.

### Área dos valores

- Fundo branco e valor numérico principal centralizado horizontalmente.
- Número grande (aproximadamente 36 px a 40 px), bold ou semibold.
- Cor do número associada à categoria do card.
- Não adicionar descrições, percentagens, gráficos ou legendas ausentes da referência.
- Os valores devem continuar a ser obtidos dinamicamente a partir dos dados reais.

---

## 2. Paleta de cores

| Uso | Cor |
|---|---|
| Cabeçalhos azul-marinho | `#152F59` |
| Azul | `#1877F2` |
| Verde | `#218653` |
| Laranja | `#E99A16` |
| Vermelho | `#EF4657` |
| Fundo dos cards | `#FFFFFF` |
| Bordas | `#D8E2F0` |

Manter o fundo atual da secção se não prejudicar a semelhança visual.

---

## 3. Disposição dos cards

Organiza os cards numa grelha de **quatro colunas** em ecrãs grandes:

| Linha | Cards |
|---|---|
| 1.ª | Total de cursos · Publicados · Rascunhos · Em pausa |
| 2.ª | Arquivados · Módulos · Lições · Inscritos |
| 3.ª | Formandos · Conclusões · Inscrições pendentes · Certificados emitidos |

- Usar CSS Grid ou a solução equivalente já adotada no projeto.
- Duas colunas em tablets e uma ou duas em dispositivos móveis, conforme a largura disponível.
- Manter espaçamento uniforme de aproximadamente 16 px a 20 px e alturas iguais.
- Garantir que títulos longos não são cortados nem sobrepostos pelos ícones.

---

## 4. Ícones de cada card

| Card | Ícone |
|---|---|
| Total de cursos | Livro aberto |
| Publicados | Círculo com visto de confirmação |
| Rascunhos | Documento |
| Em pausa | Símbolo de pausa |
| Arquivados | Caixote do lixo |
| Módulos | Camadas empilhadas |
| Lições | Lista com linhas |
| Inscritos | Grupo de utilizadores |
| Formandos | Chapéu de graduação |
| Conclusões | Círculo com visto de confirmação |
| Inscrições pendentes | Relógio |
| Certificados emitidos | Certificado |

Mantém os ícones coerentes em tamanho, espessura do traço e alinhamento.

---

## 5. Funcionalidades e integrações

Esta é uma **migração visual**, não uma reconstrução funcional. É obrigatório:

- Preservar funcionalidades, valores reais, cálculos, chamadas à API, consultas à base de dados, hooks, estados e integrações.
- Manter eventos de clique existentes, permissões, filtros e regras de acesso.
- Não substituir dados reais por números estáticos ou fictícios.
- Não remover funcionalidades, nem alterar rotas, endpoints, modelos de dados ou regras de negócio.
- Se já existir um componente reutilizável, modificar esse componente e os estilos, em vez de reconstruir a página.

---

## 6. Requisitos de implementação

- Antes de alterar o código, analisar a estrutura do projeto, a página do dashboard e os componentes dos cards.
- Identificar a origem dos valores, os cálculos, o sistema de estilos e a biblioteca de ícones.
- Reutilizar a arquitetura e as convenções existentes.
- Manter o código limpo e reutilizável, sem dependências desnecessárias.
- Isolar os estilos para não afetar outros componentes.
- Respeitar o sistema de design existente quando isso não comprometer a fidelidade à referência.

---

## 7. Acabamento visual

- Cabeçalhos azul-marinho sólidos e área inferior branca.
- Ícones circulares grandes, parcialmente sobrepostos ao cabeçalho.
- Números destacados e centralizados, bordas suaves e sombras discretas.
- Grelha simétrica, espaçamento consistente e aspeto profissional de um dashboard LMS/academia corporativa.
- Evitar gradientes fortes, animações e tremelique.
- **Hover (decisão atualizada):** manter o zoom subtil ao passar o rato (`hover:scale-[1.06]` + sombra mais marcada, `transition-all duration-200`), desativado com `motion-reduce:hover:scale-100`. O zoom é obrigatório em todos os cards migrados.

---

## 8. Critérios de aceitação

- A aparência deve ficar o mais próxima possível da imagem fornecida.
- Os 12 indicadores existentes devem ser apresentados corretamente.
- A grelha deve respeitar a organização, as cores e o espaçamento da referência.
- Ícones, cabeçalhos, valores e títulos devem estar alinhados e legíveis.
- O layout deve ser responsivo e os dados devem continuar dinâmicos e reais.
- Nenhuma funcionalidade existente deve ser quebrada.
- Executar as verificações disponíveis, corrigir erros de compilação/execução e resumir os ficheiros alterados.

---

## Instrução final

Não redesenhes o dashboard inteiro. Modifica **exclusivamente** os cards de estatísticas abrangidos por esta tarefa. Usa a imagem fornecida como referência visual principal e dá prioridade à fidelidade do design, à consistência e à preservação de toda a lógica existente.

> **Verificação visual adicional:** antes de finalizar, compara o resultado implementado com a imagem de referência, ajusta dimensões, espaçamentos, posição dos círculos e tipografia, e repete até obter a maior semelhança possível, sem alterar a lógica da aplicação.

---

## 9. Implementação de referência e registo de migrações

**Componente partilhado (usar sempre este, não criar variantes locais):** `frontend/components/ui/NavyStatCard.tsx`

```tsx
<NavyStatCard icon={BookOpen} tone="blue" label="Cursos" value={n} sub="opcional" trend={opcional} />
```

- `tone`: `blue` (#1877F2) · `green` (#218653) · `orange` (#E99A16) · `red` (#EF4657). O antigo `gold` passa a `orange`.
- `sub` (linha secundária) e `trend` (▲/▼) são opcionais e servem para preservar informação real que o card antigo já mostrava.
- Altura fixa 155 px (cabeçalho 60 px + corpo 95 px); skeletons de carregamento devem usar `h-[155px] rounded-2xl`.
- Grelha: `grid grid-cols-2 gap-4 md:grid-cols-4`.

**Regras de migração aplicadas até agora**
- Substituir os cartões locais (`CourseStyleKpiCard`, `HighlightKpiCard`, `GaugeKpiCard`, `SparklineKpiCard`, `FundingKpiCard`, `TopBarCard`) pelo `NavyStatCard`, apagando o código morto (tipos, tons, imports).
- Mini-gráficos dentro dos cards (anel, sparkline, barras) são removidos; o valor numérico e o `sub` mantêm-se. Não migrar gráficos nem tabelas.
- Preservar a origem dos dados, cálculos e cores condicionais (ex.: vermelho/verde por limiar).

**Migrados (módulo Dashboard)**
- [x] O Meu Dashboard — `ColaboradorDashboard.tsx` (8 cards)
- [x] Gestor — `ManagerDashboard.tsx` (8 cards)
- [x] Executivo — `OrgDashboard.tsx` (4 + 7 cards; as barras trimestrais do card Financiamento foram removidas)

- [x] Dashboard RH — 14 painéis (`components/dashboard-rh/*`); gauges, termómetro de risco, sparkline mock e barra de progresso removidos; cor por limiar via `rateTone.ts`

- [x] Analytics — 10 vistas (`components/analytics/*`: Overview, RH, Pessoas, Engagement, Cursos, Learning, PDI, Riscos, ROI, Gestor); sparklines/barras/funil/gauges removidos (funil → `sub`), `MOCK_TURNOVER_TREND` apagado; tom por limiar no card do Gestor

- [x] Reports — `components/reports/ReportOutput.tsx` (KPIs de resumo) e `components/executive-reports/*` (ExecutiveKpiCard, KpiCard, 12 indicadores do OverviewPanel); sparkline e badge de estado removidos (estado/comparação/meta → `sub`), tom pelo semáforo do KPI (`gold`→`orange`)
- [x] Reports — Central de Relatórios: 10 cards de modelo (`components/reports/TemplateCard.tsx`) no desenho Navy (variante local com descrição + "Executar →", pois não têm valor numérico); tom por categoria

- [x] Courses — Dashboard Admin (`components/courses/AdminDashboardView.tsx`, 18 cards; gauges de conclusão/aprovação → `NavyStatCard` com tom por limiar via `rateTone`) e Relatórios (`RelatoriosView.tsx`, 7 cards; sparkline mock, histograma estimado e barra de meta removidos; "Meta" → fora)

- [x] Evaluation — Visão Geral (10 cards, org + pessoais), Analytics (4), Relatórios (4), Competências (3) e Configurações (3) em `components/evaluation/*`; tom do Score Médio por limiar via `SCORE_TONE` (constants.ts); distribuição de performance e matriz de concordância não migradas (gráficos)

- [x] Live Classes — Dashboard (11 cards, incl. "Gravações disponíveis"), Avaliações (6) e Relatórios (4 + 5 + 1) em `components/live-classes/*`; tons por significado (agendadas/participantes azul, em curso vermelho, concluídas/presenças verde, canceladas/horas laranja); sem valores alterados

- [x] Content Library — Analytics (4 cards) e O Meu Percurso (4) em `components/content-library/*`; `KpiCard` → `NavyStatCard`, tons por significado (concluídos/activos verde, visualizações azul ou laranja); sem valores alterados

- [x] AI Tutor — Visão Geral (7 cards), Analytics (6) e Base de Conhecimento (4) em `components/ai-tutor/*`; `KpiCard`/`Card` locais → `NavyStatCard`, tons por significado (taxas/aceites verde, tempo/horas laranja); sem valores alterados

**Pendentes:** restantes módulos que usam `TopBarCard` (crm), apenas cards.
