# Revisão dos handlers `@AnyAuthenticated()` (resultado)

A T3 marcou 349 handlers sem política com `@AnyAuthenticated()` sem mudar comportamento. Esta revisão
olhou para os que **não são obviamente self-service**.

## Corrigidos (furo real)
| Handler | Problema | Correção |
|---|---|---|
| `knowledge` `create`/`update` | qualquer autenticado publicava, arquivava, tornava obrigatório e editava artigos alheios | só ADMIN/RH publicam/obrigatório; autor edita só os seus |
| `work-declaration` `exportPdf`/`exportDocx` | exportava a declaração de outro colaborador pelo id (IDOR) | `assertCanAccess` (dono, ADMIN, RH) |
| `evaluation360` `feedback/continuous/:userId`, `participants/:userId/progress` | qualquer autenticado lia o feedback recebido (com nomes de autores) e o progresso de qualquer pessoa | só a pessoa, ADMIN/RH/AUDITOR/DIRECTOR e chefe direto (`person-access.ts`); outros recebem 404 |
| `users` `GET /:id` | devolvia NIF, NIB, BI, morada, contactos a qualquer autenticado | `redactUserProfile` salvo próprio/ADMIN/RH/AUDITOR/DIRECTOR/chefe direto |

## Verificados, sem alteração
- `declarations` `findOne` (×2) e `my/*`: passam o utilizador ao serviço, que verifica o dono.
- `process-standard` `completeStep`/`rejectStep`/`getInstance`: verificam responsável (A10-7).
- `pdf.downloadDeclaration`: devolve dados fictícios (sem fuga); TODO de ownership mantido no código.
- `users` `directory`: campos públicos de propósito.
- Catálogos de referência (`departments`, `competencies`, `competency-map` matriz, `career-plans` papéis, `evaluation360` catálogos, `process-standard` modelos): legíveis por todos por desenho.

## Aceites abertos (decisão a confirmar com produto)
- `live-classes` listagens globais (participantes, gravações, materiais, mensagens do chat): expõem só nomes/ids e o frontend mostra-as a todos. Restringir quebra essas páginas.
- `ai-tutor` `knowledgeSources`/`knowledgeSearch`: conhecimento corporativo para qualquer utilizador.

- `competencies` `userEndorsements`: reconhecimentos entre colegas (funcionalidade social), baixo risco.
- `library` `findItemById`, `events` `findOne`: conteúdo corporativo partilhado.

## Não analisados em profundidade
`development-plans`/`career-plans`/`onboarding` `findOne` recebem o utilizador; confirmar `assertCanAccess` método a método (regra 14).
Varredura feita: nenhum outro handler aberto recebe `userId`/`employeeId` pelo URL sem receber o chamador.
