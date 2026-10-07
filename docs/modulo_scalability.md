## 2. Estrutura recomendada do módulo

Eu criaria estas abas:

1. Visão Geral
2. Utilizadores & Carga
3. API & Backend
4. Base de Dados
5. Frontend & CDN
6. Filas & Jobs
7. Storage
8. Integrações
9. Performance
10. Capacidade
11. Auto Scaling
12. Resiliência
13. Incidentes de Capacidade
14. Previsões
15. Testes de Carga
16. Custos
17. Infraestrutura
18. Alertas
19. Relatórios
20. Configurações

---

## 3. Aba Visão Geral

É o dashboard executivo da escalabilidade.

### Cards principais

| Card | Valor de exemplo |
|---|---|
| Utilizadores registados | 6.000 |
| Utilizadores ativos | 4.820 |
| Utilizadores simultâneos | 1.284 |
| Capacidade estimada | 10.000 utilizadores |
| Utilização da capacidade | 48% |
| CPU | 42% |
| Memória | 61% |
| Base de dados | 54% |
| Storage | 67% |
| Filas pendentes | 128 |
| Latência média API | 184 ms |
| Disponibilidade | 99,97% |

---

## 4. Indicador geral de capacidade

Um indicador visual:

```text
Capacidade da INNOVA
████████████░░░░░░░░ 61%
```

**Estado:**

- Saudável
- Atenção
- Elevada utilização
- Crítica

Deve existir uma explicação:

> A infraestrutura atual suporta aproximadamente X utilizadores simultâneos nas condições atuais.

---

## 5. Gráficos principais

### Utilização ao longo do tempo

Linha temporal:

- CPU
- RAM
- Requests
- Utilizadores simultâneos
- Latência

### Crescimento de utilizadores

Gráfico de linha:

- Utilizadores registados
- Utilizadores ativos
- Crescimento mensal

### Capacidade vs utilização

Gráfico comparativo: **Capacidade disponível** vs. **Consumo atual**

### Previsão

Exemplo:

> Com o crescimento atual, a infraestrutura atingirá 80% da capacidade estimada em aproximadamente 4 meses.

---

## 6. Aba Utilizadores & Carga

Esta área mede o impacto do crescimento dos utilizadores.

### Indicadores

- Total de utilizadores.
- Utilizadores ativos.
- Utilizadores ativos diariamente.
- Utilizadores ativos mensalmente.
- Utilizadores simultâneos.
- Pico de utilizadores simultâneos.
- Média de sessões.
- Duração média das sessões.
- Requests por utilizador.
- Crescimento diário.
- Crescimento mensal.
- Crescimento anual.

### Segmentação

Por:

- Unidade.
- Departamento.
- Cargo.
- Perfil.
- Localização organizacional.
- Tipo de utilizador.
- Web/mobile.

### Gráfico

**Concurrent Users** — mostrar:

- média
- máximo
- mínimo
- pico histórico

---

## 7. Aba API & Backend

Monitorização da capacidade da API NestJS.

### Métricas

- Requests por segundo.
- Requests por minuto.
- Requests por endpoint.
- Latência média.
- P50.
- P95.
- P99.
- Taxa de erro.
- HTTP 4xx.
- HTTP 5xx.
- Timeout.
- Requests concorrentes.
- Throughput.
- Tempo de processamento.
- Requests lentos.

### Endpoint

| Endpoint | Requests | P95 | Erros | Estado |
|---|---|---|---|---|
| /users | 1.240 | 180 ms | 0,2% | |
| /courses | 980 | 240 ms | 0,4% | |
| /payroll | 420 | 620 ms | 1,1% | |

Isto permitirá identificar exatamente onde a aplicação começa a perder performance.

---

## 8. Aba Base de Dados

Esta é uma das áreas mais importantes para a INNOVA.

Como a plataforma terá RH, Payroll, Attendance, Training, Audit, Processes, Automations etc., a base de dados será um dos principais pontos de escalabilidade.

### Indicadores

- CPU da BD.
- RAM.
- Storage.
- IOPS.
- Throughput.
- Conexões ativas.
- Conexões máximas.
- Pool de conexões.
- Queries por segundo.
- Queries lentas.
- Locks.
- Deadlocks.
- Cache hit ratio.
- Tamanho da BD.
- Crescimento diário.
- Crescimento mensal.
- Crescimento anual.
- Índices.
- Índices inutilizados.
- Tabelas maiores.
- Tabelas que mais crescem.

### Queries lentas

| Query | Execuções | Tempo médio | P95 | Estado |
|---|---|---|---|---|
| Query A | 20k | 80 ms | 240 ms | |
| Query B | 15k | 450 ms | 1,2 s | |

---

## 9. Crescimento da base de dados

Deve existir um gráfico: **Database Growth**

Últimos:

- 7 dias
- 30 dias
- 90 dias
- 1 ano

E previsão:

- Base de dados atual: 42 GB
- Crescimento médio: 1,4 GB/mês
- Previsão 12 meses: 58,8 GB

---

## 10. Aba Frontend & CDN

Para o Next.js da INNOVA.

### Métricas

- Page Load.
- First Contentful Paint.
- Largest Contentful Paint.
- Interaction to Next Paint.
- Time to First Byte.
- JavaScript bundle size.
- CSS size.
- Imagens.
- Cache hit ratio.
- Requests.
- Erros frontend.
- Tempo de carregamento por página.

### Páginas críticas

- Dashboard.
- Dashboard RH.
- Analytics.
- Reports.
- Payroll.
- Training.
- Users.
- Courses.

Deve identificar páginas que ficam lentas com grandes volumes de dados.

---

## 11. Aba Filas & Jobs

Essencial para:

- Automations.
- Processes.
- Notifications.
- Payroll.
- Reports.
- Imports.
- Exports.
- AI Tutor.
- Avatar Training.
- Integrações.

### Indicadores

- Jobs executados.
- Jobs pendentes.
- Jobs em execução.
- Jobs falhados.
- Jobs atrasados.
- Tempo médio de execução.
- Throughput.
- Tamanho da fila.
- Retry count.

### Gráfico

**Queue Depth** — mostrar o crescimento da fila ao longo do tempo.

---

## 12. Aba Storage

Monitorização de:

- Document Repository.
- Content Library.
- Attachments.
- Evidências de Audit.
- Fotografias.
- Vídeos.
- Conteúdo de formação.
- Ficheiros exportados.

### Indicadores

- Storage total.
- Utilizado.
- Disponível.
- Crescimento mensal.
- Ficheiros armazenados.
- Maiores ficheiros.
- Tipos de ficheiro.
- Storage por módulo.
- Storage por unidade.

---

## 13. Aba Integrações

Como a INNOVA terá integrações ERP, SSO, LMS, comunicação, APIs etc.

### Indicadores

- Integrações ativas.
- Requests.
- Sincronizações.
- Falhas.
- Latência.
- Retries.
- Jobs pendentes.
- Volume de dados transferido.

### Por integração

| Integração | Requests | Erros | Latência | Estado |
|---|---|---|---|---|
| ERP | 12.400 | 0,3% | 320 ms | |
| SSO | 8.200 | 0,1% | 180 ms | |
| LMS | 4.300 | 2,1% | 780 ms | |

---

## 14. Aba Performance

Aqui deve existir uma visão transversal.

### KPIs

- Response time.
- API latency.
- Database latency.
- Frontend latency.
- Error rate.
- Throughput.
- Requests/sec.
- Queue latency.
- Job execution time.

### Classificação

- Excelente
- Normal
- Atenção
- Degradação
- Crítico

---

## 15. Aba Capacidade

Esta é a área central do módulo.

Deve mostrar:

### Capacidade atual

- Utilizadores totais.
- Utilizadores ativos.
- Concurrent users.
- Requests/sec.
- Database connections.
- Storage.
- Queue throughput.

### Capacidade máxima estimada

Exemplo:

| Recurso | Atual | Capacidade | Utilização |
|---|---|---|---|
| Utilizadores | 6.000 | 20.000 | 30% |
| Concurrent users | 1.200 | 5.000 | 24% |
| API RPS | 180 | 800 | 23% |
| DB connections | 90 | 200 | 45% |
| Storage | 400 GB | 1 TB | 40% |

---

## 16. Aba Auto Scaling

Se a infraestrutura suportar escalabilidade automática, esta área deve controlar as regras.

### Configurações

- Minimum instances.
- Maximum instances.
- Target CPU.
- Target memory.
- Requests per instance.
- Scale-up threshold.
- Scale-down threshold.
- Cooldown.
- Scheduled scaling.
- Emergency scaling.

### Exemplo

- Se CPU > 70% durante 5 minutos → adicionar instância.
- Se CPU < 30% durante 15 minutos → remover instância.

As alterações dessas configurações devem ser registadas no Audit.

---

## 17. Aba Resiliência

Não basta conseguir suportar mais utilizadores; a INNOVA precisa continuar disponível quando um componente falhar.

### Deve verificar

- Redundância da API.
- Redundância da base de dados.
- Backups.
- Replicação.
- Failover.
- Health checks.
- Load balancing.
- CDN.
- Disaster recovery.
- Recovery Point Objective — RPO.
- Recovery Time Objective — RTO.

### Indicadores

| Indicador | Exemplo |
|---|---|
| RPO | 15 minutos |
| RTO | 1 hora |
| Último backup | há 12 minutos |
| Último teste de recuperação | data |

---

## 18. Aba Incidentes de Capacidade

Deve registar problemas como:

- Sobrecarga.
- API lenta.
- Base de dados saturada.
- Storage cheio.
- Queue congestionada.
- Timeout.
- Memory leak.
- CPU elevada.
- Falhas de scaling.
- Degradação de performance.

### Estados

- Aberto.
- Investigação.
- Mitigação.
- Resolvido.
- Encerrado.

### Dados

- ID.
- Título.
- Data.
- Componente.
- Severidade.
- Impacto.
- Utilizadores afetados.
- Causa raiz.
- Medida aplicada.
- Duração.
- Responsável.
- Post-mortem.

---

## 19. Aba Previsões

Aqui a INNOVA deve usar os dados históricos para antecipar problemas.

### Previsões

- Crescimento de utilizadores.
- Crescimento da base de dados.
- Crescimento do storage.
- Crescimento das requests.
- Crescimento de concurrent users.
- Necessidade de CPU.
- Necessidade de RAM.
- Necessidade de capacidade de BD.

### Exemplo

- Utilizadores atuais: 6.000
- Crescimento médio mensal: 5,8%
- Previsão 12 meses: ~11.700

Depois:

> A infraestrutura atual poderá atingir 80% da capacidade estimada em março de 2027.

---

## 20. Aba Testes de Carga

Muito importante para a INNOVA.

Permitir registar e acompanhar testes:

### Tipos

- Load test.
- Stress test.
- Spike test.
- Endurance test.
- Volume test.
- Failover test.

### Configuração

- Utilizadores simulados.
- Requests/sec.
- Duração.
- Cenário.
- Módulos envolvidos.
- Ambiente.
- Versão da aplicação.

### Resultados

- Throughput.
- P95.
- P99.
- Erros.
- CPU.
- RAM.
- DB.
- Queue.
- Concurrent users.

### Resultado

- Aprovado
- Aprovado com observações
- Reprovado

---

## 21. Aba Custos

Esta aba relaciona crescimento com custo de infraestrutura.

### Indicadores

- Custo atual.
- Custo por utilizador.
- Custo por utilizador ativo.
- Custo de BD.
- Custo de storage.
- Custo de compute.
- Custo de tráfego.
- Custo de backups.
- Custo de serviços externos.

### Previsão

| Utilizadores | Custo estimado |
|---|---|
| 6.000 | X |
| 10.000 | X |
| 20.000 | X |
| 50.000 | X |

Isto é particularmente importante para a INNOVA porque permite analisar o crescimento como SaaS empresarial, e não apenas como infraestrutura técnica.

---

## 22. Aba Alertas

Alertas automáticos para:

### Capacidade

- CPU > limite.
- RAM > limite.
- Storage > limite.
- DB connections > limite.
- Queue > limite.

### Performance

- P95 elevado.
- P99 elevado.
- Error rate elevado.
- API lenta.
- Queries lentas.

### Crescimento

- Crescimento inesperado.
- Storage crescendo acima do previsto.
- Utilizadores acima da previsão.

### Resiliência

- Backup falhado.
- Replicação interrompida.
- Health check falhado.
- Instância indisponível.

---

## 23. Aba Relatórios

Relatórios recomendados:

- Relatório mensal de capacidade.
- Relatório de performance.
- Relatório de crescimento.
- Relatório de infraestrutura.
- Relatório de custos.
- Relatório de incidentes.
- Relatório de testes de carga.
- Relatório de disponibilidade.
- Relatório de utilização por módulo.
- Capacity Planning Report.
- Previsão de infraestrutura.

**Exportação:** PDF, XLSX, CSV.

As exportações devem ser registadas pelo Audit.

---

## 24. Aba Configurações

Configurar:

- Limites de CPU.
- Limites de memória.
- Limites de storage.
- Limites de latência.
- Limites de erros.
- Limites de concorrência.
- Limites de filas.
- Regras de alertas.
- Regras de auto scaling.
- Janelas de manutenção.
- Retenção de métricas.
- Frequência de recolha.
- Perfis autorizados.

---

## 25. Integração do Scalability com todos os módulos

O Scalability deve ser transversal à INNOVA, mas não deve obrigar todos os módulos a implementar lógica própria de infraestrutura.

| Módulo | O que Scalability deve acompanhar |
|---|---|
| Users | Crescimento de utilizadores e autenticações |
| Organization | Crescimento da estrutura organizacional |
| Departments | Volume de departamentos e consultas |
| Employees/RH | Volume de colaboradores |
| Payroll & Payslips | Carga de processamento salarial |
| Attendance | Volume de marcações |
| Leave | Pedidos e aprovações |
| Courses | Número de cursos e acessos |
| Training | Sessões e participantes |
| Enrollments | Volume de inscrições |
| Assessments | Submissões e avaliações |
| Performance | Ciclos e avaliações |
| Competencies | Matrizes e avaliações |
| 360º | Volume de avaliadores e respostas |
| Onboarding | Planos e tarefas |
| Development Plans | PDI e ações |
| Career Plans | Planos de carreira |
| Competency Map | Matrizes |
| Document Repository | Storage e downloads |
| Content Library | Storage e acessos |
| AI Tutor | Requests, tokens, latência e custos |
| Avatar Training | Sessões, processamento e storage |
| Processes | Processos simultâneos |
| Automations | Jobs e execução |
| Notifications | Volume de notificações |
| Events | Eventos e participantes |
| Integrations | Tráfego e sincronizações |
| Analytics | Queries e processamento |
| Executive Reports | Geração de relatórios |
| Audit | Volume de eventos |
| History | Volume de histórico |
| API | Requests e throughput |

---

## 26. Integração com os outros módulos técnicos

O desenho ideal é:

```text
                      INNOVA
                         │
                ┌────────┴────────┐
                │   SCALABILITY   │
                └────────┬────────┘
                         │
         ┌───────────────┼────────────────┐
         │               │                │
       USERS            API            DATABASE
         │               │                │
         └───────────────┼────────────────┘
                         │
             ┌───────────┼───────────┐
             │           │           │
          QUEUES      STORAGE   INTEGRATIONS
             │           │           │
             └───────────┼───────────┘
                         │
                   PERFORMANCE
                         │
                     CAPACITY
                         │
                   PREDICTIONS
                         │
                      ALERTS
                         │
                     REPORTS
```

E existe uma relação importante com os módulos:

- **Audit** → regista alterações às configurações do Scalability.
- **Processes** → fornece processos cujo volume pode impactar a capacidade.
- **Automations** → fornece jobs e execuções que devem ser monitorizados.
- **Analytics** → pode consumir métricas do Scalability.
- **Executive Reports** → pode consumir os indicadores de capacidade.
- **Notifications** → envia alertas de capacidade.

---

## 27. Modelo de dados recomendado

No backend, eu não criaria apenas uma tabela Scalability. Separaria responsabilidades.

**`InfrastructureMetric`**

- `id`
- `timestamp`
- `metricType`
- `component`
- `value`
- `unit`
- `environment`
- `source`

**`CapacitySnapshot`**

- `id`
- `resource`
- `currentValue`
- `capacity`
- `utilization`
- `threshold`
- `timestamp`

**`PerformanceMetric`**

- `id`
- `service`
- `endpoint`
- `p50`
- `p95`
- `p99`
- `throughput`
- `errorRate`
- `timestamp`

**`QueueMetric`**

- `id`
- `queue`
- `pending`
- `processing`
- `failed`
- `throughput`
- `averageProcessingTime`
- `timestamp`

**`CapacityForecast`**

- `id`
- `resource`
- `currentValue`
- `forecastValue`
- `forecastDate`
- `confidence`
- `modelVersion`

**`LoadTest`**

- `id`
- `name`
- `type`
- `environment`
- `startedAt`
- `completedAt`
- `targetUsers`
- `targetRps`
- `result`
- `report`

**`ScalabilityIncident`**

- `id`
- `title`
- `severity`
- `component`
- `startedAt`
- `resolvedAt`
- `impact`
- `rootCause`
- `resolution`
- `status`

**`ScalingPolicy`**

- `id`
- `resource`
- `minCapacity`
- `maxCapacity`
- `scaleUpThreshold`
- `scaleDownThreshold`
- `cooldown`
- `enabled`

---

## 28. Regras importantes

### 1. Não guardar métricas indefinidamente na mesma tabela

Métricas de alta frequência podem gerar milhões de registos. Deve existir:

- agregação;
- retenção;
- downsampling;
- armazenamento histórico apropriado.

### 2. Não misturar Scalability com Audit

Scalability mede o sistema. Audit regista quem realizou ações.

**Exemplo:**

- «CPU = 82%» é Scalability.
- «Administrador alterou o limite de CPU de 70% para 80%» é Audit.

### 3. Não confundir Scalability com Monitoring

Eu manteria:

- **Monitoring** → saúde operacional em tempo real.
- **Scalability** → capacidade, crescimento, previsão e dimensionamento.

Assim, o Scalability responde: *«Conseguimos crescer?»* Enquanto Monitoring responde: *«Está tudo saudável agora?»*

---

## 29. O que eu considero obrigatório para a INNOVA

Se quiser evitar que o módulo fique excessivamente complexo, os elementos obrigatórios na primeira versão seriam:

### P0 — Essencial

- Visão Geral.
- Utilizadores & carga.
- API.
- Base de dados.
- Performance.
- Filas.
- Storage.
- Capacidade.
- Alertas.
- Previsões.
- Incidentes.
- Relatórios.
- Integração com Audit.

### P1 — Segunda fase

- Auto Scaling.
- Testes de carga.
- Resiliência.
- Integrações.
- Custos.
- Capacity Planning avançado.

### P2 — Evolução

- Previsão inteligente.
- Recomendações automáticas de infraestrutura.
- Simulação de crescimento.
- What-if analysis:
  - «O que acontece se tivermos 10.000 utilizadores?»
  - «E com 20.000?»
  - «E se 30% estiverem simultaneamente online?»
- Recomendações de dimensionamento baseadas no histórico.

---

## 30. A visão que eu recomendo para a INNOVA

O Scalability não deve aparecer para um colaborador comum. É um módulo de administração técnica/infraestrutura.

A arquitetura ideal fica:

- **Monitoring** → saúde em tempo real
- **Scalability** → capacidade e crescimento
- **Audit** → rastreabilidade e responsabilização
- **Analytics** → análise de negócio
- **Executive Reports** → informação executiva
- **Processes** → workflows
- **Automations** → execução automática
