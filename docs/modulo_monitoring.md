# Módulo Monitoring — INNOVA

O **Monitoring** deve ser o centro de monitorização operacional e técnica da plataforma, acompanhando continuamente o estado dos processos, módulos, integrações, automações, tarefas e indicadores críticos.

> Não deve ser simplesmente um módulo de dashboards.

---

## Estrutura recomendada

### 1. Visão Geral

- Estado geral da plataforma
- Alertas críticos
- Processos em atraso
- Automações com erro
- Integrações indisponíveis
- Jobs/processamentos em execução
- Utilizadores ativos
- Pendências críticas
- SLA em risco
- Incidentes abertos
- Últimas ocorrências

### 2. Monitorização de Módulos

- Estado de cada módulo
- Disponibilidade
- Erros
- Operações recentes
- Volume de utilização
- Performance
- Dependências
- Estado:
  - Normal
  - Atenção
  - Degradado
  - Crítico
  - Indisponível

### 3. Processos

Ligação direta ao módulo **Processes**:

- Processos em execução
- Processos concluídos
- Processos atrasados
- Processos bloqueados
- Etapas pendentes
- SLA
- Responsável
- Tempo médio
- Taxa de conclusão
- Falhas

### 4. Automações

Ligação ao módulo **Automation**:

- Automações executadas
- Sucesso
- Falhas
- Execuções pendentes
- Última execução
- Próxima execução
- Tempo de execução
- Erros
- Retry
- Histórico

### 5. Integrações

- ERP
- SSO
- LMS
- Email
- APIs
- Sistemas externos
- Webhooks
- Estado da ligação
- Última sincronização
- Registos enviados/recebidos
- Falhas de sincronização
- Tempo de resposta

### 6. Performance

- Tempo de resposta da API
- Latência
- Erros HTTP
- Requests por minuto
- CPU
- Memória
- Base de dados
- Filas
- Jobs
- Storage
- Performance por endpoint

### 7. Alertas

- Alertas críticos
- Alertas de sistema
- Alertas de processos
- Alertas de integração
- Alertas de automação
- Alertas de SLA
- Alertas de segurança
- Severidade
- Data/hora
- Origem
- Responsável
- Estado
- Ação tomada

### 8. Incidentes

- Novo incidente
- Incidentes ativos
- Incidentes resolvidos
- Severidade
- Impacto
- Serviço/módulo afetado
- Responsável
- Timeline
- Causa
- Resolução
- Tempo de resolução

### 9. Health Check

Monitorização automática de:

- API
- Frontend
- Backend
- PostgreSQL
- Redis, se existir
- Storage
- Serviços externos
- Workers
- Filas
- Cron jobs

### 10. Jobs & Background Tasks

- Jobs executados
- Jobs em execução
- Jobs falhados
- Jobs agendados
- Duração
- Retry
- Próxima execução
- Erro

### 11. SLA & SLO

- SLA contratado/configurado
- SLA atual
- Tempo de indisponibilidade
- Violações
- Serviços em risco
- Tempo médio de resolução
- Cumprimento por módulo

### 12. Histórico de Monitorização

Aqui pode existir integração com o módulo **History**, mas não deve duplicar o **Audit**.

---

## Diferença entre os módulos

| Módulo | Função |
|---|---|
| **Monitoring** | O que está a acontecer agora e o que está em risco |
| **Analytics** | Analisar dados e tendências |
| **Executive Reports** | Apresentar resultados para gestão/executivos |
| **Audit** | Saber quem fez o quê, quando e onde |
| **History** | Histórico funcional das entidades |
| **Processes** | Executar e gerir processos |
| **Automation** | Executar regras e ações automáticas |

---

## Integração com toda a INNOVA

O Monitoring deve ser um **módulo transversal**:

```text
                ┌──────────────────┐
                │    MONITORING    │
                │   Centro de      │
                │  Monitorização   │
                └────────┬─────────┘
                         │
   ┌─────────────┬───────┼────────┬─────────────┐
   ↓             ↓       ↓        ↓             ↓
Processes   Automation  Audit  Analytics   Integrations
   ↓             ↓       ↓        ↓             ↓
        HR / LMS / Training / Payroll / Leave / Attendance
                         ↓
        Organization / Users / Competencies / Performance
                         ↓
        Events / Onboarding / PDI / Career / 360º
```

---

## Recomendação para a INNOVA

Sim, criaria o Monitoring. Mas manteria o módulo **fora do menu principal** para colaboradores comuns.

O acesso deve ser sobretudo para:

- Super Admin
- Admin
- RH
- IT / Técnico
- Gestores autorizados

### Sidebar sugerida

**Monitoring**, com as subáreas:

> Visão Geral · Módulos · Processos · Automações · Integrações · Performance · Alertas · Incidentes · Health Check · Jobs · SLA

Isto dá à INNOVA uma verdadeira camada de **observabilidade operacional**, sem transformar o Monitoring num segundo Analytics.
