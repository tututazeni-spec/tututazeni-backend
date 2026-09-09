# Programas Corporativos de Liderança — desenho técnico

## Objetivo

Evoluir o módulo `leadership` de um catálogo simples de programas para uma gestão corporativa completa de programas de liderança. A solução reutiliza os módulos canónicos de Academia, competências, PDI, mentoring, certificação, sucessão, notificações e documentos; não cria cópias desses domínios.

## Estado atual

`LeadershipProgram` possui hoje nome, descrição, nível, estado, duração, trilha opcional, obrigatoriedade, score mínimo, datas e participantes. O módulo já contém participantes, mentoring, 1:1, feedback 360°, pulse, score de liderança, certificados e uma página Next.js com seis separadores.

## Autorização e ownership

- `ADMIN` e `RH` podem criar, consultar, atualizar e administrar todos os programas.
- `GESTOR`, `INSTRUCTOR`, `DIRECTOR` e `LIDER` podem criar programas e gerir somente aqueles de que são autores ou responsáveis.
- Participantes só podem consultar os seus próprios dados, percurso, avaliações e evidências.
- Todas as verificações são feitas no serviço/controlador; a visibilidade da UI não é um controlo de segurança.

## Modelo de domínio

`LeadershipProgram` mantém-se como agregado central e passa a ter: código único, autor, responsável, departamento, objetivo geral, tipo, nível corporativo, estado, datas, duração, carga horária, sessões, frequência, modalidade, local, capacidade, mínimo de participantes, horário, calendário, critérios de conclusão e configuração de certificação.

Entidades dependentes normalizadas:

| Entidade | Responsabilidade |
| --- | --- |
| `LeadershipProgramTargeting` | Funções, hierarquia, departamentos, unidades, famílias profissionais, antiguidade, desempenho, potencial, idade quando aplicável e critérios livres. |
| `LeadershipSelectionCriterion` | Critério ponderado, fonte de dados e peso de elegibilidade. |
| `LeadershipProgramCompetency` | Competência existente, nível atual/esperado, peso e indicadores comportamentais. |
| `LeadershipProgramObjective` | Objetivos mensuráveis e indicadores. |
| `LeadershipProgramContent` | Associação a cursos, trilhas e conteúdos existentes da Academia; nunca os duplica. |
| `LeadershipProgramMethodology` | Formação, workshop, coaching, mentoria, projeto, simulação e demais metodologias, com peso. |
| `LeadershipProgramAdvisor` | Mentor, coach, especialista, formador ou responsável de acompanhamento. |
| `LeadershipProgramParticipant` | Perfil, estado, score persistido, dados de baseline, readiness, mentor/coach e progresso do participante. Evolui a relação `LeadershipParticipant` existente. |
| `LeadershipParticipantPlan` e ações | Percurso individual associado ao `DevelopmentPlan`/PDI canónico. |
| `LeadershipParticipantAssessment` | Avaliações inicial, intermédia e final, feedback e readiness final. |
| `LeadershipProject` | Desafio prático, KPI/meta, sponsor, mentor, evidências, resultado e avaliação. |
| `LeadershipProgramCost` | Componentes de custo e totais por programa/participante. |
| `LeadershipProgramDocument` | Referência a documentos existentes do repositório documental. |
| `LeadershipProgramCommunication` | Eventos/notificações programáticas para convites, prazos, sessões, avaliações e conclusão. |

Os enums representarão tipos e estados sem sobrecarregar strings livres. A migração preservará os registos atuais e converterá `LeadershipParticipant` no modelo expandido, sem perder a chave composta `userId_programId`.

## Fluxo operacional

1. Um utilizador autorizado cria o programa em rascunho e configura informação, objetivos, planeamento, público, seleção, competências, conteúdos, metodologias, equipa, avaliações, projeto, conclusão, certificação, custos, documentos e comunicações.
2. Ao abrir seleção/inscrição, o backend identifica candidatos e calcula o score de elegibilidade automaticamente a partir de desempenho, potencial, competências, 360°, experiência e carreira, conforme os pesos ativos.
3. RH/ADMIN seleciona, convoca ou inscreve participantes. O score e as parcelas usadas no cálculo ficam persistidos para explicação, auditoria e histórico.
4. Cada participante recebe baseline, metas de competências, readiness e um plano individual que referencia o PDI e recursos já existentes.
5. Sessões, metodologias, mentoring/coaching, avaliações e projeto atualizam o progresso e as evidências.
6. A conclusão valida critérios, percentagem, avaliação final e projeto. Quando aplicável, emite o `Certificate` canónico e atualiza readiness/sucessão.

## Regras de negócio

- Pesos de seleção e de metodologias têm de totalizar 100% quando ativados.
- O score é calculado exclusivamente no servidor. Dados ausentes e respetivo impacto são devolvidos de forma explicável.
- Estados do programa e do participante usam transições válidas; operações como certificar, concluir ou cancelar não podem contornar pré-requisitos.
- Todas as referências são verificadas contra as entidades canónicas antes de persistir.
- `NotificationLog.metadata` é sempre serializado com `JSON.stringify`.
- Operações administrativas, seleção, alterações de estado, emissão de certificado e integrações de sucessão são auditadas.

## Interface

A página `/(platform)/leadership` passa a organizar as áreas: Visão Geral, Programas, Participantes, Mentores & Coaches, Projetos de Liderança, Avaliações, Resultados e Configurações. A criação/edição será um fluxo sequencial com 16 etapas, preservando componentes, tokens e padrões de React Query existentes.

## Fases de implementação

1. **Fundação:** schema/migration, DTOs, autorização/ownership, CRUD de programa, planeamento, público-alvo, critérios, competências, objetivos, conteúdos e metodologias.
2. **Seleção e participação:** motor de elegibilidade, candidatos, participantes, baseline, mentor/coach e plano individual/PDI.
3. **Execução:** avaliações, projetos, evidências, documentos, custos e comunicações.
4. **Conclusão e análise:** regras de conclusão, certificados, readiness, sucessão, KPIs/ROI e dashboards.
5. **Frontend e regressão:** UI completa é entregue por fatias nas fases anteriores; a última fase fecha acessibilidade, testes e regressões integradas.

Cada fase inclui migration Prisma, DTOs validados, controlo de acesso e ownership, testes unitários e testes de integração contra PostgreSQL. A suite integral de integração corre no fim da alteração.

## Não objetivos

- Não criar cursos, aulas, certificados, PDIs, competências, sucessões, documentos ou notificações paralelos.
- Não inferir políticas etárias: o critério de idade só existe quando uma regra organizacional explícita o configurar.
