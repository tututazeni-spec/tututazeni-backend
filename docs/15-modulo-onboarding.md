# Módulo Onboarding

## 1. O Meu Plano de Integração

Área do colaborador recém-integrado. Funciona como checklist/roadmap pessoal de integração.

**Conteúdo:** nome do colaborador, cargo, departamento, unidade, data de admissão, data de início, responsável pelo onboarding, mentor/buddy, gestor, progresso geral, dias desde a entrada, dias restantes do plano, data prevista de conclusão, etapas de integração, tarefas pendentes, tarefas concluídas, tarefas em atraso, próximos passos, documentos a consultar, documentos a entregar, cursos obrigatórios, formações agendadas, reuniões de integração, apresentações, contactos importantes, políticas e normas, equipamentos atribuídos, acessos necessários, objetivos iniciais, competências a desenvolver, feedback do gestor, feedback do mentor, notas, timeline de integração.

### Área "Próximas ações"

Exemplo:
- **Hoje:** Ler Código de Conduta
- **Amanhã:** Reunião com o gestor
- **Esta semana:** Concluir formação de Segurança
- **Próxima semana:** 1ª conversa 1:1

## 2. Planos

Planos de onboarding, planos ativos, em preparação, concluídos, atrasados, modelos de onboarding, planos por cargo, por departamento, por unidade, duração média, responsável, estado, data de criação, data de início, data prevista de conclusão, taxa de conclusão.

**Ao clicar num plano:** informações gerais, colaboradores atribuídos, etapas, tarefas, responsáveis, prazos, documentos, formações, reuniões, objetivos, recursos, checklist, progresso, histórico, comentários, notificações.

### Modelos

Dentro de Planos, uma área para **Modelos de Onboarding** — para o RH não criar cada onboarding do zero:

Modelo — Administrativo · Modelo — Loja · Modelo — Logística · Modelo — Indústria · Modelo — Gestão · Modelo — Liderança

## 3. Dashboard

Visão analítica exclusiva do RH.

**Cards:** novos colaboradores, onboardings ativos, concluídos, atrasados, taxa de conclusão, taxa média de progresso, tempo médio de integração, tarefas pendentes, tarefas atrasadas, formações pendentes, documentos pendentes.

**Gráficos:** onboardings por estado, por unidade, por departamento, por cargo, evolução da taxa de conclusão, progresso médio por departamento, tarefas concluídas vs. pendentes, tarefas atrasadas, tempo médio de conclusão, colaboradores por etapa, taxa de conclusão das formações, taxa de conclusão dos documentos.

**Indicadores de qualidade:** tempo até à primeira formação, tempo até à primeira reunião com gestor, conclusão das tarefas obrigatórias, conclusão das formações obrigatórias, conclusão dos documentos, cumprimento dos prazos, satisfação do colaborador, satisfação do gestor, feedback do mentor, taxa de conclusão nos primeiros 30/60/90 dias.

**Alertas:** onboardings em risco, tarefas atrasadas, documentos em falta, formações obrigatórias não concluídas, colaboradores sem mentor, colaboradores sem plano atribuído, prazos próximos.

## 4. Novo Plano de Onboarding

- **Informações gerais:** nome do plano, código, descrição, objetivo, tipo de onboarding, modelo/template, estado, duração, data de início, data prevista de conclusão
- **Público-alvo:** unidade, departamento, cargo, família de cargo, nível hierárquico, tipo de contrato, colaboradores específicos
- **Responsáveis:** responsável pelo onboarding, gestor, mentor/buddy, RH responsável, responsável por cada etapa
- **Estrutura do plano:** etapas, ordem das etapas, duração de cada etapa, tarefas, subtarefas, responsáveis, prazo de cada tarefa, tarefas obrigatórias, critérios de conclusão

  Estrutura recomendada: Pré-integração → Primeiro dia → Primeira semana → Primeiro mês → 30 dias → 60 dias → 90 dias

- **Documentos:** documentos obrigatórios, documentos a entregar pelo colaborador, documentos a consultar, políticas, regulamentos, normas, manuais, termos e declarações — integrar directamente com o módulo Biblioteca/Documentos
- **Formação:** cursos obrigatórios, cursos recomendados, módulos, aulas, sessões ao vivo, avaliações, prazo de conclusão
- **Reuniões:** reunião de boas-vindas, com RH, com gestor, com mentor, apresentação à equipa, 1:1, data, duração, responsável, participantes
- **Equipamentos e acessos:** computador, telefone, cartão, uniforme, EPI, e-mail, sistemas, aplicações, permissões, acessos, VPN, outros recursos
- **Objetivos:** objetivos iniciais, expectativas do cargo, metas dos primeiros 30 dias, 60 dias, 90 dias, competências a desenvolver
- **Feedback:** check-in do primeiro dia, feedback da primeira semana, dos 30 dias, dos 60 dias, dos 90 dias, avaliação da experiência de onboarding
- **Notificações:** notificação de início, lembrete de tarefa, lembrete de prazo, tarefa em atraso, conclusão de etapa, conclusão do onboarding

---

## Arquitetura

```
Onboarding
├── O Meu Plano de Integração
├── Planos
│    ├── Todos os Planos
│    ├── Modelos      → RH cria estruturas reutilizáveis
│    └── Atribuições  → RH vê quem está a fazer qual plano e o progresso
└── Dashboard
```

**Ligação com os restantes módulos da INNOVA:**

Onboarding → Users/Colaborador → Cursos → Biblioteca → Formação → Competências → PDI → Avaliação → Desempenho
