# Handlers marcados `@AnyAuthenticated()` que precisam de revisão de âmbito (T3.2 → T8/T9)

A T3 marcou 349 handlers sem política com `@AnyAuthenticated()` — **sem mudar comportamento**.
A maioria é self-service (`my*`, `me`, `changePassword`). Os abaixo NÃO são obviamente self-service:
confirmar no serviço que filtram por dono/âmbito (`assertCanAccess`) ou restringir com `@Roles`.

- `knowledge`: `create`, `update` (quem pode publicar conhecimento?), `createQuestion`, `answerQuestion`
- `work-declaration`: `findAll`, `findOne`, `exportPdf`, `exportDocx` (listagem global?)
- `declarations`: `findOne` (×2), `getPending` (fila de aprovação?)
- `departments`: `findAll`, `findOne`, `ladder`, `positions`, `position`
- `users`: `findOne`, `directory`; `user-qualifications`: escrita sobre `:userId`
- `process-standard`: `findAll`, `findOne`, `getInstance`, `completeStep`, `rejectStep`, `qrCode`
- `development-plans`: `findOne`, `addAction`, `submit`; `career-plans`: `findOne`, `getProgress`, `addGoal`
- `live-classes`: `listAllSessions`, `listParticipants`, `listRecordings`, `listMaterials`, `messages`
- `evaluation360`: `listCycles`, `getCycleDetail`, `getResult`, `getProgress`
- `onboarding`: `findOne`; `events`: `findAll`, `findOne`; `library`/`document-repository`: `findOne`, `download`
- `pdf.downloadDeclaration`, `crm-beneficiaries.getFollowUps`, `scalability-infra.recordFrontendPerf`
- `ai-tutor`: todos (custo de IA + dados) — avaliar quota/papel
