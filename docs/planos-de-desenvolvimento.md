# Módulo Planos de Desenvolvimento (PDI)

## 0. Lógica principal

```
Avaliação → Competências/Gaps → Talent Review → Development Plan → Ações →
Acompanhamento → Resultado
```

Manter o formulário + Novo PDI existente na plataforma.

## Abas principais

Visão Geral, Planos de Desenvolvimento, Talentos, PDI, Objetivos, Ações de Desenvolvimento, Competências, Mentoria & Coaching, Acompanhamento, Relatórios, Configurações

## 1. Visão Geral

- Planos ativos
- Planos concluídos
- Planos atrasados
- Colaboradores em desenvolvimento
- Objetivos ativos
- Ações em curso
- Taxa média de progresso
- Competências em desenvolvimento

**Cards:** Planos ativos, Em atraso, Concluídos, Progresso médio, Colaboradores com PDI, Ações pendentes

**Também:** Planos por departamento, progresso por unidade, competências mais desenvolvidas, ações de desenvolvimento mais utilizadas

## 2. Planos de Desenvolvimento

**Tabela:**

- Colaborador
- Plano
- Tipo
- Período
- Gestor
- Progresso
- Objetivos
- Ações
- Estado
- Data de início
- Data de conclusão
- Ações

**Estados:** Rascunho, Em aprovação, Ativo, Em acompanhamento, Concluído, Suspenso, Cancelado

**Tipos:** PDI, Plano de desenvolvimento de liderança, Plano de melhoria, Plano de preparação para sucessão, Plano de desenvolvimento de competências, Plano personalizado

## 3. Ações de Desenvolvimento

Execução do plano.

**Tipos:** Curso, Formação presencial, Aula ao vivo, Microlearning, Mentoria, Coaching, Job Rotation, Projeto especial, Shadowing, Leitura, Autoestudo, Workshop, Experiência prática

**Cada ação:**

- Nome
- Tipo
- Descrição
- Objetivo
- Responsável
- Data de início
- Data de conclusão
- Prazo
- Estado
- Progresso
- Evidência
- Resultado
- Observações

## 4. Formação

O colaborador pode ter uma ação, por exemplo:

> Concluir Curso de Liderança

O sistema liga diretamente ao módulo Cursos. Quando o curso for concluído:

```
Development Plan → ação automaticamente atualizada
```

Por exemplo: Curso concluído → 100%. Não é necessário o RH atualizar manualmente.

## 5. Mentoria & Coaching

**Registar:**

- Mentor/Coach
- Colaborador
- Objetivo
- Data de início
- Frequência
- Sessões previstas
- Sessões realizadas
- Próxima sessão
- Progresso
- Observações

Pode existir um plano de mentoria com várias sessões.

## 6. Competências

Integração direta com o módulo Competências. Mostrar: Competência atual, Nível esperado, Gap, Objetivo, Evolução

**Exemplo:**

| Competência | Atual | Esperado | Gap | Meta |
|---|---|---|---|---|
| Liderança | 2 | 4 | 2 | 4 |
| Comunicação | 3 | 4 | 1 | 4 |
| Estratégia | 2 | 3 | 1 | 3 |

O progresso pode ser atualizado através das avaliações.

## 7. Talentos

Acompanhamento de colaboradores identificados como talento (integração com Talent Development):

- Colaborador
- Potencial
- Desempenho
- Quadrante 9-Box
- Competências críticas
- Plano de desenvolvimento
- Preparação para sucessão
- Prontidão
- Estado

**Importante:** o 9-Box continua ligado ao processo de Talent Review/Sucessão, enquanto o Development Plans executa o desenvolvimento.

## 8. Acompanhamento

Uma das partes mais importantes. Para cada plano:

- Progresso geral
- Objetivos concluídos
- Ações concluídas
- Ações atrasadas
- Competências desenvolvidas
- Último acompanhamento
- Próximo acompanhamento

**Permitir checkpoints:** Mensal, Trimestral, Semestral ou Personalizado

**Cada checkpoint:**

- Data
- Participantes
- Progresso
- Evolução
- Dificuldades
- Feedback do gestor
- Compromissos
- Próximas ações

## 9. PDI do colaborador

No portal do colaborador, ele deve poder visualizar:

Meu PDI, Objetivos, Ações, Cursos, Competências, Progresso, Prazos, Feedback, Próximo checkpoint

**E também:** Adicionar ação, Atualizar progresso, Adicionar evidência, Solicitar apoio

## 10. Aprovação

**Fluxo:**

```
RH/gestor cria plano
        ↓
Colaborador consulta
        ↓
Colaborador aceita
        ↓
Gestor aprova
        ↓
Plano fica ativo
        ↓
Acompanhamento
        ↓
Conclusão
```

Dependendo das regras da empresa, o RH pode ser incluído como aprovador.

## 11. Relatórios

- Planos por departamento
- Planos por unidade
- Progresso dos PDI
- Planos atrasados
- Competências em desenvolvimento
- Gaps de competências
- Ações realizadas
- Taxa de conclusão
- Desenvolvimento por talento
- Desenvolvimento por cargo
- Desenvolvimento de liderança

**Também:** Evolução antes/depois

**Exemplo:** Competência antes: 2,8 → depois: 3,7

## 12. Configurações

Tipos de plano, Tipos de ação, Estados, Fluxos de aprovação, Periodicidade dos checkpoints, Escalas de progresso, Competências, Regras de conclusão, Notificações, Permissões

## Relação com os outros módulos

```
EVALUATION
    │
    ├── Desempenho
    └── Feedback
    │
    ▼
COMPETÊNCIAS
    │
    └── Gaps
    │
    ▼
TALENT REVIEW / 9-BOX
    │
    ▼
DEVELOPMENT PLANS
    │
    ├── Objetivos
    ├── PDI
    ├── Cursos
    ├── Aulas ao Vivo
    ├── Mentoria
    ├── Coaching
    ├── Job Rotation
    └── Projetos
    │
    ▼
Acompanhamento
    │
    ▼
Nova avaliação
```
