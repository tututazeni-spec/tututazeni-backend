# Módulo AI Tutor

## Abas principais (a acrescentar)

Visão Geral, Base de Conhecimento, Sessões, Exercícios, Analytics, Configurações

## 1. Visão Geral

**Cards:**

- Conversas hoje
- Utilizadores ativos
- Sessões de aprendizagem
- Perguntas respondidas
- Cursos apoiados
- Taxa de conclusão
- Horas de aprendizagem com IA

**Também:**

- Perguntas mais frequentes
- Cursos mais utilizados
- Temas com maior procura
- Utilizadores mais ativos

## 2. Aba Chat

O tutor deve conseguir trabalhar com o contexto do colaborador:

- Curso atual
- Módulo atual
- Lição atual
- Documentos autorizados
- Progresso
- Avaliações e competências relevantes

## 3. Base de Conhecimento

O AI Tutor deve poder utilizar conteúdos autorizados da INNOVA:

Cursos, Módulos, Lições, Biblioteca, Normas, Regulamentos, Circulares, Manuais, Procedimentos, Políticas, Documentos internos

Usar RAG (Retrieval-Augmented Generation). Em vez de o modelo simplesmente "inventar" uma resposta:

```
Pergunta do colaborador
        ↓
     AI Tutor
        ↓
Pesquisa na base de conhecimento
        ↓
Conteúdos autorizados
        ↓
Contexto relevante
        ↓
IA gera resposta
```

E, quando possível, citar a fonte:

> Fonte: Manual de Segurança Alimentar — Capítulo 3

## 4. Sessões

**Histórico das sessões de aprendizagem:**

- Colaborador
- Tutor
- Curso
- Tema
- Data
- Duração
- Perguntas
- Conteúdos consultados
- Resultado

**Permitir:** Continuar sessão, Ver conversa, Eliminar histórico

## 5. Exercícios

O tutor pode gerar exercícios com base no conteúdo e gerar feedback.

**Tipos:**

- Perguntas de escolha múltipla
- Verdadeiro/Falso
- Perguntas abertas
- Casos práticos
- Simulações
- Cenários
- Flashcards

**Exemplo:** "Cria 10 perguntas sobre este módulo."

## 6. Aba Histórico (a aumentar)

- Perguntas realizadas
- Sessões
- Exercícios
- Recomendações
- Conteúdos consultados

## 7. Analytics

**Para Academia/RH:**

- Utilizadores do AI Tutor
- Perguntas por curso
- Temas mais procurados
- Cursos mais utilizados
- Taxa de utilização
- Sessões por colaborador
- Tempo médio
- Exercícios realizados
- Recomendações aceites

**Também:** Perguntas sem resposta

Esta métrica é muito útil: se muitos colaboradores perguntarem "Como funciona o processo X?" e o AI Tutor não encontrar informação suficiente, a Academia pode identificar uma lacuna de conteúdo.

## 8. Configurações

- Modelo de IA
- Prompts
- Base de conhecimento
- Fontes autorizadas
- Permissões
- Limites de utilização
- Idiomas
- Histórico
- Privacidade
- Segurança
- Temperatura
- Respostas com fontes

**Adicionalmente:**

- Permitir respostas fora da base de conhecimento: Sim/Não

Para conteúdos corporativos sensíveis, pode ser interessante configurar:

> "Responder apenas com informação encontrada nas fontes autorizadas."

## 9. Integrações

O AI Tutor deve estar ligado principalmente a:

- **Cursos** → ensinar conteúdos
- **Biblioteca** → consultar documentos internos
- **Evaluation** → preparar avaliações
- **Competências** → identificar áreas de desenvolvimento
- **Development Plans (PDI)** → apoiar objetivos de desenvolvimento
- **Trainings** → apoiar formações
- **Notificações** → enviar recomendações

## 10. Funcionalidade considerada muito importante

O AI Tutor não deve existir apenas como módulo isolado no menu — deve aparecer dentro dos próprios módulos.

**Exemplo:** dentro de um curso, na opção "Perguntar ao Tutor":

> O colaborador está na lição "Gestão de Conflitos" e pergunta: "Dá-me um exemplo prático aplicado a uma equipa de loja." O tutor responde utilizando o conteúdo daquela lição + fontes autorizadas.

Assim, o AI Tutor deixa de ser apenas um chatbot e torna-se realmente um professor digital da Academia.
