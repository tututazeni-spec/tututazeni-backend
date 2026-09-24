# Módulo Onboarding

Centro da integração de novos colaboradores, desde a preparação antes da entrada até à conclusão do período de integração.

## 1. Visão Geral

Painel do processo de onboarding.

**Informações:**

- Total de integrações
- A iniciar
- Em preparação
- Em andamento
- Concluídos
- Em atraso
- Cancelados
- Novos colaboradores
- Taxa de conclusão
- Tarefas pendentes
- Documentos pendentes
- Formações pendentes
- Onboardings por departamento
- Onboardings por unidade
- Onboardings por responsável
- Próximas entradas
- Tarefas em atraso
- Avaliações de integração pendentes

## 2. Onboardings

Lista de todos os processos de integração.

**Informações:**

- Colaborador
- Nº de colaborador
- Cargo
- Departamento
- Unidade
- Responsável pelo onboarding
- Data de entrada
- Data prevista de conclusão
- Progresso
- Estado
- Modelo utilizado
- Data de criação

**Estados:** Rascunho, Preparação, Agendado, Em andamento, Em atraso, Concluído, Cancelado

**Filtros:** Estado, Unidade, Departamento, Cargo, Responsável, Período, Progresso

## 3. Planos de Integração

O RH cria os modelos de onboarding.

**Exemplos:** Onboarding Administrativo, Onboarding Operacional, Onboarding Lojas, Onboarding Indústria, Onboarding Logística, Onboarding Liderança

**Informações:**

- Nome do plano
- Código
- Descrição
- Objetivo
- Tipo
- Duração
- Unidade
- Departamentos
- Cargos aplicáveis
- Responsável
- Estado
- Versão
- Data de criação
- Última atualização

### Ao criar novo plano

Nome, código, descrição, objetivo, duração, público-alvo, unidade, departamentos, cargos, responsável, etapas, tarefas, documentos, formações, reuniões, avaliações, conteúdos, prazo de conclusão

## 4. Etapas

Organiza o onboarding por fases:

```
Pré-Onboarding → Primeiro Dia → Primeira Semana → Primeiro Mês → Integração →
Acompanhamento → Conclusão
```

**Cada etapa pode ter:** Nome, descrição, ordem, duração, prazo, responsável, tarefas, documentos, formações, reuniões, conteúdos, critérios de conclusão

**Exemplo:**

**Pré-Onboarding**
- Criar acessos
- Preparar equipamento
- Preparar posto de trabalho
- Criar e-mail
- Preparar cartão/identificação
- Enviar informações ao colaborador

**Primeiro Dia**
- Boas-vindas
- Apresentação da empresa
- Apresentação da equipa
- Políticas internas
- Segurança
- Cultura e valores

**Primeira Semana**
- Formação inicial
- Conhecimento da função
- Conhecimento dos processos
- Reunião com gestor
- Conhecimento da equipa

## 5. Tarefas

Todas as atividades que precisam ser executadas.

**Informações:**

- Tarefa
- Descrição
- Onboarding
- Etapa
- Responsável
- Participante
- Prazo
- Data de conclusão
- Estado
- Prioridade
- Obrigatória
- Evidência/anexo
- Observações

**Estados:** Pendente, Em andamento, Concluída, Em atraso, Ignorada, Cancelada

**Responsáveis possíveis:** RH, Gestor, Mentor, TI, Segurança, Administrativo, Colaborador

## 6. Documentos

Gestão dos documentos necessários para a integração.

**Informações:**

- Documento
- Tipo
- Colaborador
- Obrigatório
- Responsável
- Prazo
- Estado
- Data de envio
- Data de validação
- Validado por
- Observação
- Anexo

**Estados:** Pendente, Enviado, Em validação, Validado, Rejeitado, Expirado

**Importante:** documentos pessoais sensíveis devem continuar sujeitos às permissões do módulo de documentos/repositório, em vez de serem duplicados no onboarding.

## 7. Formação

Formações que fazem parte do onboarding.

**Informações:**

- Curso/formação
- Colaborador
- Etapa
- Obrigatória
- Data prevista
- Data de conclusão
- Progresso
- Resultado
- Estado
- Formador
- Certificado

**Integra diretamente com:**

- **Courses** → conteúdo
- **Trainings** → formação/turma/sessão
- **Evaluation** → avaliação
- **Certificates** → certificado

O onboarding apenas associa a formação, não cria uma segunda gestão de cursos.

## 8. Acompanhamento

Acompanhar a experiência do novo colaborador.

**Informações:**

- Colaborador
- Gestor
- Mentor
- Data de acompanhamento
- Tipo de acompanhamento
- Progresso
- Dificuldades identificadas
- Pontos positivos
- Necessidades de apoio
- Feedback do colaborador
- Feedback do gestor
- Próximas ações
- Responsável
- Prazo
- Estado

**Check-ins:** 1.º dia, 1.ª semana, 30 dias, 60 dias, 90 dias (também configuráveis para outros períodos)

## 9. Avaliação de Integração

Avalia se o onboarding foi concluído com sucesso.

**Informações:**

- Colaborador
- Avaliador
- Data
- Período de integração
- Conhecimento da empresa
- Conhecimento da função
- Adaptação à equipa
- Conhecimento dos processos
- Cumprimento das formações
- Autonomia
- Necessidades de desenvolvimento
- Feedback
- Resultado
- Recomendação
- Estado

Integrar com o módulo Evaluation, sem criar um sistema de avaliação completamente separado.

## 10. Relatórios

- Onboardings por período
- Onboardings por departamento
- Onboardings por unidade
- Onboardings por cargo
- Taxa de conclusão
- Tempo médio de integração
- Tarefas concluídas vs. pendentes
- Tarefas em atraso
- Documentos pendentes
- Formações concluídas
- Formações pendentes
- Avaliações de integração
- Feedback dos novos colaboradores
- Desempenho durante o onboarding
- Taxa de conclusão por responsável
- Taxa de conclusão por departamento
- Indicadores de integração

## Estrutura final recomendada

**Fluxo ideal:**

```
Users
  ↓
Novo colaborador
  ↓
Onboarding
  ↓
Plano de Integração
  ↓
Etapas + Tarefas + Documentos + Formação
  ↓
Acompanhamento / Check-ins
  ↓
Avaliação de Integração
  ↓
Development Plans/PDI, se forem identificadas necessidades de desenvolvimento
```
