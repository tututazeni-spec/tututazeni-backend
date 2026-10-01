# INNOVA — Módulo Executive Reports

O módulo **Executive Reports (Relatórios Executivos)** deve ser o centro de informação estratégica da INNOVA. A sua função é reunir, consolidar e transformar os dados de todos os módulos da plataforma em relatórios que permitam à Administração, à Direcção de Recursos Humanos e aos gestores de unidades tomar decisões fundamentadas.

Ao contrário do módulo `reports`, que pode servir para consultar e gerar relatórios operacionais, o `executive-reports` deve oferecer uma visão transversal da organização, com indicadores estratégicos, análise de tendências, comparação entre unidades, alertas e relatórios prontos para reuniões de direcção.

---

## 1. Estrutura principal do módulo

### 1. Dashboard Executivo
Visão global da organização, indicadores-chave (KPIs), tendências, metas, alertas críticos e evolução dos resultados.

### 2. Relatórios de Recursos Humanos
Quadro de pessoal, admissões, saídas, assiduidade, férias, desempenho, competências, carreira e sucessão.

### 3. Relatórios da Academia Corporativa
Formações, inscrições, participação, conclusão, avaliações, custos, eficácia da formação e desenvolvimento de talentos.

### 4. Relatórios de Gestão e Estratégia
Metas organizacionais, execução de planos, orçamento, riscos, produtividade, indicadores por departamento e resultados globais.

---

## 2. Abas que o módulo deve ter

Sugiro a seguinte estrutura para a interface da INNOVA:

| Aba | Finalidade |
|---|---|
| Visão Executiva | Resumo geral de toda a organização |
| Indicadores Estratégicos | KPIs, metas, resultados e desvios |
| Recursos Humanos | Dados consolidados dos colaboradores |
| Formação & Academia | Indicadores de formação e aprendizagem |
| Desempenho & Talento | Avaliações, competências, PDI e carreira |
| Assiduidade & Ausências | Presenças, atrasos, faltas, férias e licenças |
| Custos & Orçamento | Custos de pessoal e formação, quando integrados |
| Departamentos & Unidades | Comparação entre áreas e unidades |
| Projectos & Planos | Execução de planos, iniciativas e objectivos |
| Riscos & Alertas | Desvios, pendências, prazos e situações críticas |
| Relatórios Personalizados | Construção de relatórios com filtros seleccionáveis |
| Relatórios Agendados | Relatórios recorrentes enviados automaticamente |
| Histórico & Arquivo | Relatórios gerados, versões e registo de consultas |

A visibilidade das abas e dos respectivos dados deve depender das permissões do utilizador.

---

## 3. Dados e indicadores que deve apresentar

Esta é a estrutura de indicadores que recomendo para a INNOVA. Os valores devem ser calculados a partir dos registos reais da plataforma, nunca preenchidos manualmente no dashboard sem identificação da origem.

### 3.1. Visão Executiva — KPIs principais

| Indicador | Valor | Descrição |
|---|---|---|
| Quadro de pessoal | — | Colaboradores activos — variação mensal e anual |
| Desempenho | —% | Metas alcançadas — realizado vs. objectivo |
| Formação | —% | Taxa de conclusão — inscrições elegíveis no período |
| Assiduidade | —% | Taxa de presença — presenças vs. presenças esperadas |
| Rotatividade | —% | Taxa de saídas — mensal e últimos 12 meses |
| Desenvolvimento | — | Acções de PDI atrasadas — pendentes fora do prazo |

> *Exemplo da apresentação dos KPIs. Os traços são marcadores ilustrativos, não dados reais da INNOVA.*

Além destes seis indicadores principais, o dashboard deve poder apresentar:

- Total de colaboradores por unidade, departamento, cargo e tipo de vínculo.
- Admissões, saídas e saldo líquido de colaboradores.
- Custo total de pessoal e custo médio por colaborador, se os dados salariais estiverem disponíveis.
- Total de formações realizadas, inscrições, participantes e horas de formação.
- Percentagem de avaliações de desempenho concluídas.
- Percentagem de competências avaliadas e lacunas de competências identificadas.
- Total de férias e licenças em curso ou pendentes de aprovação.
- Total de processos de onboarding em curso e concluídos.
- Acções de desenvolvimento atrasadas e planos de carreira em execução.
- Pendências críticas, documentos próximos do vencimento e aprovações em atraso.

Cada KPI deve mostrar o valor actual, a comparação com o período anterior, a meta, a variação, a data da última actualização e a origem dos dados. Esta disciplina ajuda a manter uma definição consistente dos indicadores em toda a organização.

---

## 4. Ligação a todos os módulos da INNOVA

Esta é a parte mais importante do projecto: o `executive-reports` não deve ser um módulo isolado. Deve consumir os dados dos módulos funcionais através dos serviços e modelos existentes no backend NestJS/Prisma.

```
┌────────────────────────────────────────────────────────────────────┐
│ Módulos funcionais da INNOVA                                       │
│ Users · Attendance · Payroll · Trainings · Performance ·           │
│ Development Plans · outros                                         │
└────────────────────────────────────────────────────────────────────┘
                                 ↓
┌────────────────────────────────────────────────────────────────────┐
│ Camada de integração e cálculo                                     │
│ Serviços de leitura · Agregações · Definições de KPIs ·            │
│ Validação de dados · Permissões                                    │
└────────────────────────────────────────────────────────────────────┘
                                 ↓
┌────────────────────────────────────────────────────────────────────┐
│ Executive Reports                                                  │
│ Dashboard executivo · Relatórios · Análises · Alertas · Exportações│
└────────────────────────────────────────────────────────────────────┘
```

### 4.1. Matriz de integração por módulo

Os módulos seguintes correspondem à estrutura funcional da INNOVA que temos vindo a definir. A ligação exacta dependerá dos modelos e endpoints que já existem no teu código.

| Módulo de origem | Dados que o Executive Reports deve consumir |
|---|---|
| `users` | Total de colaboradores, activos/inactivos, admissões, perfil profissional, unidade, cargo e departamento |
| `departments` | Estrutura organizacional, dimensão dos departamentos, distribuição de pessoal e comparações |
| `organization` | Unidades, hierarquia, estrutura, distribuição e consolidação organizacional |
| `attendance` | Presenças, faltas, atrasos, trabalho remoto e horas registadas |
| `leave` | Férias, licenças, dias de ausência, pedidos pendentes e aprovações |
| `payroll` / `payslips` | Remuneração, custos de pessoal, encargos, totais mensais e evolução salarial, conforme permissões |
| `work-declaration` | Declarações emitidas, pendentes, assinadas e por regularizar |
| `trainings` | Plano de formação, acções, turmas, sessões, participantes, formadores e custos |
| `courses` | Catálogo de cursos, cursos activos, inscrições, conclusão e avaliação |
| `course-modules` | Progresso por módulo, conteúdos concluídos e dificuldades de aprendizagem |
| `enrollments` | Inscrições, estados, desistências, conclusões e taxas de conclusão |
| `assessments` | Resultados de avaliações, classificações e aproveitamento |
| `competencies` | Competências avaliadas, níveis de proficiência e lacunas identificadas |
| `competency-map` | Mapa de competências por cargo, departamento e unidade |
| `performance` | Resultados das avaliações, objectivos, metas e ciclos de desempenho |
| `360 feedback` | Taxa de participação, avaliações concluídas e resultados agregados de feedback |
| `development-plans` | PDI, acções planeadas, execução, progresso e acções atrasadas |
| `career-plans` | Mobilidade interna, progressão de carreira e planos de evolução profissional |
| `talent-development` | Talentos identificados, programas de desenvolvimento e evolução de competências |
| `onboarding` | Novas admissões, tarefas de integração, conclusão de planos e pendências |
| `leadership` | Programas de liderança, participação, conclusão e avaliação |
| `micro-learning` | Microformações, utilização, conclusão e resultados de aprendizagem |
| `learning-paths` | Percursos atribuídos, progresso, conclusão e abandono, caso o módulo seja mantido |
| `knowledge` | Consultas, conteúdos utilizados e participação na partilha de conhecimento, se registadas |
| `content-library` | Conteúdos publicados, visualizações, utilização e estado de publicação |
| `document-repository` | Documentos registados, pendentes de validação, vencimentos e acessos autorizados |
| `engagement` | Resultados de inquéritos, participação e evolução dos indicadores de envolvimento, se o módulo for mantido |
| `succession` | Cobertura de posições críticas e planos de sucessão, se a funcionalidade estiver integrada em Carreira |
| `instructor` | Formadores activos, carga formativa, avaliações e disponibilidade registada |
| `events` | Eventos realizados, inscrições, participação e resultados registados |
| `processes` | Processos em curso, concluídos, atrasados e tempos de execução |
| `automations` | Execuções, falhas, tarefas automatizadas e resultados dos fluxos |
| `notifications` | Notificações emitidas, entregues, falhadas e pendentes, se houver registos disponíveis |
| `history` | Histórico de alterações, operações relevantes e rastreabilidade |
| `API Integration` | Estado das integrações, sincronizações, falhas e última sincronização |
| `auth` | Contexto de autenticação e identidade para autorizar o acesso, não para calcular indicadores de negócio |
| `instructor` e restantes módulos de apoio | Outros indicadores específicos suportados pelos respectivos dados |

**Importante:** a existência de uma ligação não significa que todos os dados devam ser apresentados a todos os utilizadores. Os dados salariais, os resultados individuais de avaliação e o feedback confidencial devem respeitar as permissões e o nível de agregação autorizado.

Os módulos de monitorização e indicadores que decidiste retirar da navegação podem continuar a ter os seus modelos no schema. O Executive Reports deve obter os dados necessários através das fontes funcionais existentes, sem exigir que o antigo módulo volte a aparecer no menu.

---

## 5. Filtros globais

Todos os separadores do módulo devem partilhar filtros coerentes. Quando o utilizador altera um filtro global, os KPIs, gráficos e tabelas devem actualizar-se de acordo com esse contexto.

**Exemplo dos filtros do módulo**

- **Período de análise:**
  - ( ) Este mês
  - ( ) Este trimestre
  - (•) Este ano
  - ( ) Período personalizado
- **Unidade:** Todas as unidades
- **Departamento:** Todos os departamentos
- **Comparar com:**
  - (•) Período anterior
  - ( ) Mesmo período do ano anterior
  - ( ) Meta definida

> Contexto seleccionado: Este ano · Todas as unidades · Todos os departamentos · comparação com Período anterior.
>
> *Demonstração interactiva dos filtros. Não consulta nem altera os dados reais da INNOVA.*

Outros filtros necessários:

- Cargo, categoria profissional e tipo de vínculo.
- Estado do colaborador.
- Curso, formação, turma e formador.
- Estado da avaliação e do plano de desenvolvimento.
- Centro de custo, quando disponível.
- Estado do processo e responsável.
- Estado do indicador: dentro da meta, em alerta ou crítico.
- Fonte de dados e estado de sincronização, quando relevante.

Os filtros devem respeitar os limites de acesso do utilizador. Um gestor de departamento, por exemplo, não deve conseguir contornar as suas permissões através de um filtro ou de um relatório exportado.

---

## 6. Gráficos recomendados

Não deves utilizar o mesmo tipo de gráfico para todos os indicadores. A visualização deve corresponder à pergunta que o indicador pretende responder.

### 1. KPIs e tendências
*Indicadores: colaboradores activos, custo de pessoal, taxa de conclusão e rotatividade.*

Gráfico de linha ou sparkline para evolução mensal, acompanhado do valor actual e da variação percentual.

### 2. Comparação entre departamentos
*Indicadores: dimensão das equipas, formação, desempenho e absentismo.*

Barras horizontais, com ordenação configurável e possibilidade de comparar com metas.

### 3. Distribuição e composição
*Indicadores: colaboradores por unidade, estado, cargo e tipo de vínculo.*

Barras empilhadas para comparar categorias; gráficos circulares apenas para distribuições simples.

### 4. Metas e resultados
*Indicadores: objectivos estratégicos, execução de planos e orçamento.*

Barras de progresso ou gráficos de realizado versus meta, com identificação dos desvios.

### 5. Riscos e anomalias
*Indicadores: saídas, atrasos, faltas, lacunas de competências e tarefas vencidas.*

Dispersão, mapas de calor e listas de excepções. Qualquer pontuação de risco deve ter critérios documentados e validação adequada.

Os gráficos devem permitir clicar num elemento para abrir o detalhe correspondente, desde que o utilizador tenha permissão para consultar esses dados.

---

## 7. Relatórios que o módulo deve gerar

O módulo deve incluir modelos predefinidos para evitar que os utilizadores tenham de construir todos os relatórios de raiz.

| Relatório | Conteúdo |
|---|---|
| Relatório Executivo Mensal | KPIs globais, variações, metas, alertas e principais ocorrências |
| Relatório Trimestral de RH | Evolução do quadro de pessoal, admissões, saídas, ausências e desempenho |
| Relatório Anual de RH | Evolução anual, composição do pessoal, custos e resultados |
| Relatório de Formação | Plano executado, participantes, conclusões, horas, custos e avaliações |
| Relatório de Desempenho | Avaliações realizadas, objectivos e distribuição dos resultados |
| Relatório de Competências | Competências existentes, lacunas e necessidades de desenvolvimento |
| Relatório de PDI e Carreira | Planos activos, progresso, atrasos e evolução profissional |
| Relatório de Onboarding | Admissões, planos de integração, tarefas concluídas e pendências |
| Relatório de Assiduidade | Presenças, faltas, atrasos e tendências de ausência |
| Relatório de Férias e Licenças | Dias utilizados, pedidos, aprovações e ausências planeadas |
| Relatório de Custos de Pessoal | Remunerações, encargos e variação dos custos, com acesso restrito |
| Relatório de Unidades e Departamentos | Comparação de indicadores por estrutura organizacional |
| Relatório de Processos | Volume, duração, atrasos e taxa de conclusão |
| Relatório de Conformidade | Documentos, obrigações, prazos e pendências registadas |
| Relatório de Integrações | Estado das sincronizações, falhas e última execução |
| Relatório Personalizado | Indicadores e campos seleccionados pelo utilizador |

Os relatórios devem poder ser exportados em PDF e Excel, e em CSV quando se pretender exportar dados tabulares. O sistema deve conservar a data de geração, o autor, os filtros utilizados e a versão do modelo.

---

## 8. Relatórios personalizados e agendados

Na aba **Relatórios Personalizados**, o utilizador autorizado deve conseguir:

1. Seleccionar um ou mais módulos de origem.
2. Escolher os indicadores e campos a apresentar.
3. Definir o período de análise.
4. Aplicar filtros por unidade, departamento, estado e outras dimensões.
5. Seleccionar gráficos, tabelas e indicadores.
6. Configurar agrupamentos, ordenação e comparação de períodos.
7. Pré-visualizar o relatório antes de o gerar.
8. Guardar a configuração como modelo reutilizável.
9. Exportar o resultado.

Na aba **Relatórios Agendados**, deve poder definir a periodicidade — semanal, mensal, trimestral ou anual —, os destinatários autorizados, o formato, a hora de execução e o estado do agendamento.

O envio automático deve validar novamente as permissões dos destinatários no momento da entrega. Uma pessoa não deve receber um relatório confidencial apenas porque foi adicionada anteriormente a uma lista de distribuição.

---

## 9. Alertas executivos

A aba **Riscos & Alertas** deve centralizar as situações que necessitam de acompanhamento.

| Alerta | Condição de exemplo | Origem |
|---|---|---|
| Meta de formação em atraso | Execução inferior à meta definida | Trainings |
| Aumento de faltas | Taxa acima do limite configurado | Attendance |
| PDI atrasado | Acção com prazo ultrapassado e não concluída | Development Plans |
| Avaliações pendentes | Ciclo próximo do fecho com avaliações por concluir | Performance |
| Integração incompleta | Tarefas obrigatórias vencidas | Onboarding |
| Aprovações pendentes | Pedidos por aprovar há mais do que o prazo definido | Leave / Processes |
| Desvio de custos | Custo real superior ao orçamento autorizado | Payroll / Orçamento |
| Falha de sincronização | Integração com erro ou sem actualização dentro do prazo esperado | API Integration |
| Documentos a vencer | Documento dentro da janela de aviso configurada | Document Repository |

Cada alerta deve conter a descrição, a gravidade, a data, o módulo de origem, o responsável, o prazo, o estado, o histórico e uma ligação para o registo de origem.

Os limites não devem ser arbitrários: devem ser configuráveis e aprovados pelos responsáveis de cada área.

---

## 10. Como implementar no backend da INNOVA

Considerando a arquitectura NestJS, Prisma e PostgreSQL da plataforma, recomendo organizar o módulo desta forma:

### Estrutura funcional sugerida

| Ficheiro / Pasta | Função |
|---|---|
| `executive-reports/` | Módulo principal |
| `executive-reports.module.ts` | Registo do módulo e dependências |
| `executive-reports.controller.ts` | Endpoints e parâmetros de consulta |
| `executive-reports.service.ts` | Orquestração dos dados e relatórios |
| `executive-reports.metrics.service.ts` | Definições e cálculo dos KPIs |
| `executive-reports.data.service.ts` | Agregação de dados dos módulos de origem |
| `executive-reports-alerts.service.ts` | Regras e alertas executivos |
| `executive-reports-export.service.ts` | Geração de PDF, Excel e CSV |
| `executive-reports-scheduler.service.ts` | Execução de relatórios agendados |
| `dto/` | Filtros, pedidos de exportação e agendamento |
| `tests/` | Testes unitários e de integração |

Esta é uma proposta de organização, não uma afirmação de que estes ficheiros já existem. Antes de criar os ficheiros, verifica a estrutura actual do projecto e reutiliza os serviços, DTOs, guards e bibliotecas de exportação já existentes.

### Endpoints sugeridos

| Método | Endpoint | Função |
|---|---|---|
| GET | `/executive-reports/overview` | Resumo executivo |
| GET | `/executive-reports/kpis` | Indicadores e metas |
| GET | `/executive-reports/workforce` | Relatórios de colaboradores |
| GET | `/executive-reports/training` | Relatórios de formação |
| GET | `/executive-reports/performance` | Desempenho e talento |
| GET | `/executive-reports/attendance` | Assiduidade e ausências |
| GET | `/executive-reports/organization` | Comparações entre unidades |
| GET | `/executive-reports/costs` | Custos autorizados |
| GET | `/executive-reports/alerts` | Alertas executivos |
| GET | `/executive-reports/templates` | Modelos disponíveis |
| POST | `/executive-reports/generate` | Gerar relatório |
| GET | `/executive-reports/:id` | Consultar relatório guardado |
| GET | `/executive-reports/:id/export` | Exportar relatório |
| GET | `/executive-reports/schedules` | Consultar agendamentos |
| POST | `/executive-reports/schedules` | Criar agendamento |
| PATCH | `/executive-reports/schedules/:id` | Alterar agendamento |
| DELETE | `/executive-reports/schedules/:id` | Eliminar agendamento |

Todos os endpoints devem validar a identidade, a autorização, os filtros e os limites de dados. Os nomes são sugestões e devem ser alinhados com os padrões de rotas existentes no backend.

---

## 11. Modelo de dados a considerar

Não é necessário duplicar todos os colaboradores, salários, inscrições e avaliações para construir relatórios. Os dados operacionais devem continuar nos seus módulos de origem.

O módulo de relatórios poderá precisar de modelos próprios para guardar configurações, execuções e resultados de auditoria.

| Modelo proposto | Campos principais |
|---|---|
| `ExecutiveReportTemplate` | `id`, `name`, `description`, `category`, `config`, `createdById`, `createdAt`, `updatedAt` |
| `ExecutiveReportRun` | `id`, `templateId`, `requestedById`, `filters`, `status`, `format`, `generatedAt`, `completedAt`, `errorMessage` |
| `ExecutiveReportSchedule` | `id`, `templateId`, `frequency`, `nextRunAt`, `recipients`, `format`, `active`, `createdById` |
| `ExecutiveKPIDefinition` | `id`, `code`, `name`, `description`, `formula`, `sourceModules`, `unit`, `target`, `warningThreshold`, `criticalThreshold`, `ownerId`, `active` |
| `ExecutiveReportAudit` | `id`, `userId`, `reportRunId`, `action`, `filters`, `createdAt` |

Os nomes são indicativos e devem ser adaptados ao schema Prisma actual. Se a INNOVA já possuir modelos de relatórios, agendamento ou histórico, reutiliza-os em vez de criar duplicados.

Para relatórios de grande volume, poderá fazer sentido manter agregações ou snapshots históricos. Estes devem ter regras de actualização e reconciliação com os dados de origem.

---

## 12. Regras fundamentais de negócio

1. **Uma definição única por KPI:** a taxa de conclusão de formação, por exemplo, deve seguir a mesma fórmula em todos os relatórios.
2. **Períodos consistentes:** distinguir valores actuais, movimentos ocorridos durante o período e valores acumulados.
3. **Dados em falta:** apresentar "Sem dados" quando a informação não existe; não converter automaticamente ausência de dados em zero.
4. **Histórico preservado:** relatórios antigos devem conservar os filtros, a data de execução e a versão das fórmulas utilizadas.
5. **Controlo de acesso:** respeitar as permissões por perfil, unidade, departamento e tipo de informação.
6. **Privacidade:** aplicar agregação, minimização de dados e ocultação de detalhes individuais quando necessário.
7. **Rastreabilidade:** permitir identificar o módulo e os registos que fundamentam cada resultado, dentro das permissões do utilizador.
8. **Desempenho:** utilizar consultas agregadas eficientes e cache apenas quando a validade temporal dos dados o permitir.
9. **Integridade:** detectar falhas de sincronização, duplicados e discrepâncias entre módulos.
10. **Automatização segura:** impedir execuções duplicadas de agendamentos e registar falhas de geração ou entrega.

Estas regras estão alinhadas com boas práticas de governação de dados, definição de métricas, controlo de acesso e rastreabilidade em analytics.

---

## 13. Interface frontend

Na interface Next.js da INNOVA, sugiro manter o padrão visual actual, com os mesmos componentes de cartões, filtros, tabelas, separadores e gráficos já utilizados na plataforma.

A página principal pode seguir esta disposição:

```
┌──────────────────────────────────────────────────────────────┐
│ Executive Reports                              [Administração]│
│ Relatórios Executivos · INNOVA                               │
│                                                              │
│ [Período: este ano] [Todas as unidades] [Comparar períodos]  │
│                                                              │
│ ┌──────────────────────┐  ┌──────────────────────┐           │
│ │ Colaboradores        │  │ Formação             │           │
│ │ —                    │  │ —                    │           │
│ │ Total e variação     │  │ Conclusão e particip.│           │
│ └──────────────────────┘  └──────────────────────┘           │
│ ┌──────────────────────┐  ┌──────────────────────┐           │
│ │ Desempenho           │  │ Alertas              │           │
│ │ —                    │  │ —                    │           │
│ │ Metas e avaliações   │  │ Pendências e desvios │           │
│ └──────────────────────┘  └──────────────────────┘           │
│                                                              │
│ Evolução dos indicadores                                     │
│   Gráficos de tendência e comparação                         │
│                                                              │
│ Principais alertas                                           │
│   Lista de situações que exigem acompanhamento               │
└──────────────────────────────────────────────────────────────┘
```

> *Esboço estrutural da interface, sem ligação à base de dados.*

---

## 14. Critérios para considerar o módulo concluído

Antes de dar o módulo por terminado, confirma estes pontos:

**Lista de validação** (0 de 10)

- [ ] Os indicadores recebem dados reais dos módulos de origem.
- [ ] Os filtros globais funcionam em todos os separadores aplicáveis.
- [ ] Os KPIs têm fórmulas, metas, períodos e fontes documentados.
- [ ] Os gráficos e tabelas permitem consultar detalhes autorizados.
- [ ] Os relatórios podem ser gerados e exportados.
- [ ] Os agendamentos executam e registam os resultados.
- [ ] Os alertas têm regras, responsáveis e histórico.
- [ ] As permissões são verificadas no backend, incluindo nas exportações.
- [ ] Os relatórios antigos preservam o contexto da geração.
- [ ] Existem testes para cálculos, permissões, filtros e falhas de integração.

---

## Recomendação final para a INNOVA

O `executive-reports` deve funcionar como uma **camada de análise transversal**, e não como uma segunda base de dados operacional. Deve estar ligado a todos os módulos relevantes, mas consumir de cada um apenas os dados necessários e autorizados.

A implementação deve começar pelo catálogo de KPIs, pelas permissões e pela integração com os módulos existentes. Depois, desenvolve-se o Dashboard Executivo, os relatórios predefinidos, os filtros, as exportações e, por último, os agendamentos e alertas automáticos.

Para a tua plataforma, é também importante manter a separação entre o dashboard executivo e os dashboards operacionais existentes: o primeiro consolida os resultados da organização; os segundos continuam a apresentar o detalhe necessário para executar o trabalho diário.
