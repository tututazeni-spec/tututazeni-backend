# Módulo Processos

**Abas:** Visão Geral, Meus Processos, Todos os Processos, Aprovações, Modelos de Processo, Relatórios

---

## 1. Visão Geral

Processos em curso, pendentes, concluídos, atrasados, rejeitados, cancelados, processos por tipo, por estado, por unidade, por departamento, por responsável, por aprovador, tempo médio de conclusão, tempo médio por tipo de processo, cumprimento de SLA, processos próximos do prazo, processos fora do SLA, volume de processos por período, evolução dos processos, alertas, atividades recentes.

## 2. Meus Processos

Processos iniciados pelo colaborador, processos atribuídos ao colaborador, processos que aguardam ação do colaborador, processos em aprovação, concluídos, rejeitados, atrasados, histórico de processos, pesquisa e filtros.

## 3. Todos os Processos

Número do processo, tipo de processo, título, colaborador, unidade, departamento, cargo, responsável atual, etapa atual, aprovador atual, prioridade, estado, data de abertura, prazo, data prevista de conclusão, data de conclusão, SLA, origem, última atualização, ações.

## 4. Aprovações

Aprovações pendentes, concluídas, rejeitadas, processo, colaborador, tipo de processo, etapa, aprovador, nível de aprovação, data de submissão, prazo de aprovação, decisão, motivo da rejeição, histórico de aprovação.

## 5. Modelos de Processo

Modelos ativos, modelos inativos, tipos de processo, descrição, objetivo, etapas, responsáveis, aprovadores, regras, condições, SLA, notificações, documentos obrigatórios, formulários, estado, data de criação, última atualização, versão.

## 6. Relatórios

Processos por tipo, por estado, por unidade, por departamento, por responsável, por aprovador, processos concluídos, atrasados, rejeitados, tempo médio de processamento, cumprimento de SLA, volume por período, gargalos por etapa, taxa de aprovação, taxa de rejeição, evolução dos processos, relatório de auditoria, exportação Excel/PDF.

---

## Modal: Novo Processo

- **Dados gerais:** tipo de processo, modelo de processo, título, descrição, motivo, prioridade, origem do processo, colaborador relacionado, unidade, departamento, cargo/posição
- **Responsabilidade:** responsável pelo processo, equipa responsável, aprovador inicial, aprovadores, participantes
- **Planeamento:** data de abertura, prazo de conclusão, data prevista de conclusão, SLA, prioridade
- **Workflow:** etapas do processo, ordem das etapas, responsáveis por etapa, aprovadores por etapa, condições de aprovação, etapas obrigatórias, etapas opcionais
- **Documentação:** documentos obrigatórios, documentos opcionais, anexos, observações
- **Notificações:** notificações automáticas, notificações por etapa, lembretes, aviso de prazo, aviso de atraso
- **Estado:** rascunho, pendente, em processamento, em aprovação, aprovado, rejeitado, concluído, cancelado

---

## Ao abrir um Processo

**Abas:** Resumo, Etapas, Aprovações, Documentos, Comentários, Histórico

- **Resumo:** número do processo, tipo, título, colaborador, departamento, responsável, estado, prioridade, etapa atual, progresso, data de abertura, prazo, SLA, data prevista de conclusão, última atualização
- **Etapas:** todas as etapas, etapa atual, responsável, aprovador, estado de cada etapa, data de início, prazo, data de conclusão, tempo utilizado, observações
- **Aprovações:** aprovador, nível, decisão, data, comentário, motivo da rejeição, histórico
- **Documentos:** documentos obrigatórios, enviados, pendentes, aprovados/rejeitados, versão, responsável, data
- **Comentários:** comentários, autor, data, respostas, menções, anexos
- **Histórico:** alterações de estado, de responsável, de aprovador, aprovações, rejeições, alterações de dados, documentos adicionados, comentários, data/hora, utilizador responsável

---

## Ações principais

Novo processo, editar, duplicar, iniciar processo, atribuir responsável, alterar responsável, avançar etapa, devolver etapa, aprovar, rejeitar, solicitar alteração, adicionar aprovador, adicionar participante, adicionar documento, solicitar documento, adicionar comentário, enviar lembrete, pausar processo, retomar processo, cancelar processo, concluir processo, reabrir processo, consultar histórico, exportar, imprimir.

---

## Tipos de processos que podem utilizar o módulo

Admissão, promoção, transferência, alteração de cargo, alteração de departamento, alteração de unidade, alteração de posição, alteração salarial, pedido de documento, desligamento, pedido de formação, aprovação de formação, pedido de desenvolvimento, aprovação de PDI, movimentação interna, contratação, integração, renovação, processos administrativos personalizados.

---

> **Regra arquitetural importante:** o módulo Processos **não deve duplicar** os dados de Users, Career, Organization, Formação, PDI, Férias, Onboarding, etc. Deve controlar *workflow, etapas, responsáveis, aprovações, prazos e histórico*, enquanto o módulo especializado continua a ser o proprietário dos dados do seu domínio.
