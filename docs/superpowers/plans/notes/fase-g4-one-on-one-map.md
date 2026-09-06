# Fase G4 — Nota de mapeamento: 1:1 → `OneOnOneService` / `OneOnOneMeeting`

> Task 1 do plano `docs/superpowers/plans/2026-09-05-fase-g4-one-on-one-consolidation.md`.
> Data: 2026-09-06.

## Correcção ao plano — são **3** caminhos de escrita, não 2

O plano dizia "`leader` só lê 1:1 — fica (§4)". **Errado.** `leader.service.ts` escreve
`OneOnOneMeeting` em `createOneOnOne` (`:623`) e `completeOneOnOne` (`:713`). Os 3 caminhos:

| módulo | modelo | chaves | notas |
|---|---|---|---|
| `engagement` (`:851` create, `:921` update) | `OneOnOneMeeting` | `hostId`/`participantId` | escreve `recurring`/`frequency`; `updateOneOnOne` mapeia `notes → minutes`, `completed → status/completedAt`; ownership host\|participant\|ADMIN/RH |
| `leader` (`:623` create, `:713` complete) | `OneOnOneMeeting` | `hostId`/`participantId` | sem `recurring`; ownership: participante da equipa do líder (`managerId===leaderId`) OU próprio OU ADMIN/RH; `.catch()` degrada silenciosamente (leftover de `safeM()` — **removido** na delegação, falha real passa a propagar) |
| `leadership` (`:411` create, `:472` complete) | **`OneOnOne`** (legado) | `managerId`/`subordinateId` | modelo diferente; `getOneOnOnes` inclui `subordinate {..., position}`; `completeOneOnOne` grava `minutes`/`actionItems`/`nextMeetingDate` |

`enum OneOnOneStatus` (`SCHEDULED | COMPLETED | CANCELLED | RESCHEDULED`) é **partilhado** pelos dois
modelos — sem tradução de estado.

Leituras de agregação que **ficam** (§4): `engagement.service.ts:1203` (`oneOnOneMeeting.count`),
`leadership.service.ts:730,790` (`oneOnOne.count`/`findMany` no dashboard do líder).

## Field map `OneOnOne` → `OneOnOneMeeting` (migração)

`managerId→hostId`, `subordinateId→participantId`; `scheduledAt`/`durationMinutes`/`status`/`agenda`/
`meetingUrl`/`minutes`/`actionItems`/`nextMeetingDate`/`completedAt`/`createdAt` → homónimos;
sem `recurring`/`frequency` na origem → `false`/`null`. `+ legacyOneOnOneId Int? @unique` no destino.

## API canónica (`src/one-on-one/`)

`OneOnOneService`:
- `schedule(dto: { hostId; participantId; scheduledAt: string|Date; durationMinutes?; agenda?; meetingUrl?; recurring?; frequency?; status? }) → OneOnOneMeeting` — só a escrita; **os callers mantêm a sua notificação** (o texto difere por contexto; nenhum tipo é consumido — grep confirmado).
- `update(id, dto: Partial<...>) → OneOnOneMeeting` — converte `scheduledAt` para Date se presente.
- `listForUser(userId, opts?: { hostOnly?: boolean; otherPartyId?: number }) → OneOnOneMeeting[]` — default `OR:[{hostId},{participantId}]` (engagement); `hostOnly` filtra `hostId` (leader/leadership); `otherPartyId` restringe o outro lado. `include: host, participant`.
- `getOne(id) → OneOnOneMeeting` (throws `NotFoundException`).
- `complete(id, dto: { minutes?; actionItems?; nextMeetingDate?: string|Date }) → OneOnOneMeeting` — `status: COMPLETED`, `completedAt: now`.
- `cancel(id) → OneOnOneMeeting` — `status: CANCELLED`.

Ownership fica nos callers (fazem `getOne(id)` → verificam → delegam a escrita), consistente com G1/G2/G3.

## Adaptador `meetingToLeadershipShape(m)`

`managerId = m.hostId`, `subordinateId = m.participantId`, `id = m.legacyOneOnOneId ?? m.id`,
`subordinate = m.participant` (renomeado), restantes campos directos, chaves sempre presentes.
Usado nos retornos de `/leadership/1on1*`.

## Rotas preservadas (sem alteração de contrato)

- `POST /engagement/one-on-one`, `GET /engagement/one-on-one/my`, `PATCH /engagement/one-on-one/:id`
- `POST /leader/1on1`, `GET /leader/1on1`, `PATCH /leader/1on1/:id/complete`
- `POST /leadership/1on1`, `GET /leadership/1on1`, `PATCH /leadership/1on1/complete`

## Migração + backfill

- `prisma/migrations/<ts>_add_oneonone_meeting_legacy_id/migration.sql` (`ADD COLUMN` + `CREATE UNIQUE INDEX`), aplicada com `migrate deploy`.
- `prisma/backfill-one-on-ones.ts` — `backfillOneOnOnes(prisma): Promise<{ created; skipped }>`, `upsert` por `legacyOneOnOneId`, idempotente. **Passo de deploy manual pós-merge.**
- `OneOnOne` fica no schema (deprecado; remoção física = follow-up).

## Módulos

Novo `OneOnOneModule` exporta `OneOnOneService`. `engagement`/`leader`/`leadership` module + `imports: [OneOnOneModule]`. Sem ciclo (`one-on-one` só depende de `PrismaModule`).
