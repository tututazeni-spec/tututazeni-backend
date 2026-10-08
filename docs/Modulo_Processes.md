# Módulo Processes — INNOVA

*Especificação funcional e estrutural • Academia Corporativa e Gestão de Recursos Humanos*

O módulo **Processes (Gestão de Processos)** da INNOVA deve funcionar como o centro de controlo dos processos de negócio da plataforma, permitindo criar, documentar, executar, acompanhar, aprovar e auditar os processos de RH, formação, administração e desenvolvimento de pessoas.

A ideia principal é que a INNOVA não tenha apenas módulos isolados: os processos devem conseguir **ligar vários módulos numa única sequência de trabalho**, com responsáveis, prazos, aprovações, documentos, notificações e histórico.

Por exemplo, o processo de integração de um novo colaborador pode começar em `Users`, passar por `Departments`, `Organization`, `Document Repository`, `Onboarding`, `Trainings` e `AI Tutor`, terminando com a confirmação de conclusão do plano de integração.

---

## 1. Objetivos do módulo

- Centralizar os processos operacionais e administrativos da INNOVA.
- Permitir criar processos padronizados e reutilizáveis.
- Automatizar etapas, tarefas, aprovações e notificações.
- Integrar os processos com todos os módulos da plataforma.
- Definir responsáveis, substitutos, prazos e níveis de autorização.
- Monitorizar o estado, os atrasos, os bloqueios e o cumprimento dos processos.
- Manter um registo de auditoria completo de todas as operações.
- Reduzir tarefas manuais, duplicação de dados e erros administrativos.

---

## 2. Estrutura do menu e das abas

| # | Aba | Descrição |
|---|---|---|
| 01 | Visão Geral | Indicadores, alertas e resumo dos processos. |
| 02 | Todos os Processos | Lista centralizada dos processos existentes. |
| 03 | Modelos de Processos | Criação e gestão de modelos reutilizáveis. |
| 04 | Tarefas e Etapas | Execução, atribuição e acompanhamento das tarefas. |
| 05 | Aprovações | Pedidos pendentes de validação ou decisão. |
| 06 | Fluxos de Trabalho | Desenho das etapas, regras e transições. |
| 07 | Automações | Regras automáticas, condições e ações. |
| 08 | Calendário e Prazos | Datas-limite, vencimentos e tarefas agendadas. |
| 09 | Documentos | Documentos, formulários e anexos associados. |
| 10 | Indicadores e Relatórios | Tempos, volumes, atrasos e níveis de cumprimento. |
| 11 | Histórico e Auditoria | Registo cronológico das alterações e decisões. |
| 12 | Configurações | Permissões, prioridades, estados e regras gerais. |

---

## 3. Aba Visão Geral — Dashboard

Deve apresentar indicadores actualizados a partir dos processos e tarefas registados na INNOVA.

| Indicador | Descrição |
|---|---|
| Total de processos | Processos criados e registados. |
| Em execução | Processos actualmente activos. |
| Em atraso | Processos ou etapas fora do prazo. |
| Concluídos | Processos finalizados no período. |
| Aprovações pendentes | Decisões à espera de responsáveis. |
| Tempo médio | Duração média até à conclusão. |

### Gráficos recomendados

- Processos por estado — gráfico de barras ou rosca.
- Processos criados versus concluídos — gráfico de linhas.
- Processos por departamento — gráfico de barras horizontais.
- Processos por módulo de origem — gráfico de barras.
- Tempo médio de conclusão por tipo de processo — gráfico de barras.
- Evolução da taxa de conclusão dentro do prazo — gráfico de linhas.
- Etapas com maior número de atrasos — gráfico de barras horizontais.
- Distribuição da carga de trabalho por responsável — gráfico de barras.

Todos os indicadores devem permitir filtrar por período, unidade, departamento, responsável, tipo de processo e estado.

---

## 4. Aba Todos os Processos

Esta é a lista central de todas as instâncias de processos em execução ou já terminadas.

### Dados que cada registo deve conter

| Campo | Descrição |
|---|---|
| Código | Identificador único, por exemplo, `PROC-2026-0001`. |
| Nome | Nome do processo. |
| Tipo | RH, formação, financeiro, documental, administrativo, etc. |
| Módulo de origem | Módulo que iniciou o processo. |
| Entidade associada | Colaborador, curso, departamento, pedido ou documento relacionado. |
| Unidade | Unidade organizacional responsável. |
| Departamento | Departamento associado. |
| Solicitante | Utilizador que iniciou o processo. |
| Responsável actual | Pessoa ou equipa responsável pela etapa actual. |
| Prioridade | Baixa, normal, alta ou urgente. |
| Estado | Estado actual do processo. |
| Progresso | Percentagem de etapas concluídas. |
| Data de criação | Data e hora de abertura. |
| Data de início | Data de início efectivo. |
| Prazo final | Data-limite para conclusão. |
| Última actualização | Data da última alteração. |
| Tempo decorrido | Tempo desde o início. |
| Tempo restante | Tempo até ao prazo final. |
| Situação do prazo | Dentro do prazo, em risco ou atrasado. |

### Filtros

- Pesquisa por código, nome ou entidade.
- Estado e prioridade.
- Módulo de origem.
- Departamento e unidade.
- Solicitante e responsável.
- Período de criação e prazo final.
- Processos atrasados ou próximos do vencimento.
- Tipo de processo e modelo utilizado.

### Acções disponíveis

- Ver detalhes.
- Criar processo.
- Editar, quando permitido.
- Atribuir ou reatribuir responsável.
- Alterar prioridade.
- Suspender ou retomar.
- Cancelar com justificação.
- Duplicar a partir de um modelo.
- Consultar histórico.
- Exportar resultados.
- Arquivar processos concluídos.

> A edição de um processo em execução não deve alterar silenciosamente as etapas já concluídas nem apagar o histórico anterior.

---

## 5. Aba Modelos de Processos

Permite criar modelos reutilizáveis, evitando que cada departamento tenha de configurar novamente o mesmo procedimento.

### Dados do modelo

- Nome do modelo.
- Código do modelo.
- Descrição e finalidade.
- Categoria e tipo.
- Departamento proprietário.
- Módulo ou módulos envolvidos.
- Responsável pelo modelo.
- Versão actual.
- Estado: rascunho, em revisão, publicado ou arquivado.
- Data de criação e actualização.
- Data de entrada em vigor.
- Política de revisão.
- Nível de confidencialidade.
- Regras de acesso.
- Documentos e formulários necessários.
- Prazo padrão.
- Regras de aprovação.
- Condições para iniciar e concluir.

### Acções

- Criar modelo.
- Editar e guardar rascunho.
- Configurar etapas.
- Definir responsáveis e aprovações.
- Testar o fluxo.
- Submeter para aprovação.
- Publicar nova versão.
- Duplicar modelo.
- Desactivar ou arquivar.
- Consultar versões anteriores.

> **Regra importante:** cada execução deve guardar a versão do modelo utilizada. A alteração posterior de um modelo não deve modificar automaticamente processos que já estão em andamento.

---

## 6. Aba Tarefas e Etapas

Cada processo deve ser dividido em etapas e tarefas executáveis.

### Dados de cada tarefa

| Campo | Descrição |
|---|---|
| Código da tarefa | Identificador único. |
| Nome | Acção a realizar. |
| Processo associado | Processo a que pertence. |
| Etapa | Fase em que se encontra. |
| Descrição | Instruções para o responsável. |
| Responsável | Utilizador, função ou equipa. |
| Revisor | Pessoa que verifica a execução, quando aplicável. |
| Data de atribuição | Quando foi atribuída. |
| Data de início | Quando começou. |
| Prazo | Data-limite. |
| Estado | Pendente, em curso, bloqueada, concluída ou cancelada. |
| Dependências | Tarefas que precisam de ser concluídas primeiro. |
| Evidências | Documentos, comentários ou registos de execução. |
| Resultado | Informação sobre o trabalho realizado. |
| Data de conclusão | Quando foi finalizada. |

### Funcionalidades

- Atribuição automática ou manual.
- Dependências entre tarefas.
- Tarefas sequenciais ou paralelas.
- Lista de verificação.
- Subtarefas.
- Comentários e menções.
- Anexos e evidências.
- Pedido de esclarecimento.
- Devolução para correcção.
- Bloqueio por falta de informação.
- Lembretes e escalonamento.
- Reabertura mediante permissão.

Uma tarefa só deve ser considerada concluída quando os requisitos obrigatórios estiverem satisfeitos.

---

## 7. Aba Aprovações

Centraliza todas as decisões necessárias nos processos da INNOVA, sem substituir os registos próprios dos módulos de origem.

### Campos de cada aprovação

- Código do pedido de aprovação.
- Processo e etapa associados.
- Entidade e módulo de origem.
- Solicitante.
- Aprovador designado.
- Função e nível de autorização.
- Data de submissão.
- Prazo para decisão.
- Estado da aprovação.
- Documentos e versão analisada.
- Comentários do solicitante.
- Decisão tomada.
- Justificação da decisão.
- Data e hora da decisão.
- Próxima etapa.
- Responsável pela execução após aprovação.

### Decisões possíveis

- Aprovar.
- Rejeitar.
- Devolver para correcção.
- Solicitar informação adicional.
- Delegar, se autorizado.
- Escalar para um nível superior.

### Regras essenciais

1. O sistema deve validar se o aprovador tem autorização para aquela decisão.
2. Os fluxos podem exigir várias aprovações sequenciais ou em paralelo.
3. Uma rejeição deve seguir a regra definida no modelo.
4. Uma aprovação não significa que a tarefa operacional seguinte já foi concluída.
5. Toda a decisão deve guardar o autor, a data, a justificação e a versão dos dados analisados.
6. O sistema deve impedir que um utilizador aprove uma solicitação própria quando as regras de segregação de funções o proíbam.

A distinção entre a decisão e a execução posterior é importante para manter a rastreabilidade.

---

## 8. Aba Fluxos de Trabalho

Deve permitir desenhar visualmente o percurso de um processo, com blocos ligados entre si.

### Elementos do construtor de fluxos

- Início do processo.
- Formulário de entrada.
- Tarefa manual.
- Aprovação.
- Condição lógica.
- Ramificação do fluxo.
- Tarefas paralelas.
- Espera por evento.
- Temporizador.
- Integração com outro módulo.
- Acção automática.
- Notificação.
- Geração de documento.
- Fim do processo.

### Propriedades configuráveis de cada etapa

- Nome e descrição.
- Tipo de etapa.
- Responsável ou regra de atribuição.
- Prazo e calendário aplicável.
- Condições de entrada.
- Condições para avançar.
- Dados obrigatórios.
- Aprovações necessárias.
- Acções de sucesso.
- Acções em caso de falha.
- Regras de devolução e repetição.
- Política de escalonamento.

### Exemplo de fluxo

```text
1. Pedido criado
   Users / Leave / Trainings / outro módulo
        ↓
2. Validar dados
   Verificar campos e documentos obrigatórios
        ↓
3. Aprovação
   Aplicar matriz de autorização
        ↓
4. Verificar decisão
   Aprovado, rejeitado ou devolvido
        ↓                         ↓
   Aprovado                   Rejeitado
   Executar a acção no        Registar motivo e aplicar
   módulo de origem           regra de encerramento
        ↓                         ↓
5. Histórico e encerramento
   Guardar resultado, evidências e eventos
```

O construtor deve permitir testar o fluxo antes de o publicar e validar ciclos infinitos, etapas sem responsável e condições sem saída.

---

## 9. Aba Automações

Esta aba gere as regras automáticas dos processos. Deve estar integrada com o módulo `Automações` da INNOVA, sem criar um motor de automação duplicado.

### Campos de uma regra

- Nome e descrição.
- Código.
- Evento desencadeador.
- Módulo e entidade de origem.
- Condições de execução.
- Acção a executar.
- Destinatários.
- Prioridade.
- Data de activação e expiração.
- Estado activo/inactivo.
- Frequência, quando aplicável.
- Limite de tentativas.
- Política de repetição.
- Tratamento de erros.
- Última execução.
- Resultado da última execução.
- Registo de execuções.

### Exemplos

- Quando um processo é criado, atribuir o responsável inicial.
- Quando uma tarefa fica próxima do prazo, enviar um lembrete.
- Quando uma aprovação é concluída, desbloquear a etapa seguinte.
- Quando um colaborador é admitido, iniciar o processo de onboarding.
- Quando uma formação termina, iniciar o fluxo de avaliação.
- Quando uma tarefa fica atrasada, notificar o responsável e o gestor, de acordo com as regras.
- Quando um documento é aprovado, actualizar o estado correspondente no repositório.
- Quando uma integração falha, registar o erro e activar uma nova tentativa.

As automações que alteram dados importantes devem validar permissões, evitar execuções duplicadas e registar o resultado de cada tentativa.

---

## 10. Aba Calendário e Prazos

Deve apresentar as actividades dos processos numa vista de calendário, lista e cronograma.

### Dados apresentados

- Nome do processo e tarefa.
- Responsável.
- Data de início.
- Prazo final.
- Duração prevista.
- Estado.
- Prioridade.
- Dependências.
- Data de aprovação prevista.
- Data real de conclusão.

### Funcionalidades

- Vistas diária, semanal, mensal e cronograma.
- Filtros por departamento, unidade e responsável.
- Identificação de tarefas em atraso.
- Alertas de prazos próximos.
- Reagendamento autorizado.
- Visualização de dependências.
- Detecção de conflitos de atribuição.
- Integração com calendários, quando disponível.

A alteração de um prazo deve guardar o prazo anterior, o novo prazo, o autor e a justificação.

---

## 11. Aba Documentos

Esta aba deve integrar-se directamente com `Document Repository` e `Biblioteca`.

### Informações a registar

- Nome do documento.
- Tipo documental.
- Processo e etapa associados.
- Entidade relacionada.
- Identificador do documento.
- Versão.
- Autor ou emissor.
- Data de emissão.
- Data de validade.
- Estado de validação.
- Responsável pela aprovação.
- Nível de confidencialidade.
- Permissões de consulta.
- Ficheiro ou referência ao repositório.
- Assinatura, quando aplicável.
- Histórico de versões.

### Funcionalidades

- Anexar documentos existentes.
- Gerar documentos a partir de modelos.
- Solicitar documentos em falta.
- Validar anexos obrigatórios.
- Submeter documentos para aprovação.
- Consultar versões anteriores.
- Controlar validade e renovação.
- Arquivar de acordo com as regras de retenção.

Não deve duplicar desnecessariamente os ficheiros: o processo deve guardar referências aos documentos no repositório central, respeitando as permissões de acesso.

---

## 12. Aba Indicadores e Relatórios

Esta área é destinada à análise operacional e à gestão dos processos.

| Indicador | O que mede |
|---|---|
| Taxa de conclusão | Percentagem de processos concluídos no período. |
| Taxa de cumprimento de prazo | Processos concluídos dentro do prazo aplicável. |
| Tempo médio de conclusão | Duração entre início e conclusão. |
| Tempo médio por etapa | Duração média de cada fase. |
| Taxa de rejeição | Processos ou pedidos rejeitados. |
| Taxa de devolução | Processos devolvidos para correcção. |
| Volume de processos | Processos iniciados num período. |
| Backlog | Processos e tarefas ainda por resolver. |
| Processos em atraso | Instâncias cujo prazo foi ultrapassado. |
| Aprovações pendentes | Decisões ainda não tomadas. |
| Taxa de reabertura | Processos reabertos após conclusão. |
| Carga por responsável | Tarefas atribuídas e pendentes por pessoa. |
| Falhas de automação | Execuções automáticas com erro. |

Os relatórios devem permitir filtrar, agrupar, consultar os registos que originaram os indicadores e exportar resultados para Excel ou PDF, conforme as permissões.

As métricas devem ter definições claras. Por exemplo, o tempo médio de conclusão deve indicar se exclui processos cancelados ou suspensos.

---

## 13. Aba Histórico e Auditoria

Deve existir um registo cronológico, consultável e protegido contra alterações indevidas.

### Dados de cada evento

- Identificador do evento.
- Processo e tarefa associados.
- Utilizador ou serviço que executou a acção.
- Função e contexto de autorização.
- Tipo de evento.
- Data e hora.
- Origem da acção: interface, API ou automação.
- Estado anterior e novo estado.
- Alterações efectuadas.
- Justificação ou comentário.
- Documento e versão envolvidos.
- Resultado da operação.
- Erro, se aplicável.
- Próxima acção desencadeada.

O histórico de auditoria não deve ser apenas uma lista de comentários. Deve permitir reconstruir o percurso do processo, as decisões, as alterações, as excepções e os efeitos produzidos.

### Acções disponíveis

- Consultar a linha temporal.
- Filtrar por utilizador, evento ou data.
- Ver detalhes de uma alteração.
- Consultar a decisão e os documentos associados.
- Exportar registos mediante autorização.
- Consultar tentativas de integração e automação.

A eliminação de dados deve obedecer à política de retenção e às obrigações legais aplicáveis; não deve existir um botão genérico para apagar o histórico de auditoria.

---

## 14. Aba Configurações

Deve concentrar as configurações gerais do módulo.

- Categorias e tipos de processos.
- Estados e transições permitidas.
- Prioridades.
- Regras de atribuição.
- Matriz de aprovações.
- Prazos padrão por tipo de processo.
- Calendários de trabalho e feriados.
- Regras de escalonamento.
- Modelos de notificações.
- Regras de acesso por função, unidade e departamento.
- Níveis de confidencialidade.
- Políticas de retenção.
- Regras de numeração e identificação.
- Configuração das integrações.
- Limites e políticas de repetição das automações.
- Definições dos indicadores.

As configurações devem ter controlo de permissões, registo de alterações e versionamento quando alterem o comportamento dos processos.

---

## 15. Integração com todos os módulos da INNOVA

Esta é a parte mais importante da arquitectura. O módulo Processes deve ser transversal a toda a plataforma, mas não deve assumir a propriedade dos dados de outros módulos.

A tabela abaixo define as integrações funcionais recomendadas para os módulos da INNOVA, incluindo módulos que possam estar planeados ou ser activados numa fase posterior.

| Módulo | Integração com Processes |
|---|---|
| Auth | Autenticação, sessões e validação do acesso aos processos. |
| Users | Solicitantes, responsáveis, aprovadores, substitutos e participantes. |
| Departments | Responsabilidade departamental, distribuição e encaminhamento. |
| Organization | Unidades, hierarquia, chefias e regras organizacionais. |
| Roles / Permissions | Permissões por função, acção e âmbito organizacional. |
| Courses | Aprovação, publicação, revisão e actualização de cursos. |
| Course Modules | Revisão de módulos, conteúdos e etapas de publicação. |
| Learning Paths | Aprovação e acompanhamento de percursos de aprendizagem. |
| Enrollments | Aprovação de inscrições e resolução de excepções. |
| Assessments / Evaluation | Validação de avaliações, revisão de resultados e pedidos de correcção. |
| Competencies | Aprovação de matrizes, actualização de competências e validação de avaliações. |
| Performance | Ciclos de avaliação, validação e encerramento. |
| Evaluation 360º | Convites, validação de participantes, fecho e tratamento de pendências. |
| Competency Map | Revisão e aprovação de actualizações do mapa de competências. |
| Development Plans / PDI | Aprovação de planos, acções, metas, revisões e conclusão. |
| Career Plans | Aprovação de planos de carreira e respectivas etapas. |
| Talent Development | Selecção para programas, validação de planos e acompanhamento. |
| Leadership | Programas de liderança, nomeações e aprovação de acções. |
| Succession | Aprovações de planos sucessórios, caso esta funcionalidade esteja integrada em Carreira. |
| Onboarding | Admissão, documentação, tarefas de integração e acompanhamento. |
| Trainings | Planeamento, aprovação e execução de formações, turmas e sessões. |
| Attendance | Tratamento de faltas, correcções de presenças e validações excepcionais. |
| AI Tutor | Encaminhamento de tarefas de aprendizagem e acompanhamento de recomendações que necessitem de validação humana. |
| Avatar Training | Aprovação, publicação e acompanhamento de formações com avatar. |
| Micro-learning | Aprovação de conteúdos e campanhas de microaprendizagem. |
| Knowledge | Revisão, validação e publicação de conteúdos de conhecimento. |
| Content Library | Aprovação e publicação de materiais de aprendizagem. |
| Instructor | Validação de formadores, atribuições e documentação. |
| 360 Feedback | Gestão dos fluxos de convite, recolha, validação e encerramento, caso exista um módulo separado. |
| Leave / Férias e Licenças | Encaminhamento e aprovação de pedidos, respeitando o módulo responsável pelo pedido e pelas regras de saldo. |
| Payroll & Payslips | Validação de alterações e excepções autorizadas, sem duplicar o processamento salarial. |
| Work Declaration | Emissão, validação, assinatura e arquivo das declarações. |
| Document Repository | Documentos, versões, evidências e arquivo. |
| Biblioteca | Revisão e aprovação de normas, circulares, regulamentos e ordens de serviço. |
| Notifications | Alertas de atribuição, aprovação, atraso, devolução e conclusão através do sistema existente. |
| History | Consulta ou ligação ao histórico central e aos eventos do processo. |
| Automações | Execução e monitorização de regras automáticas, sem duplicar o motor. |
| Events | Inscrições, aprovações, organização e tarefas associadas a eventos. |
| Engagement | Encaminhamento de iniciativas e acções de envolvimento, se o módulo estiver activo. |
| Executive Reports | Disponibilização de indicadores, tempos, atrasos, volumes e resultados dos processos. |
| Analytics | Dados analíticos sobre etapas, desempenho, carga de trabalho e tendências. |
| Monitoring / Indicators | Disponibilização de eventos e métricas, mantendo o modelo de dados existente mesmo que o módulo de interface seja removido. |
| API Integration | Recepção de eventos externos e comunicação com ERP, SSO e outros sistemas autorizados. |
| CRM — Beneficiários | Aprovação de registos, actualizações e procedimentos relativos a beneficiários, quando aplicável. |
| CRM — Parceiros | Validação de parceiros, documentação e alterações de registo. |
| CRM — Financiadores | Revisão de informação, documentação e processos de relacionamento com financiadores. |
| Instructor / Formadores | Aprovação de cadastro, associação a formações e validação de requisitos. |
| Processes | Execução dos próprios fluxos, tarefas, aprovações e subprocessos. |

> **Nota:** esta matriz descreve as ligações funcionais pretendidas; não significa que todas já estejam implementadas no código. Se existirem módulos fundidos ou removidos da interface, como Payroll com Payslips ou Sucessão dentro de Carreira, deve existir apenas a integração com a implementação efectiva, sem duplicações.

---

## 16. Como deve funcionar a integração técnica

Para evitar que `Processes` se transforme num conjunto de ligações manuais entre módulos, recomendo uma arquitectura baseada em eventos, serviços de domínio e identificadores de referência.

```text
┌──────────────────────────────────────────────────────────┐
│ Módulos da INNOVA                                         │
│ Users, Leave, Trainings, Onboarding, Payroll, Documents…  │
└──────────────────────────────────────────────────────────┘
                  ↕  Eventos e comandos internos
┌──────────────────────────────────────────────────────────┐
│ Processes Service                                         │
│ Modelos, instâncias, etapas, tarefas, condições e         │
│ aprovações                                                │
└──────────────────────────────────────────────────────────┘
                  ↕  Execução de acções e resultados
┌───────────────────────────┬──────────────────────────────┐
│ Notificações              │ Auditoria                    │
├───────────────────────────┼──────────────────────────────┤
│ Dados e relatórios        │ API e integrações            │
└───────────────────────────┴──────────────────────────────┘
```

### Regras técnicas obrigatórias

1. Cada processo deve ter um identificador único e uma referência ao módulo e registo de origem.
2. Cada módulo mantém a propriedade dos seus dados de negócio.
3. Os processos não devem actualizar directamente tabelas de outros módulos sem passar pelas regras e serviços autorizados.
4. As chamadas que iniciam processos ou executam acções devem verificar permissões.
5. Eventos duplicados não podem criar processos ou tarefas repetidas.
6. Falhas de integração devem gerar registos de erro e permitir repetição controlada.
7. Operações críticas devem manter consistência entre a decisão, a acção executada e o histórico.
8. Os processos devem suportar cancelamento, suspensão, retoma e tratamento de excepções.
9. As integrações externas devem utilizar autenticação, validação de dados e registos de execução.
10. Os eventos devem permitir rastrear o percurso completo de uma operação entre módulos.

---

## 17. Estrutura de dados recomendada no Prisma

Para o backend NestJS + Prisma da INNOVA, estes são os modelos principais que devem ser considerados. Os nomes são uma proposta de arquitectura e devem ser conciliados com os modelos já existentes no `schema.prisma`, evitando criar entidades duplicadas.

| Modelo | Responsabilidade |
|---|---|
| `ProcessTemplate` | Definição e configuração do modelo. |
| `ProcessTemplateVersion` | Versões publicadas do modelo. |
| `ProcessDefinitionStep` | Etapas previstas no modelo. |
| `ProcessInstance` | Execução concreta de um processo. |
| `ProcessStepInstance` | Estado de cada etapa executada. |
| `ProcessTask` | Tarefas atribuídas aos utilizadores. |
| `ProcessApproval` | Pedidos e decisões de aprovação. |
| `ProcessAssignment` | Responsáveis, equipas e delegações. |
| `ProcessTransition` | Transições entre etapas. |
| `ProcessCondition` | Regras condicionais do fluxo. |
| `ProcessDocument` | Referências a documentos e evidências. |
| `ProcessComment` | Comentários associados ao processo. |
| `ProcessEvent` | Histórico cronológico dos eventos. |
| `ProcessAutomationExecution` | Execuções automáticas e resultados. |
| `ProcessIntegrationLog` | Registos de integrações e falhas. |
| `ProcessDeadline` | Prazos, alertas e escalonamentos. |

### Campos essenciais de `ProcessInstance`

- `id`
- `code`
- `templateId`
- `templateVersionId`
- `title`
- `description`
- `status`
- `priority`
- `sourceModule`
- `sourceEntityType`
- `sourceEntityId`
- `departmentId`
- `unitId`, se existir no modelo organizacional
- `requesterId`
- `currentStepId`
- `startedAt`
- `dueAt`
- `completedAt`
- `cancelledAt`
- `suspendedAt`
- `createdAt`
- `updatedAt`

Os campos de referência à entidade de origem devem ser desenhados de acordo com a estratégia de relações utilizada no projecto. Uma referência polimórfica como `sourceModule` + `sourceEntityType` + `sourceEntityId` exige validação explícita, pois normalmente não é protegida por uma chave estrangeira convencional para várias tabelas.

### Campos essenciais de `ProcessEvent`

- `id`
- `processInstanceId`
- `stepInstanceId`, quando aplicável
- `eventType`
- `actorId`, quando aplicável
- `actorType`
- `source`
- `previousStatus`
- `newStatus`
- `details`
- `reason`
- `occurredAt`
- `correlationId`
- `metadata`, com dados limitados e controlados

O `ProcessEvent` deve ser tratado como um registo de auditoria: não deve ser editado livremente pelos utilizadores. A política de acesso, retenção e exportação deve ser definida centralmente.

---

## 18. Estados padronizados

Convém separar os estados do processo, da tarefa e da aprovação.

| Processo | Tarefa | Aprovação |
|---|---|---|
| `DRAFT` | `PENDING` | `PENDING` |
| `ACTIVE` | `IN_PROGRESS` | `APPROVED` |
| `SUSPENDED` | `BLOCKED` | `REJECTED` |
| `COMPLETED` | `COMPLETED` | `RETURNED` |
| `CANCELLED` | `CANCELLED` | `DELEGATED` |
| `FAILED` | `OVERDUE` | `CANCELLED` |

`OVERDUE` pode ser uma condição calculada a partir do prazo, em vez de um estado persistido. Do mesmo modo, uma aprovação delegada deve conservar o estado da decisão separado da informação de delegação.

---

## 19. Modal «Novo Processo»

O botão **Novo Processo** deve abrir um modal com os seguintes campos:

| Campo | Exemplo / opções |
|---|---|
| Nome do processo \* | Ex.: Integração de novo colaborador |
| Modelo de processo \* | Onboarding de colaborador |
| Módulo de origem \* | Users |
| Prioridade | Baixa, **Normal** (por defeito), Alta, Urgente |
| Descrição e finalidade | Descreva o objectivo e o resultado esperado. |

*Na demonstração do PDF, o botão «Copiar exemplo preenchido» copia os dados preenchidos para utilização posterior e não cria um registo na INNOVA.*

Após a escolha do modelo, o sistema deve apresentar os campos específicos que esse modelo exige, como colaborador, departamento, curso, documento ou pedido de origem.

Antes de iniciar, deve verificar se os dados obrigatórios estão preenchidos, se o utilizador tem autorização e se já existe um processo activo para o mesmo pedido, quando a regra de negócio o exigir.

---

## 20. Permissões por perfil

| Perfil | Permissões típicas |
|---|---|
| Administrador da plataforma | Configurações globais, permissões e supervisão. |
| Administrador de processos | Modelos, fluxos, regras e monitorização. |
| Responsável do processo | Acompanhamento, atribuição e resolução de bloqueios. |
| Gestor de departamento | Processos do âmbito autorizado e respectivas aprovações. |
| Aprovador | Consulta da informação necessária e decisão sobre pedidos atribuídos. |
| Colaborador | Criação de pedidos autorizados e consulta dos próprios processos. |
| Auditor | Consulta autorizada do histórico e das evidências. |
| Serviço de automação | Execução apenas das acções explicitamente autorizadas. |

As permissões devem respeitar a unidade, o departamento, a confidencialidade e as regras específicas do módulo de origem.

---

## 21. Requisitos de interface

Para manter a consistência com a INNOVA:

- Utilizar o layout corporativo e o padrão de cores já existente.
- Manter o nome do módulo Processes.
- Usar descrições dinâmicas ao seleccionar as abas, sem alterar o título principal do módulo.
- Disponibilizar pesquisa, filtros, paginação e ordenação.
- Utilizar badges discretos para estados e prioridades.
- Incluir menus de acções por registo.
- Utilizar modais para criar e editar registos.
- Ter uma página de detalhe do processo com separadores para Resumo, Etapas, Tarefas, Aprovações, Documentos e Histórico.
- Apresentar estados vazios, carregamento, erros e confirmação de acções.
- Garantir acessibilidade, adaptação a dispositivos móveis e controlo de acesso também no backend.

---

## 22. Critérios de aceitação antes de considerar o módulo concluído

- É possível criar, editar, publicar e versionar modelos.
- É possível iniciar processos a partir de diferentes módulos.
- Cada instância tem responsável, estado, prazo e histórico.
- As tarefas suportam dependências, devoluções e bloqueios.
- As aprovações validam permissões e registam as decisões.
- Os fluxos suportam condições e tarefas paralelas.
- As automações evitam duplicações e registam falhas.
- Os prazos geram alertas e escalonamentos configurados.
- Os documentos respeitam as permissões do repositório.
- Os relatórios apresentam indicadores verificáveis.
- O histórico permite reconstruir o percurso do processo.
- A API valida os dados e as permissões.
- Existem testes para os principais cenários e excepções.
- As integrações com os módulos existentes estão efectivamente implementadas e testadas.
- As alterações são compatíveis com os modelos já existentes no Prisma.

---

## Recomendação final para a arquitectura da INNOVA

O **Processes** deve ser o motor transversal de execução de processos, e não um segundo sistema de RH, formação, notificações ou automações. A separação recomendada é:

- **Processes:** controla o percurso, as etapas, as tarefas e as aprovações.
- **Automações:** executa regras automáticas e acções programadas.
- **History:** mantém o histórico central, quando essa responsabilidade já existe nesse módulo.
- **Notifications:** entrega os alertas através do sininho existente.
- **Document Repository:** conserva os ficheiros e as suas versões.
- **Executive Reports / Analytics:** consome os dados para relatórios.
- **Módulos de negócio:** continuam responsáveis pelos respectivos dados, regras e operações.

Esta separação permite que um processo atravesse vários módulos sem duplicar funcionalidades nem criar versões diferentes da mesma informação. O desenho também segue o princípio de definir, executar, medir e melhorar continuamente os processos.
