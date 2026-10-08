# Módulo Automações

## Estrutura principal e final

```
AUTOMAÇÕES
├── Visão Geral
├── Automações
├── Nova Automação
├── Condições
├── Acções
├── Agendamentos
├── Execuções
├── Histórico
├── Modelos de Automação
└── Configurações
```

Não deve possuir dados próprios de RH como colaboradores, férias, cursos ou avaliações. Deve ler eventos desses módulos e executar ações neles.

**Arquitetura:**

```
Users / Leave / Courses / Trainings / Evaluation / Onboarding / Processes
        ↓
     Eventos
        ↓
   AUTOMAÇÕES
        ↓
     Acções
        ↓
Notificações / Tarefas / Processos / Cursos / RH / APIs
```

Isso evita criar regras automáticas espalhadas por dezenas de módulos.

É o motor que executa automaticamente ações com base em eventos, condições e regras, sem duplicar a lógica dos módulos de negócio.

## Objetivo

Permitir ao RH, administradores e gestores criar automações do tipo:

> Quando acontece X → verificar Y → executar Z

**Exemplo:**

> Quando um colaborador é admitido → criar automaticamente o plano de onboarding → inscrever nos cursos obrigatórios → notificar o responsável → criar tarefas de integração.

## 1. Visão Geral

**Indicadores:**

- Automações ativas
- Automações em pausa
- Execuções hoje
- Execuções este mês
- Execuções concluídas
- Execuções com erro
- Taxa de sucesso
- Ações executadas
- Últimas execuções
- Automações mais utilizadas

**Gráficos:** Execuções por período, Sucesso vs erro, Execuções por módulo, Execuções por tipo de evento

## 2. Automações

Lista central de todas as automações.

**Campos:**

- Nome
- Código
- Descrição
- Objetivo
- Categoria
- Módulo
- Evento desencadeador
- Estado
- Prioridade
- Responsável
- Criado por
- Data de criação
- Última execução
- Próxima execução
- Número de execuções
- Taxa de sucesso
- Data de actualização

**Estados:** Rascunho, Ativa, Pausada, Suspensa, Com erro, Arquivada

## 3. Nova Automação

Formulário estruturado em 6 etapas.

### Etapa 1 — Informações gerais

Nome da automação, código, descrição, objetivo, categoria, módulo relacionado, responsável, prioridade, estado, observações

### Etapa 2 — Gatilho

Define quando a automação começa.

**Tipo de gatilho:**

Registo criado, Registo atualizado, Registo eliminado, Estado alterado, Data atingida, Prazo atingido, Utilizador criado, Colaborador admitido, Colaborador transferido, Curso concluído, Formação concluída, Avaliação concluída, Documento expirado, Férias aprovadas, Pedido submetido, Pedido aprovado, Pedido rejeitado, Presença registada, Certificado emitido, Meta atingida, Competência avaliada, Evento criado, Evento iniciado, Evento terminado, Manual, Agendamento, Webhook/API

**Configuração do gatilho:** Módulo, Entidade, Campo, Evento, Data, Hora, Frequência, Fuso horário, Origem, Condições iniciais

### Etapa 4 — Condições

Permite definir quando a automação deve ou não continuar.

**Exemplo:**

> Quando um curso for concluído E a nota for ≥ 70% → emitir certificado.

**Campos:** Campo, Operador, Valor, Tipo de valor, Grupo de condições, Operador lógico

**Operadores:** Igual a, Diferente de, Maior que, Menor que, Maior ou igual, Menor ou igual, Contém, Não contém, Começa por, Termina por, Está preenchido, Está vazio, Está ativo, Está inativo

**Lógica:** AND / E, OR / OU, NOT / NÃO

**Pode permitir grupos:**

```
SE
    Departamento = "RH"
    E
    Estado = "Ativo"
    E
    Data de admissão < hoje - 30 dias
ENTÃO
    executar ações
```

## 5. Ações

Define o que fará automaticamente.

**Notificações:** Enviar notificação interna, enviar email, enviar lembrete, notificar colaborador, notificar gestor, notificar RH, notificar responsável

**Utilizadores:** Criar utilizador, atualizar utilizador, ativar utilizador, desativar utilizador, alterar departamento, alterar cargo, atribuir responsável

**Formação / Academia:** Inscrever em curso, inscrever em formação, criar turma, adicionar participante, atribuir percurso, atribuir conteúdo, emitir certificado, criar avaliação

**RH:** Criar PDI, criar plano de desenvolvimento, criar tarefa de onboarding, criar pedido, atualizar estado, criar avaliação, agendar conversa individual 1:1

**Documentos:** Criar documento, solicitar documento, atualizar estado, notificar expiração, arquivar documento

**Tarefas:** Criar tarefa, atribuir tarefa, definir prazo, alterar prioridade, concluir tarefa

**Processos:** Iniciar processo, avançar etapa, criar aprovação, atribuir responsável, alterar estado

**Integrações:** Chamar API, webhook, enviar dados para sistema externo, criar registo externo, atualizar registo externo

## 6. Agendamentos

Para automações que não dependem de um evento.

**Campos:** Nome, Automação, Data inicial, Data final, Hora, Fuso horário, Frequência, Dias da semana, Dia do mês, Intervalo, Próxima execução, Última execução, Estado

**Frequências:** Uma vez, Diário, Semanal, Mensal, Trimestral, Anual, Personalizado

## 7. Execuções

Fundamental para auditoria e troubleshooting.

**Campos:**

- Automação
- ID da execução
- Data/hora de início
- Data/hora de conclusão
- Duração
- Gatilho
- Registo afetado
- Utilizador
- Condições avaliadas
- Ações executadas
- Resultado
- Estado
- Erro
- Mensagem
- Tentativas
- Data da última tentativa

**Estados:** Em execução, Concluída, Falhou, Cancelada, Ignorada, Em espera

**Ao abrir uma execução:**

```
Gatilho
   ↓
Condições
   ↓
Condição 1 ✓
Condição 2 ✓
   ↓
Ação 1 ✓
Ação 2 ✓
Ação 3 ✕
   ↓
Erro
```

## 8. Histórico

Histórico de alterações das próprias automações.

**Campos:** Automação, Versão, Utilizador, Data/hora, Ação, Campo alterado, Valor anterior, Novo valor, Motivo, IP, Observação

## 9. Modelos de Automação

Biblioteca de automações pré-configuradas.

**Exemplos:**

- **Onboarding:** Novo colaborador → criar plano de integração
- **Formação:** Curso concluído → emitir certificado
- **Avaliação:** Avaliação concluída → criar plano de desenvolvimento quando existirem gaps
- **Documentos:** Documento próximo da validade → notificar colaborador e RH
- **Férias:** Pedido aprovado → atualizar saldo e notificar colaborador
- **Formação obrigatória:** Prazo próximo → enviar lembrete
- **Desempenho:** Ciclo de avaliação aberto → notificar avaliadores
- **PDI:** Prazo de ação atingido → notificar colaborador e responsável

## 10. Configurações

**Configurações gerais:**

- Execução automática ativada
- Número máximo de execuções simultâneas
- Número máximo de tentativas
- Intervalo entre tentativas
- Timeout
- Política de erros
- Retenção dos logs
- Fuso horário padrão
- Notificações de erro
- Email de alerta
- Permitir execução manual
- Permitir automações em cadeia

## Relação com o módulo Processes

- **Processes** → define como o processo funciona.
- **Automation** → executa automaticamente determinadas partes do processo.

**Exemplo:**

**Processos**

> Processo de Onboarding — define as etapas, responsáveis, prazos e regras.

**Automações**

- Quando novo colaborador é criado → criar onboarding.
- Quando etapa termina → criar próxima tarefa.
- Quando prazo estiver a 3 dias → enviar lembrete.
- Quando onboarding terminar → solicitar avaliação.
