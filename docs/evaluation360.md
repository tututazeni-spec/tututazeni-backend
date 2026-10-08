# Módulo Evaluation 360°

## Abas principais

A aba Matriz 9-Box transita para o módulo Planos de Desenvolvimento.

**Abas principais definidas para o Evaluation 360°:** Visão Geral, Avaliações 360°, Avaliados, Avaliadores, Questionários, Resultados, Feedback, Relatórios

## 1. Visão Geral

Painel geral das avaliações 360°.

**Informações:**

- Total de avaliações 360°
- Avaliações em preparação
- Avaliações abertas
- Avaliações em preenchimento
- Avaliações concluídas
- Avaliações encerradas
- Colaboradores avaliados
- Avaliadores convidados
- Avaliadores que já responderam
- Taxa de participação
- Taxa de conclusão
- Média global
- Média por competência
- Competências com maior pontuação
- Competências com menor pontuação
- Avaliações pendentes
- Avaliações próximas do prazo
- Últimas avaliações realizadas

## 2. Avaliações 360°

Lista principal dos ciclos de avaliação.

**Informações:**

- Nome da avaliação
- Código
- Tipo
- Período
- Data de início
- Data de encerramento
- Nº de avaliados
- Nº de avaliadores
- Taxa de participação
- Estado
- Criado por
- Data de criação

**Estados:** Rascunho, Agendada, Aberta, Em andamento, Encerrada, Em análise, Concluída, Arquivada

**Filtros:** Estado, Período, Departamento, Unidade, Cargo, Responsável, Data, Tipo de avaliação

## 3. Nova Avaliação 360°

Uma das partes mais importantes.

### Informações gerais

Nome da avaliação, código, descrição, objetivo, tipo, período de avaliação, data de início, data de encerramento, responsável, departamento/unidade abrangida, estado

### Configuração

- Avaliação anónima
- Permitir comentários
- Permitir autoavaliação
- Permitir avaliação do gestor
- Permitir avaliação de pares
- Permitir avaliação de subordinados
- Permitir avaliação de clientes/parceiros
- Número mínimo de avaliadores
- Número máximo de avaliadores

### Grupos de avaliadores

Autoavaliação, gestor, pares, subordinados, clientes, parceiros, outros

**Definir o peso de cada grupo — exemplo:**

- Autoavaliação — 10%
- Gestor — 40%
- Pares — 25%
- Subordinados — 25%

Os pesos devem ser configuráveis.

### Competências avaliadas

Competência, categoria, descrição, peso, nível esperado, escala de avaliação, obrigatória/opcional

O módulo deve buscar as competências do módulo Competencies, não criar uma segunda lista independente.

### Escala

**Exemplo:**

1. Muito abaixo do esperado
2. Abaixo do esperado
3. Dentro do esperado
4. Acima do esperado
5. Excede claramente o esperado

### Comunicação

Notificação inicial, lembrete automático, lembrete antes do prazo, notificação de conclusão, mensagem personalizada

### Privacidade

Respostas anónimas, ocultar identidade dos avaliadores, número mínimo para apresentação de resultados, regras de confidencialidade

## 4. Avaliados

Lista das pessoas que serão avaliadas.

**Informações:**

- Colaborador
- Nº de colaborador
- Cargo
- Departamento
- Unidade
- Gestor
- Nº de avaliadores
- Avaliadores confirmados
- Respostas recebidas
- Progresso
- Estado
- Resultado final
- Data de conclusão

**Ao abrir um colaborador:** Dados do colaborador, competências avaliadas, avaliadores, progresso, resultados, comentários, comparação entre perspetivas

## 5. Avaliadores

Gestão de quem irá fornecer feedback.

**Informações:**

- Avaliador
- Cargo
- Departamento
- Relação com o avaliado
- Tipo de avaliador
- Avaliado
- Convite enviado
- Data do convite
- Data de resposta
- Estado
- Progresso

**Tipos:** Próprio, Gestor, Par, Subordinado, Cliente, Parceiro, Outro

**Estados:** Pendente, Convite enviado, Iniciado, Em preenchimento, Concluído, Expirado

## 6. Questionários

Questionários utilizados nas avaliações 360°.

**Informações:**

- Nome
- Código
- Descrição
- Versão
- Nº de perguntas
- Nº de competências
- Escala
- Estado
- Data de criação
- Última atualização
- Criado por

### Ao criar questionário

Nome, descrição, instruções, escala de avaliação, competências, perguntas, tipo de pergunta, obrigatória/opcional, campo de comentários, ordem das perguntas

### Tipos de perguntas

Escala, escolha única, escolha múltipla, comentário aberto

**Exemplo:**

> Competência: Comunicação
> Pergunta: "Comunica informações de forma clara e adequada ao público."
> Resposta: 1 a 5 + comentário opcional

## 7. Resultados

O RH e, conforme as permissões, o próprio colaborador conseguem consultar os resultados.

**Informações:**

- Avaliado
- Competência
- Autoavaliação
- Avaliação do gestor
- Avaliação dos pares
- Avaliação dos subordinados
- Outras avaliações
- Média geral
- Nível esperado
- Gap
- Nº de respostas
- Comentários

**Comparação importante:**

> Autoavaliação × Gestor × Pares × Subordinados × Resultado global

## 8. Feedback

Concentra o feedback qualitativo.

**Informações:**

- Avaliado
- Competência
- Comentário
- Tipo de avaliador
- Data
- Estado
- Visibilidade

**Pode separar:** Pontos fortes, oportunidades de melhoria, comportamentos positivos, comportamentos a desenvolver, recomendações

Se a avaliação for anónima, o sistema deve esconder a identidade do avaliador conforme as regras definidas no ciclo.

## 9. Relatórios

**Relatórios:**

- Resultado geral 360°
- Resultados por competência
- Resultados por departamento
- Resultados por cargo
- Resultados por unidade
- Resultados por grupo de avaliadores
- Autoavaliação vs. avaliação externa
- Gestor vs. pares
- Gestor vs. subordinados
- Principais pontos fortes
- Principais gaps
- Taxa de participação
- Taxa de conclusão
- Avaliadores pendentes
- Evolução entre ciclos
- Comparação entre ciclos
- Competências críticas

**Filtros:** Período, Ciclo, Unidade, Departamento, Cargo, Competência, Grupo de avaliador, Estado

## Estrutura final — arquitetura

```
Evaluation 360°
  → cria o ciclo
  → seleciona os avaliados
  → define os avaliadores
  → utiliza competências do Competencies
  → utiliza questionário
  → recolhe respostas
  → calcula resultados
  → gera feedback
  → identifica gaps
  → envia os resultados para Development Plans/PDI
```

**Fluxo:**

```
Competências → Avaliação 360° → Resultados → Gaps → PDI/Development Plans →
Desenvolvimento → Nova avaliação
```
