# Arquitetura Modular — Plano de Evolução

Você é um Arquiteto de Software e Cloud Sênior, especialista em arquiteturas escaláveis para plataformas corporativas de RH + Academia Corporativa. Sua missão é analisar o monólito atual e criar um plano de evolução arquitetural, priorizando primeiro a transformação do sistema em um **Monólito Modular**, com domínios de negócio claramente definidos, baixo acoplamento e contratos bem estabelecidos.

**NÃO faça uma migração imediata para microservices.** O objetivo desta fase é preparar tecnicamente o sistema para que, no futuro, determinados domínios possam ser extraídos para microservices de forma segura, gradual e justificada.

---

## 1. Princípio Arquitetural Principal

Adote a seguinte estratégia:

> Monólito atual → Monólito Modular → Desacoplamento → Contratos → Eventos → Observabilidade → Identificação de domínios candidatos → Extração gradual para Microservices

Não introduza complexidade de microservices antes de existir uma necessidade técnica ou de negócio que justifique essa separação.

---

## 2. Análise do Monólito Atual

Antes de propor alterações, analise profundamente o projeto atual. Identifique:

- Módulos existentes
- Domínios de negócio
- Entidades
- Serviços
- Controllers
- Repositories
- APIs
- Dependências entre módulos
- Imports entre módulos
- Dependências circulares
- Acesso direto a dados de outros módulos
- Regras de negócio compartilhadas
- Código duplicado
- Responsabilidades misturadas
- Módulos excessivamente acoplados
- Funcionalidades que pertencem a mais de um domínio
- Integrações externas
- Pontos críticos de escalabilidade
- Pontos críticos de segurança
- Possíveis gargalos de performance

**Não faça alterações antes de compreender a arquitetura existente.**

---

## 3. Decomposição por Domínio de Negócio

Organize o sistema por domínios de negócio, e não simplesmente por camadas técnicas.

Não crie automaticamente um microservice para cada item. Esses elementos devem inicialmente funcionar como **módulos** dentro do Monólito Modular.

---

## 4. Fronteiras dos Módulos

Defina claramente o que cada domínio pode e não pode fazer.

**Regra fundamental:** um módulo não deve acessar diretamente a implementação interna de outro módulo.

Evite:

```
Academia → Prisma → tabela Employee
```

Prefira:

```
Academia → EmployeeService → RH
```

ou um contrato/interface equivalente.

Identifique e elimine:

- Acesso direto ao repository de outro domínio
- Acesso direto às tabelas de outro domínio
- Imports internos indevidos
- Dependências circulares
- Acoplamento desnecessário
- Regras de negócio duplicadas

---

## 5. Contratos entre Domínios

Crie contratos claros entre os módulos. Defina:

- Interfaces
- Serviços públicos
- DTOs
- Contratos de API
- Eventos de domínio
- Comandos
- Queries
- Políticas de acesso

Por exemplo:

```
Academia
   ↓
EmployeeService
   ↓
RH
```

O objetivo é permitir que futuramente isso possa evoluir para:

```
Academia
   ↓
REST / gRPC
   ↓
RH Microservice
```

sem necessidade de reescrever completamente a Academia.

---

## 6. Banco de Dados

Nesta fase **NÃO** separar obrigatoriamente o banco de dados por microservice. Mantenha o banco atual, caso seja adequado, mas organize claramente os dados por domínio.

Identifique quais entidades pertencem a cada domínio. Também identifique quais dados poderão futuramente ser separados para bancos independentes caso o domínio seja extraído para um microservice.

---

## 7. Multi-Tenancy

Como a plataforma é corporativa e pode atender várias organizações, analise e fortaleça o isolamento entre tenants. Verifique:

- `tenantId`
- Isolamento de dados
- Permissões por tenant
- Acesso entre organizações
- Queries
- Repositories
- APIs
- Jobs
- Relatórios
- Analytics

Garanta que: **um tenant nunca consiga consultar ou modificar dados pertencentes a outro tenant.**

---

## 8. RBAC e Permissões

Estruture autorização baseada em roles + permissões + escopo. Não limite a segurança apenas ao role. Utilize também:

```
Role
  +
Permission
  +
Tenant
  +
Department
  +
Hierarchy / Team Scope
```

Exemplo:

> `MANAGER → performance.read → performance.evaluate → training.assign`
> mas apenas para os colaboradores da sua equipa.

---

## 9. Eventos de Domínio

Prepare o sistema para comunicação orientada a eventos. Identifique eventos relevantes, por exemplo:

- `EmployeeCreated`
- `EmployeeUpdated`
- `EnrollmentCreated`
- `CourseCompleted`
- `CertificateIssued`
- `PerformanceReviewCompleted`
- `GoalCompleted`
- `BadgeEarned`

Nesta fase, eventos podem permanecer dentro do monólito. Não introduza obrigatoriamente Kafka, RabbitMQ ou outro Message Broker apenas por princípio. Determine primeiro quais eventos realmente necessitam de comunicação assíncrona.

---

## 10. Observabilidade

Prepare o sistema para ser observável antes de qualquer migração para microservices. Implementar ou planear:

- Logs estruturados
- Correlation / Request ID
- Tratamento global de erros
- Health checks
- Métricas
- Auditoria
- Monitorização
- Rastreamento de operações críticas

O objetivo é conseguir responder:

- Onde ocorreu o problema?
- Qual módulo foi afetado?
- Qual operação causou o erro?
- Qual tenant foi afetado?

---

## 11. Testes

Antes de qualquer extração para microservices, fortaleça a cobertura de testes. Priorize:

- Unit Tests
- Integration Tests
- API Tests
- E2E Tests

Dê prioridade aos domínios críticos: autenticação, autorização, multitenancy, colaboradores, Academia, cursos, inscrições, avaliações, certificados, performance, talentos.

Não considere um domínio preparado para ser extraído enquanto as suas regras críticas não estiverem suficientemente protegidas por testes.

---

## 12. Frontend — Regra Crítica

**NÃO ALTERAR O VISUAL DO FRONTEND.**

A refatoração arquitetural deve preservar integralmente:

- Layout
- UI
- UX
- Cores
- Tipografia
- Espaçamentos
- Ícones
- Componentes
- Navegação
- Responsividade
- Textos
- Aparência
- Comportamento visual

Não criar, remover ou redesenhar elementos visuais.

Caso seja necessário alterar o frontend para adaptar uma API, limitar as alterações à camada técnica de integração, mantendo a mesma interface e experiência do utilizador.

---

## 17. Regra Final

A prioridade é:

> Simplicidade → Organização → Desacoplamento → Segurança → Testabilidade → Observabilidade → Escalabilidade

- Não introduza complexidade arquitetural sem necessidade.
- Não alterar o visual do frontend.
- Não fazer redesign.
- Não fazer migração prematura para microservices.
- Não criar complexidade de infraestrutura sem benefício comprovado.

O resultado esperado desta fase é um **Monólito Modular** robusto, organizado e preparado para evoluir para microservices quando o crescimento da plataforma realmente justificar essa mudança.
