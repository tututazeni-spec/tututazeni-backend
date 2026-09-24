# Módulo ROI & Impact

Módulo transversal que mede o retorno sobre o investimento (ROI) e o impacto real das ações de RH e Academia no negócio — formação, desenvolvimento, onboarding, eventos, automações — sem duplicar os dados de origem. O ROI & Impact **lê** dados de Trainings, Courses, Evaluation, Competencies, Development Plans, Payroll, Departments e Processes; não os recalcula nem os armazena em duplicado.

> Trainings/Courses/Evaluation respondem "o que fizemos". O ROI & Impact responde "valeu a pena, e o que mudou por causa disso".

## Abas principais

Visão Geral, ROI da Formação, Impacto no Negócio, Modelos de Avaliação, Custos & Investimento, Indicadores & KPIs, Correlações, Cenários & Simulações, Benchmarks, Relatórios, Configurações

## 1. Visão Geral

Painel executivo do retorno da Academia/RH.

**Cards:**

- ROI global (%)
- Investimento total em formação/desenvolvimento
- Retorno estimado (valor)
- Custo por colaborador formado
- Custo por hora de formação
- Impacto médio na produtividade
- Redução de rotatividade atribuível
- Colaboradores impactados
- Iniciativas ativas em medição
- Iniciativas com ROI positivo
- Iniciativas com ROI negativo/indeterminado

**Também:**

- ROI por departamento
- ROI por unidade
- ROI por tipo de iniciativa (curso, formação, PDI, mentoria, evento)
- Evolução do ROI ao longo do tempo
- Top 10 iniciativas com maior impacto
- Alertas (iniciativas caras sem retorno demonstrado, dados insuficientes para calcular ROI)

## 2. ROI da Formação

Cálculo do retorno por iniciativa formativa (curso, formação, aula ao vivo, percurso de aprendizagem).

**Tabela:**

- Iniciativa
- Tipo (Curso/Formação/Percurso/PDI/Mentoria/Evento)
- Departamento
- Unidade
- Participantes
- Custo total
- Custo por participante
- Benefício estimado
- Benefício realizado
- ROI (%)
- Payback (tempo de retorno)
- Nível de confiança dos dados
- Estado
- Período de medição

**Fórmula base:**

```
ROI (%) = [(Benefício monetário − Custo total) ÷ Custo total] × 100
```

**Estados:** Em preparação, Em medição, Dados insuficientes, Calculado, Validado, Revisto, Arquivado

### Ao clicar em "Nova Análise de ROI"

**Etapa 1 — Identificação**

Nome da análise, iniciativa associada (Curso/Formação/PDI/Evento), tipo, departamento, unidade, responsável, período de referência, período de medição pós-iniciativa

**Etapa 2 — Custos (ver secção 5)**

Custos diretos, custos indiretos, custos de oportunidade

**Etapa 3 — Benefícios esperados**

Tipo de benefício (produtividade, qualidade, redução de erros, redução de rotatividade, redução de acidentes, aumento de vendas, redução de tempo de ciclo, satisfação do cliente, outro), indicador associado, valor de referência antes, valor esperado depois, forma de conversão em valor monetário, responsável pela validação

**Etapa 4 — Metodologia**

Modelo de avaliação utilizado (ver secção 4), nível de isolamento do efeito (fator de isolamento — quanto do resultado é atribuível à iniciativa vs. outras causas), fonte de dados, grupo de controlo (se existir), premissas assumidas

**Etapa 5 — Resultado**

Benefício monetário calculado, custo total, ROI, BCR (rácio benefício/custo), payback period, intervalo de confiança, observações, aprovação

## 3. Impacto no Negócio

Liga iniciativas de RH/Academia a indicadores de negócio reais, não apenas indicadores de formação.

**Informações:**

- Colaborador/Equipa/Departamento
- Iniciativa
- Indicador de negócio afetado
- Valor antes
- Valor depois
- Variação
- Período de observação
- Grau de atribuição (% atribuível à iniciativa)
- Fonte do dado
- Validado por

**Categorias de impacto:**

- Produtividade (output por colaborador/hora)
- Qualidade (taxa de erro, retrabalho, não conformidades)
- Rotatividade/Turnover (redução em % ou nº de saídas evitadas)
- Absentismo (redução em dias)
- Segurança (redução de acidentes/incidentes)
- Vendas/Receita (quando aplicável a formação comercial)
- Satisfação do cliente (NPS, reclamações)
- Satisfação/engagement do colaborador (eNPS)
- Tempo de resposta/ciclo operacional
- Cumprimento de SLA
- Compliance (redução de não conformidades regulatórias)
- Custo evitado (ex.: menos contratações externas por promoção interna)

**Exemplo:**

> Formação: Excelência no Atendimento — Loja Benguela Centro
> Indicador: Satisfação do cliente (NPS)
> Antes: 62 → Depois: 74 (+12 pontos)
> Grau de atribuição estimado: 60%
> Impacto atribuído: +7,2 pontos de NPS

## 4. Modelos de Avaliação

Configura a metodologia usada para medir impacto e ROI, mantendo rigor e comparabilidade entre iniciativas.

**Modelo de Kirkpatrick (4 níveis) + extensão Phillips (5º nível):**

| Nível | Nome | Mede | Fonte de dados típica |
|---|---|---|---|
| 1 | Reação | Satisfação com a formação | Avaliações pós-aula (Evaluation/Trainings) |
| 2 | Aprendizagem | Conhecimento/competência adquirida | Testes, avaliações (Evaluation, Competencies) |
| 3 | Comportamento | Aplicação no posto de trabalho | Avaliação do gestor, Evaluation 360°, observação |
| 4 | Resultados | Impacto nos indicadores de negócio | Impacto no Negócio (secção 3) |
| 5 | ROI | Retorno financeiro | ROI da Formação (secção 2) |

**Configuração por modelo:**

- Nome do modelo
- Descrição
- Níveis incluídos
- Obrigatoriedade por nível
- Peso de cada nível na pontuação final
- Aplicável a (tipo de iniciativa, criticidade, custo mínimo)
- Estado

**Regra recomendada:** exigir medição até ao Nível 3 para todas as formações; exigir Nível 4/5 apenas para iniciativas acima de um determinado custo ou criticidade estratégica, para não sobrecarregar o RH com medições desproporcionais ao investimento.

## 5. Custos & Investimento

Consolida o custo real de cada iniciativa, sem duplicar dados de Payroll/Trainings — apenas agrega.

**Custos diretos:**

- Custo do formador/consultor externo
- Custo de material didático
- Custo de plataforma/licenças
- Custo de sala/logística
- Custo de deslocação e alojamento
- Custo de certificação

**Custos indiretos:**

- Horas de trabalho perdidas (salário/hora × horas em formação)
- Custo de substituição/cobertura durante a ausência
- Custo de coordenação e gestão do RH

**Custos de oportunidade:**

- Produção não realizada durante a formação
- Custo de atraso de projetos associados

**Fontes:**

- Payroll → salário/hora para cálculo de custo de horas perdidas
- Trainings → custo por turma/sessão/formador
- Recursos & Logística (Trainings) → custo de salas, equipamentos, catering

**Consolidação por iniciativa:**

| Iniciativa | Custo direto | Custo indireto | Custo oportunidade | Custo total | Custo/participante |
|---|---|---|---|---|---|

## 6. Indicadores & KPIs

Biblioteca central de KPIs que o RH pode associar a qualquer iniciativa.

**Cada KPI:**

- Nome
- Código
- Categoria (produtividade, qualidade, pessoas, financeiro, cliente, segurança, compliance)
- Descrição
- Unidade de medida
- Fórmula de cálculo
- Fonte de dados (módulo de origem ou importação manual)
- Frequência de recolha
- Meta/benchmark interno
- Responsável pela recolha
- Estado

**Exemplos:** Taxa de rotatividade voluntária, custo de substituição por saída, produtividade por colaborador, taxa de promoção interna, tempo médio até produtividade plena (onboarding), taxa de conclusão de formação obrigatória, custo por hora de formação, NPS interno, taxa de absentismo, taxa de acidentes de trabalho

## 7. Correlações

Explora relações estatísticas entre investimento em desenvolvimento e resultados de negócio, sem inventar causalidade onde não existe.

**Análises disponíveis:**

- Horas de formação × desempenho na avaliação
- Competências desenvolvidas × produtividade
- Participação em PDI × retenção do colaborador
- Investimento em formação × rotatividade por departamento
- Onboarding estruturado × tempo até produtividade plena
- Mentoria/coaching × progressão de carreira
- Formação de liderança × engagement da equipa liderada

**Cada correlação apresenta:**

- Variáveis analisadas
- Período
- Amostra (nº de colaboradores/departamentos)
- Coeficiente de correlação
- Significância estatística
- Gráfico de dispersão
- Aviso: correlação não implica causalidade — leitura interpretativa, nunca automática

**Importante:** esta aba é analítica e de apoio à decisão; não deve alimentar automações (módulo Automations) sem validação humana, dado o risco de decisões erradas baseadas em correlações espúrias.

## 8. Cenários & Simulações

Permite simular o impacto financeiro de decisões futuras de investimento em desenvolvimento.

**Simulador:**

- Iniciativa proposta
- Público-alvo (nº de colaboradores, departamento)
- Custo estimado
- Benefício esperado (baseado em iniciativas semelhantes já medidas, ou premissas manuais)
- ROI projetado
- Payback projetado
- Cenário otimista / realista / pessimista
- Comparação entre cenários alternativos

**Exemplo:**

> Cenário A: Formação presencial para 40 gestores de loja — custo: 3.200.000 Kz — ROI projetado: 145% em 12 meses
> Cenário B: Mesma formação em formato híbrido com aulas ao vivo — custo: 1.900.000 Kz — ROI projetado: 168% em 12 meses

## 9. Benchmarks

Referências internas e externas para contextualizar os resultados.

**Internos:**

- Comparação entre departamentos
- Comparação entre unidades
- Comparação entre ciclos/anos
- Melhor e pior desempenho por tipo de iniciativa

**Externos (quando disponíveis):**

- Benchmarks de mercado/setor (inseridos manualmente pelo RH, com fonte registada)
- Comparação do ROI médio da Academia INNOVA vs. referências do setor em Angola

**Campos:** Nome do benchmark, fonte, ano de referência, valor, unidade de medida, aplicável a (KPI/indicador), observações

## 10. Relatórios

**Relatórios:**

- ROI consolidado da Academia (período)
- ROI por departamento/unidade/tipo de iniciativa
- Impacto no negócio por indicador
- Custo total de formação vs. orçamento
- Execução orçamental da Academia
- Top iniciativas por ROI
- Iniciativas sem dados suficientes para cálculo
- Evolução do ROI ano a ano
- Impacto do onboarding na retenção
- Impacto da liderança no engagement de equipa
- Relatório executivo para Administração (síntese de 1–2 páginas)

**Exportação:** Excel, PDF, PowerPoint (síntese executiva)

**Filtros:** Período, unidade, departamento, tipo de iniciativa, modelo de avaliação, estado, nível hierárquico

## 11. Configurações

- Moeda e formato de valores monetários
- Taxa de desconto/custo de capital (para cálculos de valor atual, se aplicável)
- Fator de isolamento padrão por tipo de iniciativa
- Limiar de custo/criticidade que obriga medição de Nível 4/5
- Períodos de medição pós-iniciativa padrão (30/60/90/180 dias)
- Responsáveis pela validação de benefícios
- Fórmulas de conversão de benefícios não financeiros em valor monetário
- Permissões de acesso (quem vê ROI financeiro, quem vê apenas indicadores operacionais)
- Alertas e notificações (iniciativa sem medição há X dias, ROI abaixo do esperado)

## Integrações principais

O ROI & Impact não deve absorver dados de outros módulos — apenas consumi-los:

- **Trainings/Courses/Live Classes** → participantes, custos, datas, conclusão
- **Evaluation/Evaluation 360°** → resultados de aprendizagem e comportamento (Níveis 2 e 3 de Kirkpatrick)
- **Competencies** → evolução de gaps antes/depois
- **Development Plans/PDI** → ações de desenvolvimento e progresso
- **Payroll** → custo salarial/hora para cálculo de custo de horas perdidas
- **Departments** → estrutura para segmentar ROI por departamento/unidade
- **Onboarding** → tempo até produtividade plena, retenção pós-integração
- **Events** → custo e participação em eventos com componente formativa
- **Automations** → pode notificar responsáveis quando uma iniciativa fica sem dados de medição, mas não deve tomar decisões automáticas de investimento
- **Reports/Analytics** → consumo cruzado para dashboards executivos

## Arquitetura e fluxo

```
Iniciativa (Curso/Formação/PDI/Evento/Onboarding)
        ↓
Custos (diretos + indiretos + oportunidade)
        ↓
Modelo de Avaliação (Kirkpatrick/Phillips)
        ↓
Nível 1 — Reação → Nível 2 — Aprendizagem → Nível 3 — Comportamento
        ↓
Impacto no Negócio (Nível 4)
        ↓
ROI (Nível 5)
        ↓
Correlações + Benchmarks
        ↓
Relatórios executivos → Decisão de investimento futuro (Cenários & Simulações)
```

## Modelos de dados principais

Manter separados, sem duplicar dados de origem:

- `RoiAnalysis` — análise de ROI de uma iniciativa
- `ImpactRecord` — registo de impacto num indicador de negócio
- `CostEntry` — entrada de custo (direto/indireto/oportunidade), com referência à origem
- `EvaluationModel` — modelo de avaliação configurado (Kirkpatrick/Phillips/personalizado)
- `KpiDefinition` — definição de um KPI na biblioteca central
- `Correlation` — análise de correlação entre duas variáveis
- `Scenario` — simulação de cenário futuro
- `Benchmark` — referência interna/externa

## Princípio orientador

O módulo deve responder sempre a três perguntas, nesta ordem, para qualquer iniciativa de RH/Academia:

1. **Quanto custou?** (Custos & Investimento)
2. **O que mudou?** (Impacto no Negócio)
3. **Valeu a pena?** (ROI da Formação)

Sem dados fiáveis para as duas primeiras, a terceira não deve ser apresentada como número definitivo — apenas como estimativa com o respetivo nível de confiança, para não gerar falsa precisão em decisões de investimento.
