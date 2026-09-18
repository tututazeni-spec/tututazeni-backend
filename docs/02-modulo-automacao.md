# Módulo Automação

**Abas:** Visão Geral, Automações, Gatilhos, Ações, Execuções, Modelos, Logs, Relatórios

---

## 1. Visão Geral

Automações ativas, automações inativas, automações em execução, automações com erro, execuções realizadas, execuções falhadas, automações por módulo, automações por tipo, gatilhos executados, ações executadas, tarefas automáticas pendentes, notificações enviadas, taxa de sucesso, últimas execuções, automações mais utilizadas, alertas, erros recentes.

## 2. Automações

Nome da automação, código, descrição, módulo, evento de disparo, condição, ação, frequência, responsável, última execução, próxima execução, número de execuções, estado, versão, data de criação, última atualização.

## 3. Gatilhos

**Conteúdos:** evento que inicia a automação, módulo de origem, entidade, ação/evento, condição, campo monitorizado, valor esperado, data/hora, frequência, evento imediato/agendado, estado.

**Exemplos de gatilhos:** colaborador criado, colaborador atualizado, colaborador admitido, contrato próximo do vencimento, aniversário, período de férias próximo, avaliação iniciada, avaliação concluída, PDI criado, PDI atrasado, formação atribuída, formação concluída, curso concluído, certificado emitido, competência abaixo do nível esperado, processo criado, processo aprovado, processo rejeitado, prazo próximo, prazo ultrapassado, nova posição aberta, sucessor identificado.

## 4. Ações

Ação a executar, módulo de destino, destinatário, responsável, prioridade, prazo, mensagem, template, criação de tarefa, criação de processo, envio de notificação, envio de e-mail, atribuição de curso, atribuição de formação, criação de PDI, criação de check-in, atualização de estado, atribuição de responsável, pedido de aprovação, criação de alerta, execução de webhook, integração externa.

## 5. Execuções

**Conteúdos:** automação, execução, gatilho, data/hora, duração, estado, ação executada, resultado, destinatário, entidade afetada, tentativa, erro, mensagem de erro, próxima tentativa.

**Estados:** Em fila, Em execução, Concluída, Falhou, Cancelada, Ignorada.

## 6. Modelos

**Conteúdos:** modelos de automação, nome, categoria, módulo, descrição, gatilho predefinido, ações predefinidas, condições, frequência, estado, versão.

**Modelos pré-configurados:** lembrete de avaliação, alerta de PDI atrasado, lembrete de formação, aviso de certificado próximo do vencimento, alerta de contrato próximo do vencimento, notificação de aniversário, notificação de onboarding pendente, lembrete de check-in, alerta de competência abaixo do esperado, aprovação de processo, notificação de nova oportunidade interna.

## 7. Logs

Data/hora, automação, evento, utilizador, entidade, ação, resultado, estado, erro, IP, origem, duração, detalhes técnicos.

## 8. Relatórios

Automações executadas, automações por módulo, execuções concluídas, execuções falhadas, taxa de sucesso, erros por automação, ações mais executadas, notificações enviadas, tarefas criadas, processos criados automaticamente, cursos atribuídos automaticamente, PDI criados automaticamente, execução por período, desempenho das automações.

---

## Modal: Nova Automação

- **Dados gerais:** nome, código, descrição, módulo, categoria, responsável, estado
- **Gatilho:** tipo de gatilho, módulo de origem, entidade, evento, campo monitorizado, frequência, data de início, data de fim
- **Condições:** condição principal, condições adicionais, operador lógico (E/OU), campo, operador, valor, grupo de condições
- **Ações:** ação principal, ações adicionais, módulo de destino, destinatário, responsável, prioridade, prazo, mensagem, template
- **Agendamento:** execução imediata, execução programada, frequência, periodicidade, dia, hora, fuso horário, data de início, data de fim
- **Notificações:** enviar notificação, enviar e-mail, destinatários, assunto, mensagem, template, lembrete, número de tentativas
- **Execução:** permitir execução única, permitir múltiplas execuções, limite de execuções, intervalo entre tentativas, comportamento em caso de erro
- **Estado:** rascunho, ativa, inativa, pausada

---

## Ao abrir uma Automação

**Abas:** Resumo, Gatilho, Condições, Ações, Execuções, Histórico

- **Resumo:** nome, código, descrição, módulo, estado, responsável, última execução, próxima execução, total de execuções, execuções com sucesso, execuções com erro
- **Gatilho:** evento, módulo, entidade, condição de disparo, frequência, agendamento
- **Condições:** condições configuradas, regras, operadores, valores, lógica E/OU
- **Ações:** ações configuradas, ordem de execução, destinatários, módulos afetados, mensagens, tarefas
- **Execuções:** data/hora, gatilho, resultado, ações executadas, duração, estado, erro
- **Histórico:** criação, alterações, ativação, desativação, pausa, alteração de condições, alteração de ações, alterações de versão, responsável, data/hora

---

## Ações principais

Nova automação, editar, duplicar, ativar, desativar, pausar, retomar, testar, executar manualmente, visualizar execução, consultar logs, duplicar versão, criar a partir de modelo, alterar responsável, exportar, eliminar.
