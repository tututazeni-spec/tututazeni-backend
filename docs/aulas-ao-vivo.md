# Módulo Aulas ao Vivo (Live Classes)

## 0. Relação com o módulo Cursos

```
Curso → Aula ao Vivo → Sessões → Participantes → Presenças → Gravação → Avaliação → Relatórios
```

## Abas principais

Visão Geral, Aulas, Calendário, Sessões, Participantes, Formadores, Salas & Links, Gravações, Presenças, Materiais, Avaliações, Relatórios, Configurações

## 1. Visão Geral

- Aulas agendadas
- Aulas em curso
- Aulas concluídas
- Próximas aulas
- Participantes inscritos
- Taxa média de presença
- Horas de formação ao vivo
- Gravações disponíveis

**Cards:** Próximas aulas, Hoje, Esta semana, Participantes, Presença média, Horas realizadas

**Também:** Calendário das próximas aulas, Aulas por modalidade, Aulas por formador, Taxa de presença

## 2. Aulas

**Tabela:**

- Código
- Título
- Curso
- Formador
- Tipo
- Data
- Hora
- Duração
- Participantes
- Modalidade
- Estado
- Ações

**Estados:** Agendada, Em preparação, Em curso, Concluída, Cancelada, Adiada

**Filtros:** Curso, Formador, Data, Modalidade, Estado, Unidade, Departamento

**Ações:** Ver, Editar, Iniciar aula, Adiar, Cancelar, Duplicar, Gerir participantes, Registar presença, Ver gravação, Ver relatório

## 3. Ao clicar em "Nova Aula"

### Etapa 1 — Informações gerais

- Título da aula
- Código
- Descrição
- Curso associado
- Módulo associado
- Lição associada
- Formador
- Co-formador
- Tipo de sessão

**Tipos:** Aula, Webinar, Workshop, Sessão prática, Sessão de esclarecimento, Mentoria, Tutoria, Sessão de revisão

### Etapa 2 — Data e horário

- Data
- Hora de início
- Hora de término
- Duração
- Fuso horário
- Recorrência

**Recorrência:** Uma vez, Diária, Semanal, Personalizada

**Para sessões recorrentes:** Data inicial, Data final, Dias da semana, Horário

### Etapa 3 — Modalidade

Online, Presencial, Híbrida

- **Online:** Plataforma, Link da reunião, ID da reunião, Palavra-passe, Sala virtual
- **Presencial:** Local, Edifício, Sala, Capacidade
- **Híbrida:** Local físico + Sala virtual

### Etapa 4 — Participantes

- Participantes
- Grupos
- Turmas
- Departamento
- Unidade
- Cargo

**Opções:** Inscrição automática, Inscrição manual, Autoinscrição, Aprovação necessária

**Também:** Limite de participantes, Lista de espera

### Etapa 5 — Conteúdo

- Objetivos da aula
- Agenda
- Tópicos
- Materiais
- Apresentação
- Documentos
- Vídeos
- Links
- Recursos complementares

Os documentos podem vir diretamente do módulo Biblioteca.

### Etapa 6 — Presença

**Configurar:**

- Registo automático
- Registo manual
- Presença obrigatória
- Percentagem mínima de presença
- Tolerância de atraso
- Justificação de ausência

**Estados:** Presente, Ausente, Atrasado, Presença parcial, Justificado

**Regra principal:**

> Um participante só é considerado "Presente" quando tiver participado em pelo menos 70% da duração total da sessão.

**Regra de cálculo:**

```
Percentagem de presença = (Tempo efetivamente participado ÷ Duração total da sessão) × 100
```

### Etapa 7 — Gravação

- Gravar sessão
- Guardar gravação
- Disponibilizar aos participantes
- Data de expiração
- Permitir download

A gravação pode ficar associada à aula e, quando apropriado, ao conteúdo do curso.

**Regra de arquitetura no projeto:**

> Nunca armazenar ficheiros de vídeo binários diretamente no servidor da aplicação. Utilizar Object Storage para gravações, CDN para distribuição, URLs assinadas para acesso, transcoding para streaming adaptativo e políticas de lifecycle para retenção e eliminação automática.

### Etapa 8 — Avaliação

- Avaliação pós-aula
- Questionário
- Feedback
- Nota
- Comentário
- Obrigatória/Opcional

Ligar ao módulo Evaluation.

### Etapa 9 — Notificações

- Notificação de inscrição
- Lembrete 24h antes
- Lembrete 1h antes
- Notificação de início
- Alteração de horário
- Cancelamento
- Disponibilização da gravação

**Canais:** INNOVA, Email, Push, SMS, WhatsApp — conforme as integrações disponíveis

## 4. Calendário

**Visualização:** Mensal, Semanal, Diária, Agenda

**Cada evento mostra:** Hora, Aula, Curso, Formador, Modalidade, Estado

**Filtros:** Formador, Curso, Unidade, Departamento, Modalidade

## 5. Sessões

Uma Aula pode ter várias Sessões.

**Exemplo:**

```
Curso: Liderança
Aula: Liderança Situacional
Sessões:
  Sessão 1 — 10/10
  Sessão 2 — 17/10
  Sessão 3 — 24/10
```

**Cada sessão possui:** Data, Hora, Formador, Sala/Link, Participantes, Presenças, Materiais, Gravação, Estado

## 6. Participantes

**Tabela:**

- Colaborador
- Nº colaborador
- Departamento
- Unidade
- Curso
- Aula
- Sessão
- Inscrição
- Presença
- Tempo participado
- Estado
- Avaliação

**Ações:** Adicionar, Remover, Registar presença, Justificar ausência, Ver histórico

## 7. Formadores

- Formador
- Especialidade
- Cursos
- Aulas agendadas
- Aulas realizadas
- Horas ministradas
- Participantes
- Avaliação média

**Perfil do formador:** Dados pessoais, Contactos, Especializações, Certificações, Biografia, Disponibilidade, Documentos

Liga aos formadores no módulo Trainings.

## 8. Salas & Links

**Gestão operacional:** Sala, Local, Capacidade, Equipamentos, Disponibilidade

**Salas virtuais:** Plataforma, Link, ID, Configuração, Estado

## 9. Gravações

- Aula
- Sessão
- Formador
- Data
- Duração
- Participantes
- Link
- Estado
- Data de disponibilização
- Data de expiração

**Ações:** Ver, Editar, Publicar, Despublicar, Eliminar

## 10. Presenças

**Tabela:**

- Participante
- Aula
- Sessão
- Data
- Entrada
- Saída
- Tempo participado
- Estado
- Justificação

Permitir calcular: 100% presença, 75%, 50%, ausência — e alimentar automaticamente o progresso do curso.

## 11. Materiais

**Materiais específicos da sessão:** Apresentações, PDFs, Documentos, Links, Vídeos, Exercícios, Fichas de trabalho

Integração com o módulo Biblioteca.

## 12. Avaliações

**Depois da aula:**

- Avaliação da sessão
- Avaliação do formador
- Avaliação do conteúdo
- Avaliação da experiência
- Comentários
- NPS da sessão

**Exemplo:**

- Qualidade do formador: 1–5
- Relevância do conteúdo: 1–5
- Organização: 1–5
- Aplicabilidade: 1–5

## 13. Relatórios

- Aulas realizadas
- Aulas canceladas
- Horas ministradas
- Participantes
- Presenças
- Ausências
- Atrasos
- Taxa de presença
- Avaliação média
- Desempenho por formador
- Participação por departamento
- Participação por unidade
- Horas de formação por colaborador

**Exportação:** Excel, PDF, CSV

## 14. Configurações

Tipos de aula, Modalidades, Estados, Regras de presença, Tolerância de atraso, Plataformas, Notificações, Políticas de gravação, Avaliações, Permissões

## Como ligar os módulos

```
CURSOS            → define o conteúdo académico → módulos → lições → objetivos
AULAS AO VIVO      → executa a componente síncrona → sessões → participantes → presença → gravações
TRAININGS          → gere a formação enquanto processo de RH/Academia → plano de formação → turmas → logística → formadores → recursos
EVALUATION         → avaliações estruturadas
BIBLIOTECA         → documentos e materiais
PERCURSOS DE APRENDIZAGEM → organiza vários cursos numa jornada
```

### Exemplo completo

```
Plano de Formação 2026
        ↓
Formação: Liderança para Gestores
        ↓
Curso: Liderança Situacional
        ↓
Módulo: Fundamentos da Liderança
        ↓
Aula ao Vivo: Liderança Situacional — Sessão 1
        ↓
Participantes + Presenças + Materiais + Gravação + Avaliação
        ↓
Progresso do Curso
        ↓
Conclusão + Certificado
```

## Política de gravação e armazenamento

- O vídeo vai para Object Storage.
- O servidor da INNOVA não deve transmitir o vídeo.
- A URL pode expirar, por exemplo, em 24 horas.

### 15. Diferenciar tipos de gravação

Política automática proposta:

**Formação normal**

```
Gravação → Disponível por 90 dias → Arquivar → Eliminar após 365 dias
```

**Formação obrigatória/compliance**

```
Gravação → Disponível durante o ciclo → Arquivamento → Retenção conforme política da organização
```

**Webinar/evento**

```
Gravação → Publicação → Disponível durante 30 dias → Eliminar
```

**Depois da gravação:**

```
Vídeo original → Transcoding → 1080p / 720p / 480p → HLS → CDN
```

### 9. Separar "gravação" de "conteúdo do curso"

```
Course
│
└── LiveClass
      │
      └── Session
            │
            └── Recording
                  ├── storageKey
                  ├── duration
                  ├── size
                  ├── status
                  └── expiresAt
```

Para a INNOVA, não é necessário construir desde o início um sistema próprio de gravação de vídeo. Se a aula for feita através de Microsoft Teams, Zoom ou Google Meet, a plataforma pode manter apenas:

> Meeting ID + fornecedor + URL + gravação + metadados

e deixar o fornecedor tratar da gravação. A INNOVA funciona como a camada de gestão da formação:

```
Curso → Aula → Sessão → Link da reunião → Participantes → Presença → Gravação → Avaliação
```

Isso reduz bastante a complexidade e o armazenamento que a própria INNOVA precisa administrar.
