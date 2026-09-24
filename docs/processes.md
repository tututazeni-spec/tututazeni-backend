# Módulo Processes

Módulo de gestão de processos internos da organização — documentar, organizar, executar, acompanhar e melhorar processos.

Não deve ser confundido com Automation: Processes define o processo de negócio; Automation pode automatizar as etapas e ações desse processo.

## Estrutura do módulo

Visão Geral, Processos, Categorias, Etapas & Fluxos, Responsáveis, Documentos & Recursos, Indicadores, Revisões, Histórico, Relatórios

## 1. Visão Geral

Dashboard dos processos da organização.

**Informações:**

- Total de processos
- Processos ativos
- Em revisão
- Em implementação
- Arquivados
- Processos por departamento
- Processos por unidade
- Processos críticos
- Processos com revisão próxima
- Processos sem responsável
- Processos com SLA
- Processos em incumprimento
- Tempo médio de execução
- Taxa de cumprimento
- Últimas alterações

## 2. Processos

**Informações:**

- Nome do processo
- Código
- Descrição
- Objetivo
- Categoria
- Tipo
- Departamento responsável
- Unidade
- Processo proprietário
- Responsável
- Estado
- Criticidade
- Frequência
- Versão
- Data de criação
- Última revisão
- Próxima revisão

**Tipos:** Processo estratégico, processo operacional, processo de suporte, processo administrativo, processo de RH, processo financeiro, processo comercial, processo de formação, processo logístico, outro

**Estados:** Rascunho, Em revisão, Aprovado, Ativo, Suspenso, Obsoleto, Arquivado

### Ao clicar em "Novo Processo"

Nome, código, descrição, objetivo, finalidade, categoria, tipo, área, departamento responsável, unidade, proprietário do processo, responsável operacional, participantes, frequência, criticidade, prioridade, SLA, pré-requisitos, entradas, saídas, versão, data de início, data de revisão, estado

## 3. Categorias

Organiza os processos por áreas.

**Informações:** Nome, código, descrição, categoria-pai, processos associados, responsável, estado, ordem, data de criação

**Exemplos:** RH, Academia, Financeiro, Operações, Logística, Compras, Comercial, IT, Qualidade, Administração

## 4. Etapas & Fluxos

Desenho do processo.

**Informações:** Processo, etapa, ordem, nome, descrição, responsável, departamento, duração prevista, SLA, pré-requisito, condição, entrada, saída, documento necessário, ação, estado

**Permite visualizar:** Fluxograma, lista de etapas, timeline

**Cada etapa deve ter:** Responsável, aprovador, prazo, SLA, formulário, documento, tarefa, condição, notificação, automação

**Exemplo:**

```
Pedido → Validação → Aprovação → Execução → Verificação → Conclusão
```

## 5. Responsáveis

Define quem é responsável pelo processo e pelas suas etapas.

**Informações:** Processo, responsável, função, departamento, papel, etapa, substituto, nível de responsabilidade, data de início, estado

**Papéis:** Process Owner, Responsável operacional, Executor, Aprovador, Revisor, Participante

## 6. Documentos & Recursos

Tudo o que é necessário para executar o processo.

**Informações:** Documento, tipo, processo, etapa, versão, obrigatório, responsável, validade, localização, estado

**Pode incluir:** Procedimentos, manuais, formulários, checklists, políticas, instruções de trabalho, modelos, anexos

Integrar com a Biblioteca/Document Repository, em vez de criar outro sistema de documentos.

## 7. Indicadores

Mede o desempenho dos processos.

**Informações:** KPI, processo, descrição, unidade de medida, meta, valor atual, valor anterior, frequência, responsável, período, estado

**Exemplos:** Tempo médio de execução, taxa de cumprimento do SLA, número de processos concluídos, taxa de erro, retrabalho, custo médio, volume processado, taxa de incumprimento, satisfação do utilizador

## 8. Revisões

Controla a melhoria e atualização dos processos.

**Informações:** Processo, versão atual, versão proposta, motivo da revisão, alteração, responsável, revisor, data de revisão, data de aprovação, estado, observações

**Estados:** Planeada, Em revisão, Em aprovação, Aprovada, Rejeitada, Implementada

**Também:** Data da próxima revisão, periodicidade de revisão, alterações realizadas, impacto da alteração

## 9. Histórico

Auditoria completa.

**Informações:** Data, hora, utilizador, processo, ação, campo alterado, valor anterior, novo valor, motivo, versão

**Exemplos:** Processo criado, etapa adicionada, responsável alterado, SLA alterado, documento atualizado, processo aprovado, processo suspenso, processo reativado

## 10. Relatórios

**Relatórios:** Processos por departamento, processos por unidade, processos ativos, processos críticos, processos em revisão, processos por categoria, cumprimento de SLA, processos atrasados, tempo médio de execução, desempenho dos processos, KPIs, processos sem responsável, processos sem revisão, alterações por período, processos por versão

**Filtros:** Período, unidade, departamento, categoria, responsável, estado, criticidade, tipo

## Integrações

O Processes deve ser um módulo transversal:

- **Organization** → unidades e estrutura
- **Departments** → departamentos responsáveis
- **Users** → responsáveis e executores
- **Roles & Permissions** → permissões sobre processos
- **Documents/Library** → procedimentos e documentos
- **Automation** → automatização das etapas
- **Notifications** → alertas e prazos
- **Tasks** → execução de tarefas, se existir módulo próprio
- **Reports/Analytics** → análise dos KPIs
- **Audit Logs** → auditoria
