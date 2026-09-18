# Módulo Evaluation 360º

## 1. Visão Geral

Avaliações 360º em curso, avaliações concluídas, pendentes, em atraso, ciclos ativos, taxa de participação, taxa de conclusão, média geral das competências, principais pontos fortes, principais gaps, competências com maior gap, competências com maior evolução, distribuição dos resultados, colaboradores avaliados, colaboradores por avaliar, feedbacks recebidos, feedbacks pendentes, últimos resultados, próximos prazos, alertas.

**Cards principais:** ciclos ativos, avaliações pendentes, taxa de conclusão, competências avaliadas, colaboradores avaliados.

## 2. Radar 360º

Uma das abas mais visuais.

Radar global de competências, nível atual por competência, nível esperado, comparação atual vs. esperado, autoavaliação, avaliação do gestor, avaliação dos pares, avaliação dos subordinados, média dos avaliadores, diferença entre autoavaliação e perceção dos outros, principais pontos fortes, principais gaps, evolução entre ciclos.

**Filtros:** colaborador, ciclo, departamento, cargo, competência, período.

Permitir visualizar: Autoavaliação → Gestor → Pares → Subordinados → Média 360º

## 3. Competências

Lista de competências avaliadas, categoria, definição, nível esperado, nível obtido, nível da autoavaliação, nível do gestor, nível dos pares, nível dos subordinados, média 360º, gap, classificação, evolução, evidências, comentários associados, competência crítica, recomendação de desenvolvimento.

**Tabela ideal:**

| Competência | Esperado | Auto | Gestor | Pares | 360º | Gap |
|---|---|---|---|---|---|---|

Ao clicar numa competência, abre o detalhe, incluindo os comentários e avaliações que contribuíram para o resultado.

## 4. Feedback

Feedback recebido, feedback enviado, feedback do gestor, dos pares, dos subordinados, feedback anónimo, pontos fortes mencionados, oportunidades de melhoria, comentários por competência, feedback positivo, feedback construtivo, tendências de feedback, feedback pendente.

**Ações:** solicitar feedback, responder a feedback, marcar feedback como lido, adicionar comentário, histórico de feedback.

## 5. Matriz 9-Box

Integração forte com o módulo de Desempenho/Talento, em vez de transformar o 9-box numa funcionalidade isolada do 360º.

Matriz 9-box, desempenho, potencial, posição do colaborador, distribuição dos colaboradores, filtros por unidade/departamento/cargo, colaboradores por quadrante, movimentação entre ciclos, histórico de posicionamento, ações recomendadas, plano de desenvolvimento, sucessão, talento crítico.

A matriz cruza **Desempenho × Potencial**. Ao clicar num colaborador:
Resultado 360º → Desempenho → Potencial → Competências → PDI → Sucessão

## 6. Ciclos

Ciclos criados, ciclo atual, ciclos futuros, ciclos encerrados, nome do ciclo, período, descrição, população abrangida, departamentos abrangidos, cargos abrangidos, competências avaliadas, modelo de avaliação, escala, participantes, avaliadores, prazos, estado, taxa de conclusão, avaliações concluídas, avaliações pendentes, lembretes, anonimato, regras de participação, data de início, data de encerramento.

### Modal: Novo Ciclo

Nome, código, descrição, tipo de ciclo, período, data de início, data de fim, população-alvo, unidades, departamentos, cargos, competências, pesos, tipos de avaliadores, número mínimo de avaliadores, anonimato, autoavaliação, avaliação do gestor, avaliação dos pares, avaliação dos subordinados, escala de avaliação, perguntas abertas, regras de elegibilidade, notificações, lembretes, estado.

## 7. Autoavaliação

Orientada ao colaborador.

Ciclo atual, prazo, progresso, competências a avaliar, nível esperado, autoavaliação, evidências, comentários, pontos fortes, áreas de desenvolvimento, objetivos relacionados, anexos/evidências, histórico de autoavaliações, comparação com ciclos anteriores.

**Experiência simples:** Competência → definição → nível esperado → "Como me avalio?" → evidência/comentário → próxima competência. No final: Resumo da autoavaliação → confirmar → submeter.

## 8. Avaliar

Área onde o utilizador avalia outras pessoas.

Avaliações atribuídas, pendentes, concluídas, prazo, colaborador avaliado, relação com o avaliado, ciclo, progresso, competências, nível atribuído, evidências, comentários, pontos fortes, oportunidades de melhoria, recomendação de desenvolvimento, guardar rascunho, submeter avaliação.

**Filtros:** por ciclo, colaborador, departamento, cargo, estado, prazo.

---

## Arquitetura — manter 8 abas, distinguir por permissões

**Abas:** Visão Geral · Radar 360º · Competências · Feedback · Matriz 9-Box · Ciclos · Autoavaliação · Avaliar

| Perfil | Abas visíveis |
|---|---|
| Colaborador | Visão Geral, Radar 360º, Competências, Feedback, Autoavaliação, Avaliar |
| Gestor | + Matriz 9-Box |
| RH/Admin | + Ciclos |

Assim não é necessário criar uma aba separada chamada "Administração".
