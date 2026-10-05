# Especificação funcional completa — Módulo Audit da INNOVA

O módulo **Audit (Auditoria e Rastreabilidade)** da INNOVA deve permitir acompanhar, registar e consultar todas as operações relevantes realizadas na plataforma, garantindo transparência, segurança, responsabilização dos utilizadores e controlo interno.

Para a INNOVA, que integra RH, Academia Corporativa, formação, avaliação de desempenho, processamento salarial e gestão documental, o módulo deve estar ligado a todos os módulos da plataforma, permitindo reconstruir quem fez determinada ação, o que alterou, quando, onde e qual foi o resultado.

**Audit — Auditoria e Rastreabilidade**
*Categoria: Segurança, conformidade e controlo interno*
Todos os módulos · Registo imutável · Controlo de acessos

---

## 1. Objetivos do módulo

O módulo Audit deve permitir:

- Registar automaticamente as ações realizadas pelos utilizadores.
- Identificar alterações, criações e eliminações de dados.
- Saber quem consultou ou exportou informações sensíveis, quando aplicável.
- Acompanhar acessos, tentativas de acesso e alterações de permissões.
- Investigar incidentes de segurança e comportamentos suspeitos.
- Consultar o histórico de um colaborador, documento, processo ou registo.
- Produzir relatórios de auditoria para a Administração, RH e responsáveis autorizados.
- Demonstrar evidências de controlo interno e apoiar auditorias de conformidade.
- Monitorizar operações realizadas por administradores, gestores, colaboradores, integrações e processos automáticos.

> **Regra fundamental:** o Audit deve registar os acontecimentos; não deve servir para alterar os dados operacionais dos restantes módulos nem substituir o módulo History.

---

## 2. Estrutura de abas

Recomendo organizar o módulo com as seguintes abas.

| # | Aba | Descrição |
|---|---|---|
| 01 | Visão Geral | Indicadores, atividade recente e alertas de auditoria. |
| 02 | Registos de Auditoria | Lista completa de eventos registados na plataforma. |
| 03 | Acessos e Sessões | Entradas, saídas, sessões e tentativas de autenticação. |
| 04 | Alterações de Dados | Valores anteriores e posteriores às alterações. |
| 05 | Segurança e Incidentes | Atividade suspeita, violações de permissões e incidentes. |
| 06 | Auditorias e Inspeções | Planeamento, execução, evidências e conclusões das auditorias. |
| 07 | Relatórios | Relatórios operacionais, executivos e de conformidade. |
| 08 | Exportações e Evidências | Histórico de exportações e ficheiros de evidência. |
| 09 | Políticas e Retenção | Regras de registo, retenção e acesso aos dados de auditoria. |

---

## 3. Aba Visão Geral

Deve apresentar um resumo da atividade e do estado da segurança da plataforma.

### Cards de indicadores

| Card | Descrição |
|---|---|
| Eventos registados | No período selecionado |
| Acessos falhados | Tentativas recusadas |
| Ações críticas | Operações sensíveis |
| Alertas por analisar | Incidentes pendentes |

*Os valores acima são exemplos de indicadores, não dados reais da INNOVA.*

### Gráficos recomendados

- **Evolução dos eventos:** gráfico de linhas por dia, semana ou mês.
- **Eventos por módulo:** gráfico de barras para comparar RH, Formação, Payroll, Users, etc.
- **Distribuição por gravidade:** gráfico de barras ou anel para eventos informativos, avisos, elevados e críticos.
- **Acessos bem-sucedidos vs. falhados:** barras comparativas.
- **Atividade por utilizador:** ranking dos utilizadores com maior número de operações, respeitando as permissões.
- **Incidentes ao longo do tempo:** tendência dos incidentes detetados e resolvidos.

### Outros elementos

- Atividade recente.
- Últimos eventos críticos.
- Alertas de segurança pendentes.
- Auditorias em curso.
- Atalhos para pesquisar registos, criar uma auditoria e gerar um relatório.

---

## 4. Aba Registos de Auditoria

Esta é a área principal do módulo. Deve conter uma tabela pesquisável e filtrável com os eventos registados.

### Campos da tabela

| Campo | Descrição |
|---|---|
| ID do evento | Identificador único do registo |
| Data e hora | Momento exato da ocorrência, com fuso horário |
| Utilizador | Nome e identificador de quem executou a ação |
| Perfil | Administrador, RH, gestor, colaborador, sistema, etc. |
| Módulo | Área da INNOVA onde ocorreu a ação |
| Ação | Criar, consultar, editar, eliminar, aprovar, exportar, etc. |
| Entidade | Utilizador, colaborador, curso, salário, documento, pedido, etc. |
| Registo afetado | Identificador do registo operacional |
| Resultado | Sucesso, falha, bloqueado ou parcialmente concluído |
| Gravidade | Informativa, baixa, média, alta ou crítica |
| Origem | Interface, API, integração ou automação |
| IP de origem | Endereço IP, quando disponível e justificável |
| Ações | Ver detalhes, consultar histórico e analisar evento |

### Filtros

- Pesquisa por nome, e-mail ou ID do utilizador.
- Intervalo de datas e horas.
- Módulo.
- Tipo de ação.
- Tipo de entidade.
- Resultado da operação.
- Nível de gravidade.
- Origem do evento.
- Unidade, departamento e cargo, conforme as permissões.
- Eventos realizados por utilizadores ou processos automáticos.

### Ações disponíveis

- Ver detalhes do evento.
- Consultar o registo relacionado.
- Comparar valores anteriores e posteriores.
- Consultar eventos relacionados.
- Exportar resultados, se autorizado.
- Abrir um incidente relacionado.
- Imprimir ou gerar evidência de auditoria.

A eliminação definitiva de um evento de auditoria não deve estar disponível nesta tabela.

---

## 5. Modal «Detalhes do Evento»

Ao clicar num registo, deve abrir um modal com todas as informações necessárias para compreender a ocorrência.

### Exemplo ilustrativo

**Identificação**

| Campo | Valor |
|---|---|
| ID do evento | AUD-2026-000125 |
| Ação | Atualização de registo |
| Módulo | Users |
| Resultado | Sucesso |

**Autor e contexto**

| Campo | Valor |
|---|---|
| Utilizador | Administrador autorizado |
| Data e hora | Data/hora do evento |
| Origem | Interface Web |

**Alterações efetuadas**

- Campo alterado: Departamento
- Valor anterior: Logística
- Valor posterior: Recursos Humanos

Os valores devem ser apresentados apenas a utilizadores com autorização para consultar esses dados.

### O modal deve incluir ainda

- Descrição completa da ação.
- Motivo ou justificação, quando exigido pela operação.
- Identificador do registo afetado.
- IP, dispositivo, navegador e identificador da sessão, quando disponíveis.
- Resultado técnico e código de erro, se aplicável.
- Identificador de correlação da API ou do processo.
- Eventos relacionados antes e depois da ocorrência.
- Evidências anexas ou referências para outros registos.

Não se devem guardar palavras-passe, tokens de autenticação ou outros segredos nos detalhes de auditoria.

---

## 6. Aba Acessos e Sessões

Esta aba permite investigar quem acedeu à INNOVA e detetar tentativas de acesso não autorizadas.

### Dados a registar

- Início e fim da sessão.
- Utilizador e método de autenticação.
- Data e hora do acesso.
- Resultado da autenticação.
- Tentativas de acesso falhadas.
- Encerramento voluntário ou expiração da sessão.
- Bloqueios de conta e desbloqueios.
- Alterações de palavra-passe e de métodos de autenticação.
- Alterações de funções, perfis e permissões.
- Utilização de autenticação multifator, se implementada.
- IP, navegador e dispositivo, quando necessário e permitido.

### Alertas possíveis

- Muitas tentativas falhadas num curto intervalo.
- Acesso a funcionalidades sem permissão.
- Alterações inesperadas de privilégios.
- Atividade invulgar numa conta privilegiada.
- Acessos simultâneos que justifiquem análise, sem assumir automaticamente que são fraudulentos.

> **Importante:** um registo de início de sessão não deve ser confundido com prova de que o utilizador esteve a trabalhar durante toda a sessão.

---

## 7. Aba Alterações de Dados

Deve permitir reconstruir as alterações efetuadas nos dados relevantes da plataforma.

### Cada evento de alteração deve conter

- Entidade e ID do registo.
- Campos alterados.
- Valor anterior.
- Valor posterior.
- Autor da alteração.
- Data e hora.
- Origem da alteração.
- Justificação, quando exigida.
- Resultado da operação.
- Referência à aprovação associada, quando aplicável.

A comparação deve ser apresentada campo a campo.

Para dados pessoais, salariais ou outros dados sensíveis, os valores devem ser ocultados ou limitados conforme as permissões de quem consulta a auditoria.

Ações importantes a registar incluem criação, atualização, desativação, reativação, eliminação lógica, alteração de estado, aprovação, rejeição e transferência de responsabilidade.

---

## 8. Aba Segurança e Incidentes

Esta área deve centralizar eventos que possam representar risco para a plataforma.

### Tipos de incidentes

- Tentativas de acesso não autorizado.
- Alterações suspeitas de permissões.
- Exportações anormais de informação.
- Acesso indevido a documentos sensíveis.
- Falhas repetidas de operações críticas.
- Alterações inesperadas a dados salariais.
- Tentativas de modificar ou apagar registos de auditoria.
- Falhas de integração que afetem a integridade dos dados.

### Campos de cada incidente

| Campo | Conteúdo |
|---|---|
| ID | Identificador do incidente |
| Título | Descrição resumida |
| Categoria | Segurança, acesso, dados, integração, etc. |
| Gravidade | Baixa, média, alta ou crítica |
| Data de deteção | Quando foi detetado |
| Origem | Utilizador, sistema ou regra de deteção |
| Responsável | Pessoa encarregada da análise |
| Estado | Aberto, em análise, mitigado, encerrado |
| Evidências | Eventos e documentos relacionados |
| Resolução | Medidas tomadas e conclusão |

### Fluxo de tratamento

1. Deteção do evento
2. Classificação do risco
3. Atribuição ao responsável
4. Investigação e evidências
5. Resolução e encerramento

O módulo pode criar alertas automáticos, mas uma deteção não deve ser tratada como prova de fraude. Os incidentes devem ser analisados por pessoas autorizadas.

---

## 9. Aba Auditorias e Inspeções

Esta aba destina-se a auditorias internas formais, por exemplo, sobre processamento salarial, assiduidade, formação obrigatória ou gestão de permissões.

### Dados de cada auditoria

- Código e título.
- Objetivo e âmbito.
- Tipo de auditoria: interna, operacional, conformidade ou segurança.
- Módulos abrangidos.
- Período analisado.
- Critérios e políticas aplicáveis.
- Auditor responsável e equipa.
- Data de início e prazo.
- Lista de verificações.
- Evidências recolhidas.
- Constatações e não conformidades.
- Riscos identificados.
- Recomendações.
- Plano de ações corretivas.
- Responsáveis e prazos das correções.
- Resultado e aprovação final.
- Relatório de encerramento.

### Estados

- Planeada.
- Em preparação.
- Em execução.
- Em revisão.
- A aguardar ações corretivas.
- Concluída.
- Cancelada, com justificação.

### Botões

- Nova auditoria.
- Adicionar verificação.
- Anexar evidência.
- Registar constatação.
- Criar ação corretiva.
- Submeter para revisão.
- Aprovar relatório.
- Exportar relatório final.

A aprovação do relatório deve ficar registada como evento de auditoria, incluindo o autor e a data.

---

## 10. Aba Relatórios

Deve permitir gerar relatórios por período, módulo, utilizador, unidade, departamento, tipo de evento e gravidade.

### Relatórios recomendados

1. Resumo executivo de auditoria.
2. Registos de atividade por módulo.
3. Histórico de alterações de dados.
4. Acessos e tentativas de autenticação falhadas.
5. Alterações de funções e permissões.
6. Operações críticas em Payroll e Payslips.
7. Alterações de assiduidade, férias e licenças.
8. Aprovações e rejeições de processos.
9. Exportações e consultas de dados sensíveis.
10. Incidentes de segurança e respetivo estado.
11. Auditorias concluídas e não conformidades.
12. Ações corretivas pendentes ou fora do prazo.
13. Atividade de integrações e automações.
14. Atividade administrativa por utilizador.

### Filtros dos relatórios

- Data inicial e final.
- Módulos abrangidos.
- Utilizadores e perfis.
- Unidades e departamentos.
- Tipo de evento.
- Gravidade.
- Resultado.
- Estado do incidente ou da auditoria.

### Formatos

- PDF para relatórios formais.
- XLSX ou CSV para análise autorizada.
- Visualização no ecrã antes da exportação.

Todas as exportações devem registar quem exportou, quando, quais os filtros usados e o resultado da operação.

---

## 11. Aba Exportações e Evidências

Esta aba deve permitir consultar os ficheiros de auditoria produzidos e as evidências associadas às investigações.

### Campos recomendados

- ID da exportação ou evidência.
- Nome e tipo do ficheiro.
- Relatório ou incidente relacionado.
- Autor e data de criação.
- Período e filtros aplicados.
- Formato e número de registos exportados.
- Classificação de confidencialidade.
- Integridade do ficheiro, por exemplo, através de hash criptográfico.
- Prazo de retenção.
- Estado e histórico de acesso.

O acesso a evidências deve ser controlado. Os ficheiros podem conter dados pessoais ou salariais, pelo que não devem ficar disponíveis através de links públicos.

---

## 12. Aba Políticas e Retenção

Esta área deve permitir aos administradores autorizados configurar as regras de auditoria.

### Configurações

- Eventos que devem ser registados obrigatoriamente.
- Módulos e entidades abrangidos.
- Níveis de gravidade.
- Regras de alerta e limites de deteção.
- Prazos de retenção por categoria de registo.
- Política de arquivo.
- Permissões para consultar e exportar.
- Regras de ocultação de dados sensíveis.
- Destinos de armazenamento e cópias de segurança.
- Estado do serviço de auditoria.
- Monitorização de falhas na recolha de eventos.

As alterações às políticas também devem ser auditadas.

Os prazos de retenção não devem ser arbitrários: devem respeitar os requisitos legais aplicáveis, as necessidades de investigação e a política de proteção de dados da organização.

---

## 13. Integração obrigatória com todos os módulos da INNOVA

O Audit deve receber eventos dos módulos através de um mecanismo centralizado. A seguinte matriz define o que deve ser registado em cada área.

| Módulo | Eventos relevantes a auditar |
|---|---|
| Users | Criação de contas, alteração de perfis, bloqueios e desativações |
| Organization | Alterações à estrutura organizacional e hierarquias |
| Departments | Criação, edição, desativação e transferência de departamentos |
| Colaboradores / RH | Alterações aos dados pessoais e profissionais |
| Roles & Permissions | Atribuição e remoção de permissões |
| Payroll & Payslips | Processamento salarial, alterações, aprovações e consulta de recibos |
| Attendance | Correções de presenças, faltas, atrasos e justificações |
| Leave | Pedidos, aprovações, rejeições e alterações de férias e licenças |
| Performance | Avaliações, classificações, alterações e aprovações |
| Competencies | Alterações de competências e níveis atribuídos |
| Avaliação 360º | Abertura de ciclos, submissões, alterações de configuração e acesso a resultados |
| Onboarding | Criação de planos, tarefas, conclusão e validação |
| Courses | Criação, edição, publicação e arquivamento de cursos |
| Course Modules / Lessons | Alterações a módulos, conteúdos e aulas |
| Enrollments | Inscrições, cancelamentos e alterações de estado |
| Assessments | Configurações, resultados, classificações e correções |
| Trainings | Planeamento, turmas, sessões, participantes e formadores |
| Avatar Training | Criação, alteração, publicação e execução de formações com avatar |
| AI Tutor | Utilização administrativa, alterações de configuração e falhas técnicas, evitando registar desnecessariamente o conteúdo privado das conversas |
| Development Plans / PDI | Alterações a objetivos, ações, prazos e avaliações de progresso |
| Career Plans | Alterações aos planos de carreira e decisões associadas |
| Succession, se integrado | Alterações aos planos de sucessão e permissões de consulta |
| Competency Map | Alterações a matrizes, níveis e mapeamentos |
| Knowledge / Content Library | Publicação, alteração, arquivo e acesso a conteúdos restritos |
| Document Repository | Upload, consulta, download, substituição e eliminação lógica de documentos |
| Work Declaration | Criação, assinatura, emissão e anulação de declarações |
| Events | Criação, edição, cancelamento e gestão de participantes |
| Processes | Criação, execução, transições de estado, aprovações e falhas |
| Automations | Criação e alteração de regras, execuções, falhas e ações automáticas |
| Executive Reports | Geração, consulta e exportação de relatórios |
| Analytics | Consultas e exportações de informação analítica, especialmente quando sensível |
| Integrations / API | Chamadas relevantes, falhas, sincronizações e alterações de credenciais |
| Notifications | Alterações às regras e falhas de entrega relevantes |
| History | Referência cruzada com o histórico funcional, sem duplicar desnecessariamente os mesmos dados |
| Instructor | Alterações a perfis de formadores, permissões e atribuições |
| Engagement, se existir | Alterações a campanhas, configurações e resultados restritos |
| Módulos administrativos | Alterações a configurações globais, políticas e parâmetros críticos |

Esta matriz deve ser aplicada também a módulos futuros, sem necessidade de reconstruir o Audit de raiz.

---

## 14. Diferença entre Audit, History e Logs técnicos

É importante manter estas responsabilidades separadas.

| Área | Responsabilidade |
|---|---|
| Audit | Registo de ações, autoria, alterações, evidências e responsabilização |
| History | Histórico funcional de acontecimentos associados a colaboradores, processos e entidades |
| Logs técnicos | Diagnóstico de erros, exceções, desempenho, infraestrutura e execução do sistema |
| Notifications | Comunicação de alertas e acontecimentos aos destinatários |
| Processes | Execução e acompanhamento de fluxos de trabalho |
| Automations | Execução de regras automáticas e ações desencadeadas por eventos |

**Exemplo:** quando um gestor aprova férias, o módulo Leave guarda o pedido e a aprovação, o History apresenta o acontecimento no histórico funcional do colaborador, o Audit regista a ação do gestor e o resultado, e o sistema de notificações comunica a decisão ao colaborador.

O Audit não deve substituir os registos de negócio de cada módulo.

---

## 15. Requisitos técnicos para o backend

Para que a auditoria seja fiável, não basta construir uma tabela no frontend.

### Modelo de dados recomendado

**`AuditLog`** — registo principal, *append-only* (apenas acrescentar)

- `id` — identificador único
- `eventType` — tipo do evento
- `action` — ação executada
- `module` — módulo de origem
- `entityType` — tipo de entidade
- `entityId` — registo afetado
- `actorId` — utilizador, quando aplicável
- `actorType` — utilizador, sistema, integração ou serviço
- `timestamp` — data/hora UTC
- `outcome` — sucesso, falha ou bloqueio
- `severity` — nível de gravidade
- `before` / `after` — valores anteriores e posteriores, quando aplicável
- `metadata` — contexto técnico filtrado
- `correlationId` — ligação a pedidos e processos relacionados
- `source` — interface, API, integração ou automação
- `ipAddress` / `userAgent` — contexto de origem, se necessário
- `reason` — justificação, quando aplicável
- `schemaVersion` — versão do formato do evento

Recomenda-se separar, conforme necessário, os modelos `AuditIncident`, `AuditCase`, `AuditFinding`, `AuditEvidence` e `AuditPolicy`, ligados ao registo principal por referências.

### Regras obrigatórias de implementação

1. **Registo no backend:** não confiar apenas no frontend, porque as operações também podem ser feitas através da API.
2. **Imutabilidade:** os eventos não devem ser editáveis nem elimináveis através das operações normais da aplicação.
3. **Integridade:** restringir permissões na base de dados e considerar armazenamento separado ou encadeamento de hashes para detetar adulterações.
4. **Transações:** sempre que possível, registar a alteração de negócio e o evento de auditoria na mesma transação, ou utilizar uma *transactional outbox* para evitar eventos perdidos.
5. **Cobertura:** auditar também tarefas agendadas, integrações, importações e automações.
6. **Segurança:** proteger os registos contra acesso não autorizado e ocultar dados sensíveis.
7. **Pesquisa eficiente:** criar índices para data, utilizador, módulo, entidade, ação e gravidade.
8. **Paginação:** não carregar todos os eventos de uma só vez.
9. **Tratamento de falhas:** monitorizar quando o registo de auditoria falha e definir o comportamento para operações críticas.
10. **Retenção:** arquivar e eliminar apenas de acordo com uma política autorizada, documentada e legalmente adequada.

Para o backend NestJS + Prisma da INNOVA, o módulo deve disponibilizar serviços e mecanismos reutilizáveis para que os outros módulos registem eventos de forma consistente. A gravação de eventos críticos não deve depender de chamadas manuais feitas apenas pelos componentes React.

---

## 16. Permissões e segurança

Sugestão de matriz de acesso:

| Perfil | Permissões recomendadas |
|---|---|
| Superadministrador | Consulta global e configuração, com todas as ações privilegiadas também auditadas |
| Auditor interno | Consulta dos registos abrangidos pelo seu mandato e gestão das auditorias atribuídas |
| Administrador de segurança | Consulta e investigação de eventos de segurança |
| Administrador de RH | Consulta limitada aos módulos e dados de RH autorizados |
| Gestor | Consulta de eventos permitidos da sua unidade ou equipa, quando necessário |
| Colaborador | Sem acesso global; acesso apenas a informação que lhe seja legalmente disponibilizada |
| Serviço / Integração | Escrita dos eventos que lhe competem; sem acesso global de leitura |

Nenhum perfil deve poder apagar ou alterar livremente os registos históricos. As operações administrativas sobre retenção, exportação e configuração devem ser auditadas.

---

## 17. Botões e funcionalidades da interface

Na página principal, recomendo:

- **Exportar relatório** — exportação sujeita a permissões.
- **Nova auditoria** — criação de uma auditoria formal.
- **Ver incidentes** — acesso aos incidentes por analisar.
- **Filtros avançados** — pesquisa detalhada.
- **Limpar filtros** — repor a pesquisa.
- **Ver detalhes** — abrir o modal de evento.
- **Comparar alterações** — mostrar valores anteriores e posteriores.
- **Criar incidente** — associar um evento a uma investigação.
- **Gerar evidência** — criar um documento de evidência com referência ao evento.

Não recomendo um botão «Eliminar registos» nem a edição direta de eventos.

---

## 18. Critérios de aceitação

O módulo Audit só deve ser considerado concluído quando:

- As operações críticas dos módulos integrados geram eventos.
- Cada evento identifica o autor ou o processo responsável.
- As datas são consistentes e armazenadas em UTC.
- É possível filtrar por módulo, utilizador, ação e período.
- As alterações apresentam os valores anteriores e posteriores quando aplicável.
- As permissões impedem consultas indevidas.
- Os eventos não podem ser alterados pela interface normal.
- As exportações ficam registadas.
- Os eventos de processos e automações podem ser correlacionados.
- Os erros de registo são detetáveis e monitorizados.
- Os relatórios são gerados com filtros e âmbito identificáveis.
- Existem testes de integração e de autorização.
- A política de retenção está definida.
- O sistema consegue suportar o volume de eventos esperado sem degradar os módulos operacionais.

---

## 19. Recomendação final para a INNOVA

A minha recomendação é manter o Audit como módulo transversal de controlo e conformidade, disponível sobretudo para Administração, Segurança e auditoria interna, sem o transformar num segundo módulo de gestão de RH.

A prioridade de implementação deve ser:

1. Criar o modelo de eventos e o serviço central de auditoria.
2. Integrar autenticação, Users, funções e permissões.
3. Integrar primeiro as operações críticas de Payroll, Leave, Attendance, Document Repository e aprovações.
4. Integrar os restantes módulos, incluindo Courses, Training, Performance, Development Plans, Processes e Automations.
5. Construir a tabela, os filtros e o modal de detalhes.
6. Implementar alertas, incidentes, relatórios e evidências.
7. Definir retenção, proteção contra adulteração e testes de segurança.

**Resultado esperado:** qualquer operação relevante na INNOVA deve poder ser investigada de forma consistente, desde a ação original até às alterações realizadas, aprovações, integrações e consequências, sem expor desnecessariamente os dados dos colaboradores.
