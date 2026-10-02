# INNOVA — Avatar Training

**Especificação funcional e técnica do módulo**

> **Objectivo:** disponibilizar formação interactiva com instrutores virtuais, simulações profissionais, avaliação e acompanhamento da aprendizagem, integrada com os módulos da Academia Corporativa e de RH.
>
> **Integração obrigatória:** o módulo AI-Tutor deve estar ligado ao Avatar Training para fornecer tutoria conversacional, esclarecimento de dúvidas, explicações personalizadas e apoio à revisão dos conteúdos. O Avatar Training gere a experiência de sessão com avatar; o AI-Tutor fornece a camada de tutoria inteligente.

Documento de referência para desenho funcional, implementação backend/frontend, integração e testes. Os nomes de modelos, endpoints e ficheiros apresentados são propostas e devem ser alinhados com a estrutura actual do repositório INNOVA.

*Versão de trabalho • Outubro de 2026*

---

## 1. Objectivos e âmbito

O Avatar Training é o ambiente de formação interactiva da INNOVA com instrutores virtuais. Deve permitir que os colaboradores aprendam, pratiquem situações profissionais, recebam feedback e demonstrem conhecimentos através de aulas guiadas, diálogos e simulações.

- Disponibilizar um instrutor virtual com voz e representação visual, conforme as capacidades do fornecedor integrado.
- Executar simulações profissionais: atendimento ao cliente, vendas, operações de loja, logística, segurança, liderança e gestão de conflitos.
- Personalizar explicações e exercícios de acordo com o conteúdo, o nível e os resultados anteriores do formando.
- Registar progresso, tentativas, avaliações e competências demonstradas.
- Integrar resultados com os módulos de cursos, inscrições, avaliações, competências, PDI e relatórios.
- Permitir utilização por texto mesmo quando microfone, voz ou vídeo não estejam disponíveis.

---

## 2. Navegação e abas

| Aba | Finalidade |
|---|---|
| Visão Geral | Resumo de sessões, utilização, progresso, resultados e alertas. |
| Sala de Formação Virtual | Área de interacção entre formando e avatar. |
| Formações com Avatar | Catálogo de formações com instrutor virtual. |
| Simulações | Cenários de prática e role-play profissional. |
| Avatares | Gestão de imagem, voz, idioma, especialidade e estado. |
| Construtor de Sessões | Configuração de etapas, conteúdos, exercícios e regras. |
| Base de Conhecimento | Fontes aprovadas que o avatar e o AI-Tutor podem consultar. |
| Avaliações | Perguntas, rubricas, critérios e resultados. |
| Competências | Competências treinadas e resultados demonstrados. |
| Progresso dos Formandos | Acompanhamento individual e por grupo. |
| Relatórios | Indicadores de utilização, aprendizagem e eficácia. |
| Configurações | Idioma, fornecedores, voz, permissões e regras de utilização. |
| Histórico | Sessões anteriores, resultados e auditoria. |

A navegação deve ser adaptada ao perfil: o formando vê sobretudo as suas sessões, formações e progresso; as funções administrativas são reservadas aos utilizadores autorizados.

---

## 3. Dashboard e indicadores

| Indicador | Definição / regra |
|---|---|
| Sessões realizadas | Número de sessões iniciadas ou concluídas no período; apresentar cada estado separadamente. |
| Taxa de conclusão | Sessões concluídas ÷ sessões iniciadas elegíveis × 100. |
| Aproveitamento médio | Média das avaliações válidas, identificando a escala utilizada. |
| Tempo médio | Duração média das sessões concluídas, excluindo pausas técnicas conforme regra definida. |
| Formandos activos | Utilizadores com pelo menos uma actividade no período. |
| Simulações concluídas | Número de exercícios de simulação finalizados. |
| Taxa de aprovação | Avaliações aprovadas ÷ avaliações concluídas elegíveis × 100. |
| Evolução entre tentativas | Diferença entre resultados comparáveis da primeira e da última tentativa. |
| Formação obrigatória | Atribuições concluídas, pendentes e fora do prazo. |
| Qualidade das respostas | Perguntas sem resposta adequada, erros reportados e conteúdos a rever. |
| Consumo tecnológico | Utilização e custo estimado de IA, voz e vídeo, se disponível. |
| Incidentes técnicos | Falhas de fornecedor, erros e sessões interrompidas. |

Todos os indicadores devem apresentar período, filtros, data de actualização, fórmula e fonte. Não apresentar valores fictícios quando não existam dados; utilizar «Sem dados» quando aplicável.

---

## 4. Ficha de uma formação virtual

| Campo | Descrição |
|---|---|
| Código e título | Identificador único e nome da formação. |
| Objectivos e descrição | Resultados de aprendizagem esperados e conteúdo. |
| Categoria e nível | Área temática e nível de dificuldade. |
| Curso / módulo associado | Referências aos cursos e módulos existentes. |
| Avatar e formador responsável | Instrutor virtual seleccionado e responsável humano pelo conteúdo. |
| Público-alvo | Cargos, departamentos, unidades ou grupos. |
| Idioma e duração | Idioma, variante e duração estimada. |
| Tipo de experiência | Aula guiada, Q&A, role-play, demonstração ou avaliação prática. |
| Pré-requisitos | Cursos ou conhecimentos exigidos. |
| Fontes aprovadas | Documentos, conteúdos e versões de referência. |
| Competências-alvo | Competências a desenvolver ou praticar. |
| Avaliação | Método, rubrica, nota mínima e tentativas permitidas. |
| Certificação | Regras de conclusão e eventual pedido de certificado. |
| Estado e versão | Rascunho, revisão, publicado ou arquivado; versão e datas. |
| Aprovação | Responsável e registo de validação antes da publicação. |

---

## 5. Sala de Formação Virtual

- Avatar com imagem ou vídeo e, quando suportado, animação sincronizada com voz.
- Interacção por texto e, opcionalmente, microfone e voz sintetizada.
- Transcrição apenas conforme as regras de privacidade e retenção configuradas.
- Controlos para pausar, retomar, repetir explicação e terminar a sessão.
- Apresentação de slides, imagens, vídeos e documentos aprovados.
- Perguntas de verificação, exercícios e simulações com ramificações.
- Feedback após a resposta, progresso por etapas e tempo de sessão.
- Opção de ajuda ou encaminhamento para um formador humano.
- Acessibilidade: legendas, teclado e alternativa à voz.

A sessão deve continuar funcional por texto se o serviço de voz ou vídeo estiver indisponível. A interface deve identificar claramente que o interlocutor é um instrutor virtual.

---

## 6. Gestão de avatares

| Campo | Descrição |
|---|---|
| Nome e descrição | Identidade funcional e finalidade do avatar. |
| Imagem e tipo | Imagem, avatar 2D/3D ou vídeo, conforme fornecedor. |
| Voz e idioma | Voz, idioma, variante e parâmetros permitidos. |
| Tom de comunicação | Perfil didáctico e estilo de comunicação aprovado. |
| Especialidade | Área de conhecimento e tipos de formação suportados. |
| Fornecedor e modelo | Serviço de IA, voz ou vídeo e versão, quando aplicável. |
| Base de conhecimento | Fontes autorizadas para respostas. |
| Estado e responsável | Activo, em teste, inactivo ou arquivado; responsável pela gestão. |
| Histórico | Datas de criação, alteração, testes e desactivação. |

---

## 7. Construtor de sessões e tipos de experiência

- Configurar objectivos, público-alvo, pré-requisitos e mensagem inicial.
- Organizar conteúdos em etapas com texto, recursos e perguntas.
- Definir cenários, opções de resposta, consequências e feedback.
- Configurar critérios, pesos, nota mínima, tentativas e regras de conclusão.
- Definir condições para avançar, repetir ou recomendar conteúdo complementar.
- Submeter a sessão a revisão e aprovação antes de publicar.

| Tipo | Utilização |
|---|---|
| Aula guiada | Apresentação estruturada de conteúdos pelo avatar. |
| Perguntas e respostas | Esclarecimento de dúvidas com base em fontes aprovadas. |
| Role-play | Prática de atendimento, liderança, vendas ou gestão de conflitos. |
| Demonstração de procedimento | Explicação passo a passo de uma tarefa. |
| Avaliação prática | Demonstração de conhecimentos num cenário simulado. |
| Revisão personalizada | Revisão dos tópicos em que o formando revelou dificuldades. |

---

## 8. Integração obrigatória com o módulo AI-Tutor

O Avatar Training deve estar integrado com o módulo AI-Tutor da INNOVA. A integração deve ser explícita e reutilizar os serviços existentes do AI-Tutor, evitando criar uma segunda implementação independente de tutoria inteligente.

### 8.1. Separação de responsabilidades

| Componente | Responsabilidade |
|---|---|
| Avatar Training | Experiência de sessão, avatar visual/voz, etapas, simulações, controlo da sessão e ligação ao formando. |
| AI-Tutor | Tutoria conversacional, explicações adaptadas, esclarecimento de dúvidas, sugestões de revisão e apoio à aprendizagem. |
| Base de Conhecimento | Conteúdos aprovados, documentos de referência, controlo de versões e fontes consultáveis. |
| Assessments | Avaliação formal, critérios, notas e estado de aprovação, conforme o modelo existente. |
| Enrollments / Courses | Inscrição, progresso e estado oficial de conclusão do curso. |

### 8.2. Funcionalidades da integração

- Disponibilizar uma acção «Perguntar ao AI-Tutor» dentro da sala virtual, sem obrigar o formando a abandonar a sessão.
- Permitir que o avatar encaminhe uma dúvida para o AI-Tutor e apresente a explicação recebida em texto ou voz, conforme a configuração.
- Enviar contexto mínimo necessário: sessão, etapa actual, objectivo de aprendizagem, idioma e referências autorizadas.
- Permitir ao AI-Tutor explicar um conceito de outra forma, apresentar exemplos e sugerir exercícios de revisão.
- Utilizar apenas fontes autorizadas para o curso e indicar as referências quando disponíveis.
- Permitir que o AI-Tutor recomende uma etapa ou conteúdo de reforço, sem alterar automaticamente uma nota formal.
- Registar a utilização e o resultado da tutoria sem duplicar todo o histórico de conversação em vários módulos.
- Devolver ao Avatar Training estados claros para erros, indisponibilidade, limite de utilização ou resposta sem fonte adequada.

### 8.3. Fluxo funcional

| Etapa | Comportamento |
|---|---|
| 1. Dúvida | O formando coloca uma pergunta durante a sessão. |
| 2. Contexto | Avatar Training envia ao AI-Tutor o contexto mínimo autorizado. |
| 3. Recuperação | AI-Tutor consulta conteúdos aprovados e prepara a explicação. |
| 4. Resposta | A resposta regressa à sala e é apresentada em texto ou voz. |
| 5. Continuação | O formando retoma a etapa, pede outro exemplo ou realiza um exercício. |
| 6. Registo | São guardados os eventos necessários, referências e métricas de utilização. |

### 8.4. Regras técnicas

- Usar o serviço/API interno existente do AI-Tutor, com autenticação serviço-a-serviço.
- Não expor chaves de IA no browser nem duplicar credenciais no Avatar Training.
- Respeitar permissões, âmbito de acesso e filtros de conteúdo aplicáveis ao utilizador.
- Definir timeouts, limites de pedidos, tratamento de erros e alternativa por texto.
- Impedir que o tutor apresente como oficial uma resposta que contradiga procedimentos aprovados; quando necessário, encaminhar para o formador.
- Versionar os prompts, modelos e fontes relevantes para permitir auditoria.
- Definir regras de retenção para perguntas, respostas e transcrições.
- Medir separadamente a utilização do AI-Tutor e a utilização do avatar para análise de custos.

A integração deve ser testada de ponta a ponta. Se o AI-Tutor já tiver uma base de conhecimento, motor de conversação ou histórico, estes componentes devem ser reutilizados conforme a arquitectura existente.

---

## 9. Matriz de integração com os módulos INNOVA

| Módulo | Integração |
|---|---|
| users / auth | Identidade, perfis, autenticação e autorização. |
| departments / organization | Unidades, departamentos, hierarquia e segmentação. |
| courses / course-modules | Associação da formação virtual a cursos e unidades. |
| enrollments | Inscrições, atribuições e progresso oficial. |
| trainings / instructor | Plano de formação, sessões e responsável humano. |
| assessments | Avaliações formais, critérios e resultados. |
| competencies / competency-map | Competências-alvo, lacunas e resultados demonstrados. |
| performance / 360 feedback | Identificação autorizada de necessidades de desenvolvimento. |
| development-plans | Ligação a acções de PDI e actualização de progresso. |
| career-plans / talent-development | Formação alinhada com planos de carreira e talento. |
| onboarding / leadership | Percursos de integração e desenvolvimento de liderança. |
| micro-learning / learning-paths | Reutilização de sessões curtas e inclusão em percursos, se mantidos. |
| content-library / knowledge | Conteúdos de aprendizagem e fontes aprovadas. |
| document-repository | Documentos internos autorizados e respectivas versões. |
| AI-Tutor | Tutoria conversacional, explicações personalizadas e revisão. |
| attendance | Presença em actividades formativas quando aplicável. |
| certificates ou equivalente | Pedido de emissão quando os critérios forem cumpridos. |
| notifications | Lembretes, atribuições, prazos e conclusão. |
| events / processes / automations | Eventos, aprovações e automatização de tarefas. |
| history | Auditoria de alterações e operações relevantes. |
| executive-reports / reports | Indicadores consolidados e relatórios. |
| API Integration | Ligação segura a serviços externos de IA, voz e vídeo. |
| payroll / payslips | Sem integração directa por defeito; apenas casos de negócio autorizados. |

A matriz descreve integrações funcionais propostas. A implementação deve confirmar quais módulos, modelos, endpoints e serviços já existem. Não criar módulos redundantes só para cumprir esta lista.

---

## 10. Avaliação e regras de conclusão

Separar avaliação de conhecimentos (por exemplo, escolha múltipla e resposta curta) de avaliação de simulações, baseada numa rubrica previamente definida e validada pelo responsável pedagógico.

| Critério ilustrativo | Peso |
|---|---|
| Cumprimento do procedimento | 30% |
| Comunicação e clareza | 25% |
| Compreensão da situação | 20% |
| Qualidade da solução proposta | 25% |
| **Total** | **100%** |

- Os pesos e critérios são configuráveis por formação.
- A conclusão pode exigir etapas obrigatórias, submissão de avaliação e nota mínima.
- Concluir uma sessão não significa concluir automaticamente o curso inteiro.
- A inscrição e o estado global do curso continuam sob responsabilidade de Enrollments/Courses.
- Resultados gerados por IA devem ser explicáveis e sujeitos a revisão adequada.
- Não utilizar a avaliação automática isoladamente para decisões laborais de elevado impacto.

---

## 11. Relatórios

| Relatório | Conteúdo |
|---|---|
| Utilização dos avatares | Sessões por avatar, idioma, duração e tipo. |
| Participação e conclusão | Formandos, tentativas, estados e taxas de conclusão. |
| Aproveitamento | Notas, aprovações e evolução entre tentativas. |
| Simulações | Resultados por cenário e critério. |
| Competências | Competências praticadas e resultados demonstrados. |
| Formação obrigatória | Atribuições, prazos, conclusões e pendências. |
| Onboarding | Sessões atribuídas e concluídas por novas admissões. |
| Unidades e departamentos | Indicadores agregados por estrutura. |
| Eficácia da aprendizagem | Comparação entre avaliações equivalentes, quando disponíveis. |
| Qualidade das respostas | Perguntas sem resposta adequada e conteúdos a rever. |
| AI-Tutor | Utilização, tipos de pedido, latência, falhas e custo estimado. |
| Custos tecnológicos | Consumo de IA, voz e vídeo, custo por sessão. |
| Incidentes e auditoria | Falhas técnicas, alterações e eventos relevantes. |

---

## 12. Modelos de dados Prisma propostos

| Modelo | Campos principais |
|---|---|
| `TrainingAvatar` | id, name, description, avatarType, imageUrl, voiceConfig, language, provider, status, createdById |
| `AvatarTrainingProgram` | id, title, description, courseId, category, difficulty, status, version, createdById |
| `AvatarTrainingSession` | id, programId, title, avatarId, objectives, contentConfig, durationMinutes, status, version |
| `AvatarTrainingAssignment` | id, sessionId, userId, enrollmentId, assignedById, dueDate, status |
| `AvatarTrainingAttempt` | id, assignmentId, userId, startedAt, completedAt, status, score, feedback, attemptNumber |
| `AvatarTrainingInteraction` | id, attemptId, sequence, interactionType, content, createdAt |
| `AvatarTrainingAssessment` | id, sessionId, assessmentId, rubricConfig, passingScore, maxAttempts |
| `AvatarTrainingCompetencyResult` | id, attemptId, competencyId, score, evidence, assessedAt |
| `AvatarTrainingKnowledgeSource` | id, sessionId, sourceType, sourceId, version, status |
| `AvatarTrainingProviderConfig` | id, provider, serviceType, configuration, status |
| `AvatarTrainingAudit` | id, userId, action, entityType, entityId, createdAt |

Estes nomes são sugestões. Reutilizar modelos existentes e criar apenas o que for necessário. Não duplicar utilizadores, cursos, inscrições, avaliações ou conteúdos.

---

## 13. Endpoints sugeridos

| Método e rota | Finalidade |
|---|---|
| `GET /avatar-training/overview` | Dashboard. |
| `GET, POST /avatar-training/programs` | Listar e criar formações. |
| `GET, PATCH /avatar-training/programs/:id` | Consultar e editar formação. |
| `POST /avatar-training/programs/:id/publish` | Publicar após aprovação. |
| `GET, POST /avatar-training/avatars` | Listar e criar avatares. |
| `PATCH /avatar-training/avatars/:id` | Editar avatar. |
| `GET, POST /avatar-training/sessions` | Listar e criar sessões. |
| `POST /avatar-training/sessions/:id/assign` | Atribuir sessão. |
| `POST /avatar-training/sessions/:id/start` | Iniciar tentativa. |
| `POST /avatar-training/attempts/:id/interactions` | Registar interacção. |
| `POST /avatar-training/attempts/:id/submit` | Submeter respostas. |
| `POST /avatar-training/attempts/:id/complete` | Concluir tentativa. |
| `GET /avatar-training/attempts/:id/results` | Consultar resultados. |
| `GET /avatar-training/progress` | Consultar progresso autorizado. |
| `GET /avatar-training/reports` | Consultar relatórios. |
| `GET /avatar-training/providers/health` | Estado dos fornecedores, sem expor segredos. |

A integração com AI-Tutor deve preferencialmente utilizar o serviço interno existente. Se for necessário um endpoint dedicado, definir contrato, autenticação, contexto permitido, formato de resposta e tratamento de erros em conjunto com o módulo AI-Tutor.

---

## 14. Estrutura de ficheiros proposta

- `avatar-training.module.ts` — registo do módulo e dependências.
- `avatar-training.controller.ts` — rotas e validação dos pedidos.
- `avatar-training.service.ts` — lógica de negócio principal.
- `avatar-training-programs.service.ts` — formações e sessões.
- `avatar-training-attempts.service.ts` — tentativas, progresso e conclusão.
- `avatar-training-assessments.service.ts` — avaliações e critérios.
- `avatar-training-integrations.service.ts` — integração com módulos internos.
- `avatar-training-ai-tutor.service.ts` — adaptador para o serviço AI-Tutor existente.
- `avatar-training-providers.service.ts` — serviços externos de voz e vídeo.
- `avatar-training-reports.service.ts` — indicadores e relatórios.
- `dto/` e `tests/` — validação e testes.

No frontend Next.js, a página poderá ficar em `src/app/(dashboard)/avatar-training/page.tsx`, se essa for a convenção actual do projecto. Confirmar a estrutura existente antes de criar ficheiros.

---

## 15. Segurança, privacidade e qualidade

- Verificar permissões no backend em todas as operações e exportações.
- Informar sobre utilização de microfone, voz, transcrição e serviços de IA.
- Guardar credenciais dos fornecedores em variáveis de ambiente ou gestão de segredos.
- Limitar respostas às fontes aprovadas e permitir ao tutor reconhecer incerteza.
- Aplicar revisão humana a conteúdos e avaliações relevantes.
- Definir retenção, acesso e eliminação de transcrições e gravações.
- Não activar reconhecimento emocional ou biométrico por defeito.
- Definir limites de utilização e custos por sessão e fornecedor.
- Registar versões dos conteúdos, critérios, modelos e fontes relevantes.
- Implementar alternativa por texto e tratamento de interrupções.

**Política implementada (privacidade):**
- **Gravações:** o módulo não grava nem armazena áudio nem vídeo. A voz é sintetizada em tempo real (o áudio não é guardado) e o microfone serve apenas para ditado no navegador. Só existem transcrições de texto.
- **Retenção e eliminação:** o texto livre das conversas é anonimizado após `AVATAR_TRAINING_RETENTION_DAYS` (por omissão 365; `0` desactiva), por rotina diária. O utilizador pode eliminar as suas transcrições com `DELETE /avatar-training/my/transcripts`, e ADMIN/RH a pedido com `DELETE /avatar-training/users/:userId/transcripts`. Tentativas em curso nunca são tocadas.
- **Reconhecimento emocional/biométrico:** não existe e não é activado. Qualquer introdução futura exige consentimento explícito e decisão formal.
- **Versões:** cada tentativa guarda `sessionVersion` e `rubricVersion` do momento em que começou; `GET /attempts/:id/results` devolve `versions.outdated = true` se o conteúdo ou a rubrica mudaram depois.

---

## 16. Critérios de aceitação

- Avatares podem ser criados, testados, configurados e desactivados.
- Formações podem ser criadas, revistas, publicadas e arquivadas.
- O formando consegue iniciar, pausar, retomar e concluir sessões.
- A interacção por texto funciona sem microfone.
- A integração com AI-Tutor funciona dentro da sessão e respeita as permissões.
- O AI-Tutor recebe contexto mínimo e utiliza fontes autorizadas.
- As falhas do AI-Tutor não bloqueiam toda a sessão.
- As tentativas, avaliações e resultados são persistidos correctamente.
- As integrações actualizam os módulos de origem sem duplicar registos.
- Os dashboards e relatórios utilizam dados reais.
- Existem políticas de retenção, auditoria e controlo de custos.
- Testes cobrem permissões, conclusão, integração, falhas e privacidade.

---

## 17. Ordem recomendada de implementação

| Fase | Trabalho |
|---|---|
| 1. Base | Permissões, schema, modelos e configuração dos avatares. |
| 2. Sessões | Sala virtual, atribuições, tentativas, progresso e histórico. |
| 3. Academia | Integração com Courses, Enrollments, Assessments e conteúdos. |
| 4. AI-Tutor | Integração com o serviço existente, contexto, fontes e fallback. |
| 5. Voz e vídeo | Fornecedor, sincronização, acessibilidade e controlo de custos. |
| 6. Desenvolvimento | Competências, PDI, onboarding e recomendações. |
| 7. Relatórios | KPIs, relatórios, notificações e Executive Reports. |
| 8. Qualidade | Testes, segurança, privacidade e validação pedagógica. |

---

## 18. Princípio arquitectural final

Avatar Training gere a experiência de aprendizagem com avatar; AI-Tutor fornece a tutoria inteligente; Courses, Enrollments e Assessments mantêm os registos oficiais dos cursos, inscrições e avaliações; Development Plans acompanha as acções de desenvolvimento; Executive Reports consolida os resultados.

Esta separação permite evoluir a experiência de formação sem duplicar lógica, dados ou serviços. A implementação deve começar por inspeccionar o schema Prisma, os módulos e serviços existentes, reutilizando componentes antes de acrescentar novos.
