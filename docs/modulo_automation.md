# Especificação funcional — Módulo Automation da INNOVA

O módulo **Automation (Automações)** da INNOVA deve funcionar como o centro de gestão de processos automáticos de toda a plataforma. O seu objectivo é permitir que a INNOVA execute tarefas, desencadeie acções, envie notificações, actualize estados e coordene fluxos de aprovação sem exigir intervenção manual em cada etapa.

A regra fundamental é: **todos os módulos da INNOVA devem poder desencadear ou receber automações**, respeitando as permissões, as regras de negócio e as configurações de cada módulo.

O módulo Automation não deve duplicar as funcionalidades dos módulos existentes. Deve coordená-los através de regras, eventos e acções.

---

## 1. Estrutura principal do módulo

| # | Aba | Descrição |
|---|---|---|
| 1 | Visão Geral | Painel de controlo das automações, execuções, falhas, tarefas pendentes e indicadores de desempenho. |
| 2 | Todas as Automações | Lista de regras automáticas criadas, com estado, módulo de origem, responsável e última execução. |
| 3 | Construtor de Fluxos | Editor visual para configurar gatilhos, condições, acções, aprovações, atrasos e ramificações. |
| 4 | Agendamentos | Execuções programadas por data, hora, periodicidade ou calendário de trabalho. |
| 5 | Histórico de Execuções | Registo detalhado das automações executadas, resultados, erros, duração e tentativas. |
| 6 | Aprovações e Tarefas | Acompanhamento de etapas que dependem de validação humana antes de prosseguir. |
| 7 | Relatórios | Indicadores de execução, taxas de sucesso, falhas, tempo poupado e automações mais utilizadas. |
| 8 | Configurações | Permissões, limites de execução, políticas de repetição, alertas, integrações e segurança. |

---

## 2. Visão Geral — Dashboard

O dashboard deve apresentar os principais indicadores numa primeira linha de cards.

| Card | Descrição |
|---|---|
| Total de automações | Todas as regras registadas. |
| Automações activas | Regras habilitadas para execução. |
| Execuções no período | Execuções iniciadas no intervalo seleccionado. |
| Execuções com falha | Erros que exigem análise ou nova tentativa. |
| A aguardar | Aprovações, tarefas e execuções pendentes. |
| Tempo poupado | Estimativa baseada no tempo manual configurado por tarefa. |

### Gráficos recomendados

- **Execuções ao longo do tempo:** gráfico de linhas por dia, semana ou mês.
- **Execuções por estado:** gráfico de barras ou anel para sucesso, falha, cancelamento e pendência.
- **Automações por módulo:** gráfico de barras para comparar a utilização entre os módulos da INNOVA.
- **Taxa de sucesso:** evolução percentual das execuções concluídas sem erro.
- **Principais causas de falha:** barras por categoria de erro.

Os indicadores devem aceitar filtros por período, módulo, unidade, departamento e estado, de acordo com as permissões do utilizador.

---

## 3. Todas as Automações — dados da tabela

A tabela principal deve conter os seguintes campos:

| Campo | Descrição |
|---|---|
| Nome | Nome identificativo da automação |
| Código | Identificador único |
| Descrição | Objectivo da regra |
| Módulo de origem | Módulo que desencadeia o processo |
| Módulos envolvidos | Módulos afectados pelas acções |
| Categoria | Notificação, aprovação, actualização, agendamento, integração, entre outras |
| Gatilho | Evento ou condição que inicia a automação |
| Responsável | Utilizador que criou ou gere a regra |
| Unidade/Departamento | Âmbito organizacional, quando aplicável |
| Estado | Rascunho, activa, pausada, desactivada ou com erro |
| Última execução | Data e hora da execução mais recente |
| Próxima execução | Data e hora previstas, quando aplicável |
| Taxa de sucesso | Percentagem de execuções concluídas com sucesso |
| Data de criação | Registo inicial |
| Última actualização | Data da última alteração |

### Filtros

- Pesquisa por nome ou código.
- Módulo.
- Categoria.
- Estado.
- Responsável.
- Unidade e departamento.
- Período de criação.
- Período da última execução.
- Com falhas.
- Com aprovações pendentes.

### Acções disponíveis

- Ver detalhes.
- Criar automação.
- Editar.
- Duplicar.
- Activar ou pausar.
- Executar teste.
- Executar manualmente, quando permitido.
- Consultar histórico.
- Ver erros.
- Exportar listagem.
- Eliminar, respeitando as regras de auditoria e retenção.

> A opção **Executar manualmente** deve exigir confirmação e validação das condições, sobretudo quando a automação altera dados ou desencadeia comunicações externas.

---

## 4. Construtor de Fluxos — Criar nova automação

Ao clicar em **Nova automação**, deve abrir uma página ou modal amplo com secções organizadas. Para a INNOVA, recomendo uma **página dedicada**, porque os fluxos podem envolver vários módulos e muitas condições.

*Nova automação — estado: Rascunho. Configuração funcional de exemplo — os campos abaixo representam a estrutura recomendada.*

### A. Informações gerais

- Nome da automação \*
- Código automático
- Descrição e finalidade \*
- Categoria
- Módulo principal \*
- Responsável pela automação \*
- Unidade e departamentos abrangidos
- Prioridade: baixa, normal, alta ou crítica
- Etiquetas

### B. Gatilho — Quando deve começar?

- Quando um registo é criado.
- Quando um registo é actualizado.
- Quando o estado muda.
- Quando uma data se aproxima.
- Quando uma condição é satisfeita.
- Quando uma tarefa ou aprovação termina.
- Quando chega um evento de outro módulo.
- Em data e hora programadas.
- Por execução manual autorizada.

### C. Condições — Em que circunstâncias?

- Campo a verificar.
- Operador: igual, diferente, maior que, menor que, contém, está vazio.
- Valor esperado.
- Combinação de condições com E / OU.
- Condições sobre dados de outros módulos, respeitando as permissões.

### D. Acções — O que deve acontecer?

- Enviar notificação interna.
- Enviar e-mail.
- Criar uma tarefa.
- Solicitar aprovação.
- Actualizar um registo.
- Alterar o estado de um processo.
- Criar um registo relacionado noutro módulo.
- Gerar documento ou relatório.
- Invocar um endpoint de API autorizado.
- Executar outra automação.

### E. Regras de execução

- Executar imediatamente ou com atraso.
- Definir prazo máximo.
- Definir tentativas em caso de falha.
- Definir intervalo entre tentativas.
- Escolher o comportamento em caso de erro.
- Definir acção alternativa e destinatário do alerta.
- Impedir execuções duplicadas.
- Definir limites para evitar ciclos infinitos.

### F. Validação e publicação

- Validar campos e permissões.
- Testar com dados de exemplo.
- Visualizar o fluxo completo.
- Guardar como rascunho.
- Submeter para aprovação, se necessário.
- Activar ou publicar.
- Registar a versão e o autor da publicação.

### Como deve funcionar o fluxo visual?

```text
Gatilho
Ex.: uma formação aproxima-se da data de início
        ↓
Condições
A formação está activa e tem participantes inscritos?
        ↓                                   ↓
      Sim                                 Não
Notificar participantes             Criar tarefa de verificação
e formador                          para o responsável
        ↓                                   ↓
Registar resultado
Guardar execução e resultado no histórico
```

O editor deve permitir adicionar, remover, reordenar e ligar blocos, bem como configurar ramificações, atrasos e etapas de aprovação.

---

## 5. Integração com todos os módulos da INNOVA

A integração deve funcionar por **eventos**. Cada módulo publica acontecimentos relevantes e o Automation decide se deve executar uma regra associada. As acções realizadas devem voltar a respeitar as regras do módulo de destino.

A tabela seguinte é uma especificação funcional proposta para a INNOVA, não uma afirmação de que todos estes eventos já existem no backend.

| Módulo | Eventos que podem desencadear automações | Acções automáticas possíveis |
|---|---|---|
| Users | Novo utilizador, alteração de perfil, conta desactivada | Notificar, iniciar onboarding, ajustar tarefas de acesso |
| Departments | Departamento criado, alterado ou desactivado | Actualizar circuitos de aprovação e responsáveis |
| Organization | Alteração da estrutura organizacional | Actualizar destinatários e regras organizacionais |
| Roles / Permissions | Alteração de função ou permissão | Solicitar validação, registar auditoria e alertar administradores |
| Courses | Curso publicado, actualizado ou concluído | Notificar inscritos, gerar tarefas e actualizar estados relacionados |
| Course Modules / Lessons | Aula publicada, conteúdo actualizado | Informar participantes e disponibilizar conteúdos |
| Learning Paths | Percurso atribuído, etapa concluída | Libertar a etapa seguinte e actualizar progresso |
| Enrollments | Inscrição criada, aprovada ou cancelada | Notificar participante, gestor e formador |
| Assessments / Evaluation | Avaliação submetida, prazo atingido | Solicitar correcção, alertar avaliador e actualizar o estado |
| Competencies | Competência avaliada ou nível alterado | Sugerir formação ou criar acção de desenvolvimento |
| Performance | Avaliação iniciada, concluída ou abaixo de um limiar definido | Notificar intervenientes e criar tarefas de acompanhamento |
| Evaluation 360º | Ciclo aberto, feedback em falta, ciclo encerrado | Enviar convites, lembretes e avisos de conclusão |
| Development Plans / PDI | Plano aprovado, acção atrasada, objectivo concluído | Alertar colaborador e gestor, actualizar acompanhamento |
| Talent Development | Identificação de necessidade de desenvolvimento | Criar proposta de plano ou tarefa de acompanhamento |
| Career Plans | Plano de carreira criado ou etapa concluída | Notificar colaborador e responsável, agendar revisão |
| Succession | Plano de sucessão revisto ou actualizado | Solicitar validação e notificar responsáveis autorizados |
| Onboarding | Novo colaborador, etapa pendente ou concluída | Criar tarefas, atribuir conteúdos e enviar lembretes |
| Attendance | Falta, atraso, presença registada ou assiduidade abaixo do limite | Alertar responsáveis e encaminhar para validação |
| Trainings | Formação agendada, turma alterada, sessão próxima | Notificar participantes, formadores e logística |
| Training Sessions | Sessão concluída, presença apurada | Actualizar assiduidade e encaminhar dados para avaliação |
| Leave / Férias e Licenças | Pedido submetido, aprovado ou recusado | Encaminhar aprovação, notificar colaborador e actualizar calendário |
| Payroll & Payslips | Processamento concluído, recibo disponibilizado | Notificar colaborador e gerar alertas de processamento |
| Work Declaration | Declaração solicitada, assinatura pendente ou documento emitido | Encaminhar assinatura e notificar intervenientes |
| Document Repository / Biblioteca | Documento publicado, revisto ou próximo do vencimento | Notificar públicos autorizados e solicitar revisão |
| Knowledge | Novo conteúdo ou revisão publicada | Notificar públicos relevantes e criar tarefas de leitura |
| Micro-learning | Microcurso atribuído, concluído ou em atraso | Enviar lembretes e actualizar o progresso |
| Content Library | Conteúdo publicado, substituído ou arquivado | Informar utilizadores abrangidos e manter referências actualizadas |
| Avatar Training | Formação com avatar criada, iniciada ou concluída | Notificar participantes e encaminhar resultados para o AI Tutor, quando aplicável |
| AI Tutor | Pedido de apoio, actividade concluída ou necessidade identificada | Sugerir conteúdo ou encaminhar uma tarefa para acompanhamento, com regras definidas |
| Instructor / Formadores | Formador atribuído, indisponibilidade ou tarefa pendente | Notificar, solicitar substituição ou encaminhar validação |
| Events | Evento criado, alterado ou próximo | Enviar convites, lembretes e notificações |
| Processes | Processo iniciado, etapa bloqueada ou prazo ultrapassado | Encaminhar etapa, escalar pendência e actualizar estado |
| Integrations / API | Webhook recebido, sincronização concluída ou falhada | Executar fluxo, repetir sincronização ou alertar suporte |
| Notifications | Notificação pendente ou falha de entrega | Reencaminhar ou registar falha, segundo a política configurada |
| History / Audit | Acção relevante registada | Acrescentar eventos de auditoria relacionados com a automação |
| Executive Reports | Relatório disponível ou período de fecho atingido | Preparar actualização e notificar destinatários autorizados |
| Analytics / Dashboard RH | Indicador ultrapassa um limite configurado | Emitir alerta ou criar tarefa de análise |
| Engagement | Inquérito aberto, prazo próximo ou respostas abaixo do objectivo | Enviar convites e lembretes |
| CRM — Beneficiários, Parceiros e Financiadores | Registo criado, compromisso actualizado ou prazo próximo | Notificar responsáveis e gerar tarefas de acompanhamento |
| Automações | Execução falhada, fluxo bloqueado ou regra alterada | Alertar administradores e iniciar recuperação controlada |

Os módulos de relatórios, dashboards e histórico podem consumir eventos e resultados das automações. Isso não significa que devam desencadear fluxos a cada simples visualização de página ou consulta de dados.

### Regras de integração obrigatórias

1. Cada evento deve ter um identificador único, módulo de origem, tipo de evento, data/hora e referência ao registo afectado.
2. As automações devem conseguir consultar apenas os dados necessários e autorizados.
3. O módulo de destino deve validar novamente os dados e as regras de negócio antes de aceitar uma alteração.
4. Alterações relevantes devem ser registadas no histórico central, identificando a automação responsável.
5. A integração deve evitar ciclos, duplicação de eventos e execução repetida da mesma acção.
6. Quando um módulo ainda não disponibilizar os eventos necessários, a integração deve ser implementada no backend desse módulo, não simulada apenas no frontend.

---

## 6. Agendamentos

Cada agendamento deve guardar:

- Nome e automação associada.
- Tipo: único, diário, semanal, mensal ou personalizado.
- Data de início e, opcionalmente, de fim.
- Hora e fuso horário.
- Dias da semana ou dia do mês.
- Próxima execução calculada.
- Estado: activo, pausado, concluído ou com erro.
- Última execução e respectivo resultado.
- Política para execuções perdidas durante períodos de indisponibilidade.
- Responsável pela configuração.

**Exemplos:** lembretes de formação 24 horas antes, alerta de acções de PDI atrasadas todas as segundas-feiras e notificação de documentos próximos do vencimento.

---

## 7. Histórico de Execuções

Cada execução deve gerar um registo com os seguintes dados:

| Campo | Finalidade |
|---|---|
| ID da execução | Identificador único |
| Automação e versão | Regra exacta que foi executada |
| Evento de origem | Acontecimento que iniciou a execução |
| Data de início e fim | Medição temporal |
| Estado | Na fila, em execução, sucesso, falha, cancelada ou a aguardar |
| Etapa actual | Bloco do fluxo em processamento |
| Acções realizadas | Operações tentadas e respectivos resultados |
| Registos afectados | Referências aos registos envolvidos |
| Número de tentativas | Controlo de repetições |
| Erro | Código, mensagem e etapa em que ocorreu |
| Responsável/contexto de execução | Utilizador ou conta técnica que iniciou o fluxo |
| Correlação | Identificadores para relacionar eventos entre módulos |

Deve ser possível abrir uma execução e consultar o resultado de cada etapa, a duração, as acções realizadas e os erros, ocultando palavras-passe, tokens e outros dados sensíveis. O histórico de execução e a auditoria administrativa são essenciais para investigar falhas.

### Estados de execução

- **Na fila:** aguarda processamento.
- **Em execução:** está a processar as etapas.
- **A aguardar aprovação:** depende de intervenção humana.
- **Concluída:** terminou com sucesso.
- **Falhada:** terminou com erro não recuperado.
- **Repetição agendada:** aguarda nova tentativa.
- **Cancelada:** interrompida por utilizador autorizado ou política do sistema.

---

## 8. Aprovações e tarefas

Esta secção deve permitir acompanhar as acções que não podem ser totalmente automáticas.

### Dados necessários

- Título e descrição da tarefa.
- Automação e processo de origem.
- Módulo e registo relacionados.
- Aprovador ou responsável.
- Data de criação e prazo.
- Prioridade.
- Estado: pendente, aprovada, recusada, concluída, cancelada ou expirada.
- Comentário e justificação da decisão.
- Histórico de alterações.
- Regras de substituição ou escalonamento.

> Uma automação pode solicitar uma aprovação, mas não deve aprovar automaticamente uma decisão que exija validação humana, salvo se existir uma regra de negócio expressamente autorizada para esse efeito.

---

## 9. Relatórios e indicadores

O módulo deve disponibilizar relatórios filtráveis e exportáveis:

- Execuções por período, módulo e estado.
- Taxa de sucesso e taxa de falha.
- Tempo médio de execução.
- Automações com mais falhas.
- Erros por tipo e por módulo.
- Execuções pendentes ou bloqueadas.
- Aprovações dentro e fora do prazo.
- Volume de acções automáticas por departamento.
- Tempo manual potencialmente poupado.
- Evolução da utilização das automações.
- Histórico de activação, alteração e desactivação das regras.

O tempo poupado deve ser identificado como **estimativa**, calculada a partir de parâmetros definidos e não como uma medição exacta.

---

## 10. Configurações, segurança e controlo

O módulo deve incluir:

- Permissões por perfil: consultar, criar, editar, testar, activar, executar, cancelar e eliminar.
- Limitação do acesso por unidade e departamento.
- Aprovação de publicação para automações críticas.
- Versionamento das regras.
- Registo de quem alterou cada configuração e quando.
- Gestão segura de credenciais e segredos de API.
- Limites de frequência e de concorrência.
- Protecção contra ciclos infinitos.
- Controlo de duplicação de eventos.
- Tentativas automáticas com intervalos configuráveis.
- Alertas após falhas persistentes.
- Política de retenção e arquivo do histórico.
- Protecção de dados pessoais nos registos de execução.
- Possibilidade de pausar uma automação sem apagar a sua configuração.

Estas medidas seguem práticas documentadas para fluxos de trabalho, como controlo de privilégios, gestão de segredos, auditoria, testes e tratamento de erros.

---

## 11. Modelos de automação pré-configurados

Para facilitar a utilização, a INNOVA deve oferecer modelos prontos a configurar:

| Modelo | Área |
|---|---|
| Onboarding automático de novo colaborador | RH |
| Lembrete de formação antes da sessão | Formação |
| Alerta de falta ou atraso | Assiduidade |
| Notificação de avaliação pendente | Desempenho |
| Alerta de acção de desenvolvimento atrasada | PDI |
| Encaminhamento de pedido para aprovação | Férias |
| Aviso de documento próximo do vencimento | Documentos |
| Notificação de recibo de vencimento disponível | Payroll |
| Escalonamento de etapa fora do prazo | Processos |
| Alerta de sincronização falhada | Integrações |
| Alerta de falhas repetidas numa automação | Administração |

Cada modelo deve incluir uma descrição, o gatilho, as condições, as acções, os módulos envolvidos e os campos que o administrador precisa de configurar antes de activar.

---

## 12. Estrutura técnica recomendada para o backend NestJS + Prisma

Para a INNOVA, recomendo separar a definição da automação da execução efectiva. Não se deve executar todo o fluxo directamente no pedido HTTP que regista um evento.

| Entidade | Responsabilidade |
|---|---|
| `Automation` | Definição, estado e configuração geral |
| `AutomationVersion` | Versões publicadas da regra |
| `AutomationTrigger` | Evento, agendamento ou condição de início |
| `AutomationCondition` | Regras de decisão |
| `AutomationAction` | Acções e parâmetros configurados |
| `AutomationExecution` | Registo de cada execução |
| `AutomationExecutionStep` | Resultado individual de cada etapa |
| `AutomationSchedule` | Configuração dos agendamentos |
| `AutomationApproval` | Aprovações humanas necessárias |
| `AutomationTask` | Tarefas geradas pelo fluxo |
| `AutomationTemplate` | Modelos reutilizáveis |
| `AutomationConnection` | Configuração de integrações autorizadas |
| `AutomationAuditLog` | Auditoria de alterações e operações |
| `AutomationDeadLetter` | Eventos que falharam após as tentativas permitidas |

Estes são nomes de entidades propostos; a implementação deve verificar o `schema.prisma` actual para evitar duplicar modelos já existentes.

### Arquitectura de execução

O backend deve processar os eventos de forma assíncrona, com controlo de duplicados, repetição segura, isolamento de erros e monitorização. Uma fila de eventos, como BullMQ com Redis, é uma opção a avaliar para o ambiente NestJS, tendo em conta a infraestrutura existente. A execução deve usar transacções quando necessário e garantir que uma falha num módulo não deixa silenciosamente os restantes módulos num estado inconsistente.

---

## 13. Critérios de aceitação antes de considerar o módulo concluído

- É possível criar, editar, duplicar, testar, activar e pausar automações.
- É possível configurar gatilhos, condições e várias acções.
- Os módulos integrados conseguem publicar e consumir eventos.
- Os fluxos entre módulos respeitam as permissões e validações do backend.
- As automações agendadas são executadas na hora configurada.
- As falhas ficam registadas e podem ser investigadas.
- As novas tentativas não duplicam acções já concluídas.
- Existem mecanismos de prevenção de ciclos infinitos.
- As aprovações humanas bloqueiam o fluxo até à decisão.
- As alterações às regras ficam auditadas e versionadas.
- As credenciais e os dados sensíveis não aparecem nos logs.
- O dashboard e os relatórios reflectem dados reais do backend.
- Existem testes unitários, de integração e de permissões.
- As execuções são monitorizadas em produção.

> **Recomendação de implementação:** desenvolver primeiro o motor de eventos, as definições de automação, as execuções e o histórico. Em seguida, integrar os módulos prioritários — Users, Onboarding, Trainings, Attendance, Leave, Development Plans, Payroll e Processes — e só depois expandir para os restantes módulos. Assim, a INNOVA ganha uma base de automação reutilizável em vez de implementar regras isoladas em cada módulo.
