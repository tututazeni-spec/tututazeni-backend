# Especificação funcional — Módulo Leave da INNOVA

*Férias, Licenças e Gestão de Ausências | RH — Grupo Carrinho*

O módulo Leave deve centralizar a gestão de férias, licenças e ausências dos colaboradores da INNOVA, desde a submissão do pedido até à aprovação, ao registo da ausência e à actualização dos dados de assiduidade.

Deve estar integrado com os módulos Users, Departments, Organization, Attendance, Payroll & Payslips, Processes, Automation, Notifications, Calendar, Work Declaration, History e Executive Reports.

> **Regra fundamental:** o pedido de ausência e o processo de aprovação devem permanecer separados. O modelo `LeaveRequest` gere o pedido; o modelo `LeaveApproval` gere as decisões de aprovação. Não devem ser fundidos num único modelo.

---

## 1. Estrutura das abas do módulo

| # | Aba | Descrição |
|---|---|---|
| 1 | Visão Geral | Indicadores de férias, licenças, ausências, pedidos pendentes e impacto na disponibilidade dos colaboradores. |
| 2 | Férias | Planeamento anual, saldos, pedidos, dias gozados e dias disponíveis. |
| 3 | Licenças | Gestão de licenças previstas na legislação e nas políticas internas, com documentação e aprovações. |
| 4 | Gestão de Ausências | Registo de faltas justificadas e injustificadas, ausências parciais e outras ocorrências. |
| 5 | Calendário de Ausências | Vista diária, semanal, mensal e anual das ausências aprovadas, com filtros por equipa, unidade e departamento. |
| 6 | Aprovações | Pedidos pendentes, decisões, comentários, delegações e escalonamento de aprovações. |
| 7 | Planeamento de Equipas | Sobreposição de férias, cobertura operacional e disponibilidade de colaboradores por equipa. |
| 8 | Relatórios | Indicadores de absentismo, utilização de férias, padrões de ausência e impacto por unidade. |
| 9 | Configurações | Tipos de ausência, regras de contagem, saldos, documentos exigidos, feriados, permissões e fluxos de aprovação. |

---

## 2. Visão Geral — Dashboard de férias e ausências

O dashboard deve apresentar dados actualizados e respeitar o perfil do utilizador. Um colaborador vê os seus pedidos e saldos; um gestor vê a sua equipa; o RH autorizado pode consultar a organização.

### Cards de indicadores

| Card | Descrição |
|---|---|
| Férias disponíveis | Saldo de dias disponível no período de referência. |
| Pedidos pendentes | Pedidos que aguardam decisão. |
| Dias de férias gozados | Dias efectivamente utilizados no período. |
| Ausências no período | Ocorrências registadas, justificadas e injustificadas. |

### Gráficos recomendados

- **Ausências por mês:** gráfico de linhas para acompanhar a evolução.
- **Ausências por tipo:** gráfico de barras ou anel para férias, licenças e faltas.
- **Absentismo por departamento:** gráfico de barras comparativas.
- **Férias planeadas vs. gozadas:** barras agrupadas por mês.
- **Pedidos por estado:** gráfico de barras para pendentes, aprovados, recusados e cancelados.
- **Calendário de disponibilidade:** visualização das ausências aprovadas por equipa.

Os gráficos devem incluir filtros por período, unidade, departamento, tipo de ausência e estado.

---

## 3. Aba Férias

Esta aba deve gerir todo o ciclo anual de férias.

### 3.1. Tabela de férias

| Campo | Descrição |
|---|---|
| Colaborador | Nome completo e número interno |
| Departamento | Departamento de afectação |
| Unidade | Loja, logística, indústria ou outra unidade |
| Ano de referência | Ano a que pertence o saldo |
| Dias atribuídos | Direito a férias configurado |
| Dias transitados | Saldo transportado de período anterior, quando permitido |
| Dias reservados | Dias de pedidos aprovados ainda não gozados |
| Dias gozados | Dias efectivamente utilizados |
| Saldo disponível | Saldo calculado conforme as regras configuradas |
| Próximo período | Próximas férias aprovadas |
| Estado do plano | Não iniciado, em preparação, submetido ou aprovado |

O sistema deve distinguir dias úteis, dias de calendário e outras regras de contagem configuradas. Não deve assumir que todas as unidades ou tipos de licença usam o mesmo método.

### 3.2. Modal «Novo pedido de férias»

*Campos recomendados para o formulário de submissão.*

| Campo | Placeholder / indicação |
|---|---|
| Colaborador \* | Seleccionar colaborador |
| Ano de referência \* | Seleccionar ano |
| Data de início \* | DD/MM/AAAA |
| Data de fim \* | DD/MM/AAAA |
| Total de dias | Calculado automaticamente pelas regras aplicáveis |
| Contacto durante as férias | Telefone ou contacto alternativo (opcional) |
| Pessoa de substituição | Seleccionar colaborador, se aplicável |
| Observações | Motivo ou informação complementar |

O formulário real deve validar o saldo, as datas, as sobreposições e as regras de aprovação antes da submissão.

### 3.3. Regras funcionais das férias

- Calcular automaticamente a duração do pedido.
- Consultar o saldo antes da submissão.
- Impedir pedidos que excedam o saldo permitido, salvo excepção autorizada.
- Verificar feriados e dias não úteis conforme o calendário aplicável.
- Detectar sobreposição com outros pedidos do colaborador.
- Alertar o gestor quando existirem ausências simultâneas na equipa.
- Reservar os dias após aprovação, sem os contabilizar como já gozados.
- Converter os dias reservados em gozados quando a ausência se concretizar.
- Libertar o saldo reservado quando o pedido for cancelado ou alterado, conforme a política.
- Permitir pedidos parciais, quando autorizados.
- Registar alterações de datas, cancelamentos e decisões.

O saldo não deve ser reduzido duas vezes: uma na aprovação e outra no registo de gozo. Deve existir uma regra de contabilização consistente.

---

## 4. Aba Licenças

Esta aba deve gerir licenças legais e licenças previstas nas políticas internas da organização.

### Tipos de licença configuráveis

- Licença por maternidade.
- Licença por paternidade.
- Licença por adopção, quando aplicável.
- Licença por doença ou incapacidade temporária.
- Licença por assistência à família.
- Licença por falecimento de familiar.
- Licença por casamento.
- Licença por cumprimento de obrigações legais.
- Licença sem remuneração.
- Outras licenças autorizadas pela legislação ou pela política interna.

Estes tipos são categorias propostas para configuração. A duração, remuneração, documentação e elegibilidade devem ser parametrizadas de acordo com a legislação angolana em vigor, os instrumentos colectivos aplicáveis e as regras internas aprovadas, sem codificar prazos legais presumidos.

### Tabela de licenças

| Campo | Descrição |
|---|---|
| Colaborador | Titular da licença |
| Tipo de licença | Categoria seleccionada |
| Data de início e fim | Período solicitado ou registado |
| Duração | Dias ou horas calculados |
| Regime remuneratório | Remunerada, não remunerada ou sujeito a validação |
| Documento comprovativo | Referência a documento protegido, quando necessário |
| Data de submissão | Momento em que foi registada |
| Aprovador | Responsável pela decisão |
| Estado | Rascunho, pendente, aprovada, recusada, em curso ou concluída |
| Impacto no processamento salarial | Indicação para validação pelo Payroll, quando aplicável |

### Modal «Nova licença»

Deve conter:

1. Colaborador.
2. Tipo de licença.
3. Data e hora de início, se necessário.
4. Data e hora de fim prevista.
5. Motivo ou fundamento.
6. Documentação comprovativa, quando exigida.
7. Observações.
8. Responsável pelo pedido, quando registado em nome do colaborador.
9. Encaminhamento para aprovação.
10. Informação sobre o impacto salarial, apenas para os perfis autorizados.

Os documentos que contenham informações de saúde ou outros dados sensíveis devem ter acesso restrito. O gestor não deve receber detalhes clínicos desnecessários para decidir sobre a ausência.

---

## 5. Aba Gestão de Ausências

Esta área deve registar tanto ausências planeadas como ocorrências imprevistas.

### Tipos de ocorrência

- Falta justificada.
- Falta injustificada.
- Atraso.
- Saída antecipada.
- Ausência parcial.
- Ausência por motivo de saúde.
- Ausência autorizada.
- Ausência por motivo pessoal.
- Não comparência.
- Outra ocorrência configurada pelo RH.

As categorias devem ser compatíveis com o módulo Attendance. Se a falta já foi registada na assiduidade, a INNOVA deve associar o registo existente em vez de criar uma segunda ocorrência independente.

### Campos da tabela

| Campo | Descrição |
|---|---|
| Colaborador | Pessoa a que se refere a ocorrência |
| Data da ocorrência | Dia da ausência |
| Hora de início e fim | Para ausências parciais |
| Duração | Horas ou dias |
| Tipo de ocorrência | Categoria da ausência |
| Justificação | Informação apresentada |
| Comprovativo | Documento, se aplicável |
| Origem do registo | Manual, Attendance ou integração |
| Estado de justificação | Por justificar, submetida, validada ou recusada |
| Validador | Responsável pela validação |
| Impacto na assiduidade | Estado relacionado no módulo Attendance |
| Impacto salarial | Indicação para análise pelo Payroll, quando aplicável |

### Acções disponíveis

- Registar ausência.
- Submeter justificação.
- Validar ou recusar justificação.
- Anexar comprovativo.
- Corrigir registo com auditoria.
- Consultar histórico do colaborador.
- Encaminhar para o gestor.
- Enviar para validação do RH.
- Exportar relatório autorizado.

---

## 6. Aba Calendário de Ausências

Deve apresentar as ausências e férias aprovadas numa vista de calendário.

### Funcionalidades

- Vistas diária, semanal, mensal e anual.
- Filtros por unidade, departamento, equipa e colaborador.
- Identificação visual por tipo de ausência.
- Consulta de períodos de férias aprovados.
- Indicação de equipas com cobertura insuficiente.
- Detecção de sobreposição de ausências.
- Exportação ou impressão, de acordo com as permissões.
- Integração com o calendário de Events, se aplicável.

O calendário não deve revelar motivos médicos ou outros detalhes privados. Para a maioria dos utilizadores, deve apresentar apenas a indisponibilidade e o período.

---

## 7. Aba Aprovações

O processo de aprovação deve estar separado do pedido, mantendo a estrutura `LeaveRequest` + `LeaveApproval`.

### Fluxo de aprovação recomendado

1. **Pedido submetido** — Validação inicial dos dados e do saldo.
2. **Aprovação do gestor** — Verificação da equipa e cobertura operacional.
3. **Validação do RH** — Quando exigida pela política aplicável.
4. **Pedido aprovado** — Actualizar saldo reservado e calendário.
5. **Registo e acompanhamento** — Integrar com Attendance, Payroll e History conforme necessário.

O fluxo deve ser configurável por tipo de pedido, unidade, duração e nível de autorização. Nem todos os pedidos precisam obrigatoriamente de duas aprovações.

### Dados de cada aprovação

- Pedido associado.
- Etapa de aprovação.
- Aprovador atribuído.
- Data de atribuição.
- Prazo para decisão.
- Estado.
- Decisão: aprovar ou recusar.
- Comentário ou justificação.
- Data da decisão.
- Substituto ou delegado, se autorizado.
- Histórico de reatribuições.

Uma recusa deve exigir uma justificação. Uma aprovação deve ficar identificada com o utilizador e a data da decisão.

---

## 8. Aba Planeamento de Equipas

Esta aba ajuda os gestores e o RH a manter a continuidade operacional.

### Deve apresentar

- Colaboradores disponíveis por período.
- Férias aprovadas e planeadas.
- Ausências previstas.
- Número de colaboradores ausentes por equipa.
- Percentagem de disponibilidade.
- Limite mínimo de cobertura por equipa.
- Sobreposição de férias.
- Pedidos que entram em conflito com períodos críticos.
- Alertas de falta de cobertura.
- Pessoa de substituição, quando aplicável.

O sistema pode avisar que uma equipa ficará abaixo da cobertura mínima, mas não deve recusar automaticamente o pedido sem uma política aprovada que autorize essa decisão.

---

## 9. Aba Relatórios

### Relatórios essenciais

| Relatório | Indicadores |
|---|---|
| Mapa anual de férias | Dias atribuídos, gozados, reservados e disponíveis |
| Ausências por departamento | Número de ocorrências e duração |
| Absentismo mensal | Taxa de absentismo por período |
| Faltas justificadas vs. injustificadas | Número e duração por categoria |
| Licenças por tipo | Quantidade, duração e estado |
| Pedidos pendentes | Tempo de espera e responsável |
| Férias por colaborador | Histórico e saldo por ano |
| Cobertura operacional | Disponibilidade por equipa |
| Impacto no processamento salarial | Registos que necessitam de validação do Payroll |
| Auditoria de pedidos | Alterações, decisões, cancelamentos e responsáveis |

A taxa de absentismo deve utilizar uma fórmula documentada, por exemplo:

```text
Taxa de absentismo = (Horas de ausência contabilizáveis ÷ Horas de trabalho previstas) × 100
```

O sistema deve permitir configurar quais as categorias incluídas no numerador. Férias aprovadas e outros períodos legalmente excluídos não devem ser contabilizados automaticamente como absentismo.

---

## 10. Aba Configurações

### Configurações gerais

- Ano de referência e período de férias.
- Calendário de feriados por localização.
- Semana de trabalho e horário aplicável.
- Regra de contagem de dias.
- Tipos de ausência.
- Categorias justificadas e injustificadas.
- Regras de saldo e transição de dias.
- Limites de antecedência para pedidos.
- Documentos exigidos por categoria.
- Regras de aprovação e substituição.
- Prazos de decisão e escalonamento.
- Políticas de cancelamento e alteração.
- Limites de cobertura operacional.
- Permissões por perfil e unidade.
- Regras de integração com assiduidade e processamento salarial.

As regras legais devem ser configuráveis e mantidas pelo RH autorizado, com histórico de alterações e data de entrada em vigor.

---

## 11. Integração com todos os módulos da INNOVA

| Módulo | Integração necessária |
|---|---|
| Users | Identificação do colaborador, estado da conta, função e responsável |
| Departments | Departamento e gestor responsável |
| Organization | Hierarquia, unidades, equipas e regras de aprovação |
| Attendance | Correspondência entre ausências e registos de assiduidade |
| Payroll & Payslips | Disponibilizar ausências validadas para análise do processamento salarial |
| Processes | Gerir etapas, prazos e escalonamentos de aprovação |
| Automation | Gerar lembretes, alertas de saldo, prazos e ausências |
| Notifications | Informar colaborador, gestor e RH sobre mudanças de estado |
| Events / Calendar | Mostrar ausências aprovadas e disponibilidade das equipas |
| Work Declaration | Apoiar a emissão de declarações relacionadas, quando aplicável |
| Document Repository / Biblioteca | Guardar comprovativos e documentos autorizados |
| History / Audit | Registar submissões, alterações, aprovações e cancelamentos |
| Executive Reports | Disponibilizar indicadores consolidados de férias e ausências |
| Analytics / Dashboard RH | Alimentar gráficos de absentismo, saldos e tendências |
| Integrations / API | Trocar dados com sistemas externos autorizados |
| Development Plans | Reprogramar actividades de desenvolvimento afectadas por ausências, quando necessário |
| Trainings | Identificar indisponibilidade de participantes e formadores |
| Onboarding | Considerar ausências em tarefas e datas de integração |
| Users / Permissions | Aplicar acesso por função, unidade e departamento |

A integração com Payroll deve disponibilizar dados validados, não calcular automaticamente descontos ou direitos sem as regras salariais e legais correspondentes. A integração com documentos deve limitar o acesso a comprovativos sensíveis.

---

## 12. Estrutura técnica recomendada — NestJS + Prisma

Entidades que devem ser verificadas no `schema.prisma` antes de implementar:

| Modelo | Responsabilidade |
|---|---|
| `LeaveRequest` | Pedido de férias, licença ou ausência |
| `LeaveApproval` | Etapas e decisões de aprovação, separado do pedido |
| `LeaveType` | Tipos e categorias de ausência |
| `LeaveBalance` | Saldos por colaborador e período |
| `LeaveBalanceTransaction` | Movimentos de atribuição, reserva, gozo, ajuste e reversão |
| `LeavePolicy` | Regras aplicáveis por tipo e grupo de colaboradores |
| `LeaveAttachment` | Referência a documentos comprovativos |
| `LeaveCalendar` | Configuração ou referência aos calendários aplicáveis |
| `LeaveDelegation` | Delegação temporária de responsabilidades |
| `LeaveAuditLog` | Auditoria específica do módulo, caso não exista auditoria central reutilizável |

Estes nomes são uma proposta, não uma indicação para criar modelos duplicados. Se o projecto já possuir modelos equivalentes, devem ser reutilizados e adaptados.

### Campos essenciais de `LeaveRequest`

- `id`
- `requestNumber`
- `userId`
- `leaveTypeId`
- `startDate`
- `endDate`
- `startPeriod` e `endPeriod`, se forem suportadas ausências parciais
- `requestedDays`
- `reason`
- `status`
- `submittedAt`
- `cancelledAt`
- `createdAt`
- `updatedAt`

Os campos de duração, saldo e estado devem ser validados no backend. Os campos de auditoria devem identificar quem criou, alterou ou cancelou o pedido.

### Requisitos técnicos

- Não duplicar os registos do módulo Attendance.
- Manter histórico de decisões de aprovação.
- Utilizar transacções para operações críticas sobre saldos.
- Impedir reservas duplicadas de dias.
- Garantir que apenas pedidos aprovados actualizam o calendário como ausências confirmadas.
- Aplicar permissões no backend, não apenas ocultar botões no frontend.
- Proteger anexos e informações sensíveis.
- Disponibilizar endpoints para consulta, submissão, aprovação, recusa, cancelamento e relatórios.
- Criar testes para conflitos de datas, saldos, permissões, aprovações e reversões.

---

## 13. Critérios de aceitação

- O colaborador pode consultar o saldo e submeter pedidos.
- O gestor pode analisar os pedidos da sua equipa.
- O RH pode configurar políticas e consultar os dados autorizados.
- Os pedidos e as aprovações permanecem em modelos separados.
- Os saldos distinguem dias atribuídos, reservados e gozados.
- Os feriados e as regras de contagem são aplicados correctamente.
- As ausências aprovadas são sincronizadas com o calendário.
- O módulo Attendance não recebe registos duplicados.
- O Payroll recebe apenas informação validada e necessária.
- As notificações e os lembretes são accionados nos momentos correctos.
- As decisões e alterações ficam registadas no histórico.
- Os relatórios respeitam as permissões e as regras de cálculo.
- Existem testes unitários, de integração e de autorização.

> **Recomendação final:** desenvolver primeiro Férias, Licenças, Gestão de Ausências e Aprovações; depois ligar Attendance, Payroll, Notifications e Automation. Esta sequência cria um processo consistente, desde o pedido do colaborador até ao impacto na assiduidade e nos relatórios de RH, sem duplicar funcionalidades existentes.
