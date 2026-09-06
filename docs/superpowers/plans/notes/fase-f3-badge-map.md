# Fase F3 — Nota de mapeamento `DigitalBadge`/`BadgeIssuance` ↔ `Badge`/`BadgeAward` (confirmada contra o schema real)

> Trava as decisões das Tasks 2–9. Campos e enums confirmados em `prisma/schema.prisma`
> (linhas: `Badge` 4226, `BadgeAward` 4234, `DigitalBadge` 7539, `BadgeIssuance` 7565,
> `enum BadgeLevel` 7601). Segue o mesmo padrão da Fase F2 (`fase-f2-cert-map.md`).

## 1. Modelos e enums reais

```
Badge (schema:4226)          id Int @id @default(autoincrement()); name String @unique;
                             description String? @db.Text; awards BadgeAward[]; recognitions Recognition[]
                             (SEM createdAt/updatedAt; SEM code/imageUrl/level/... — modelo minimalista)

BadgeAward (schema:4234)     id Int @id @default(autoincrement()); userId Int; badgeId Int;
                             awardedAt DateTime @default(now()); userPointsId Int?;
                             relações: user (Cascade), badge (Cascade), userPoints
                             @@index([userId]); @@index([awardedAt])
                             (SEM @@unique([badgeId,userId]); SEM deletedAt/isRevoked/verifyCode/...)

DigitalBadge (schema:7539)   id String @id @default(cuid()); code String @unique; name String (NOT NULL, NÃO @unique);
                             description String (NOT NULL); imageUrl String (NOT NULL); criteria String (NOT NULL);
                             skills String[]; level BadgeLevel @default(BASIC); issuerName String @default("INNOVA");
                             courseId String?; programId String?; isActive Boolean @default(true);
                             createdById Int (NOT NULL); createdAt/updatedAt; deletedAt DateTime?
                             relações: createdBy (User "BadgeCreator"), issuances BadgeIssuance[]
                             @@index([level]); @@index([isActive]); @@index([deletedAt])

BadgeIssuance (schema:7565)  id String @id @default(cuid()); badgeId String; userId Int;
                             assertionId String @unique @default(cuid()); verifyCode String @unique;
                             evidenceUrl String?; shareUrl String?; isRevoked Boolean @default(false);
                             revokedAt DateTime?; revokeReason String?; issuedAt DateTime @default(now());
                             expiresAt DateTime?; issuedById Int (NOT NULL); createdAt; deletedAt DateTime?
                             relações: badge (DigitalBadge), user (User "BadgeRecipient"), issuedBy (User "BadgeIssuer")
                             @@unique([badgeId, userId]); @@index([userId]); @@index([issuedAt]); @@index([deletedAt])

BadgeLevel = BASIC | INTERMEDIATE | ADVANCED | EXPERT | MASTER
```

**Escritores/leitores de `DigitalBadge`/`BadgeIssuance`:** só `certification.service.ts`
(escreve+lê: `createBadge`, `findAllBadges`, `issueBadge`, `getMyBadges`, `generateBadgeCode`,
2 `count` em `getDashboard`) e `dashboard-institutional.service.ts` (1 `count` de `badgeIssuance`,
linha ~75). **Premissa do plano confirmada** — `grep -rn "digitalBadge\|badgeIssuance" src/` fora
de specs só bate nesses dois ficheiros.

**Escritores de `BadgeAward` (par canónico, ~gamificação):** `automation.service.ts:539`,
`avatar-training.service.ts:751`, `engagement.service.ts:730` — **os 3 são
`badgeAward.create({ data: { userId, badgeId } })` envoltos em `.catch()` que só faz
`logger.warn`**. O novo `@@unique([badgeId, userId])` **não gera 500** nesses fluxos: a
tentativa duplicada é apanhada e ignorada (comportamento desejado: emissão idempotente).
Leitores: ~15 serviços (dashboard, leader, users, history, analytics, career, ...) via
`prisma.read.badgeAward` — só `count`/`findMany`/`groupBy`/`_count`, nenhum afectado por
colunas nullable novas.

## 2. Verificação de duplicados / colisões (Global Constraints)

Corrido contra `innova_dev` em 2026-09-06 (branch `refactor/badges-unification`):

```
BadgeAward: 0 linhas | Badge: 0 | DigitalBadge: 0 | BadgeIssuance: 0
SELECT "badgeId","userId",count(*) FROM "BadgeAward" GROUP BY 1,2 HAVING count(*)>1  ->  []
DigitalBadge name collisions (lower(name))                                          ->  []
Badge <-> DigitalBadge name overlap (lower(name))                                   ->  []
```

BD dev vazia → migração aplica-se limpa localmente. **Para produção**, o PR (Task 9) leva:
1. `SELECT "badgeId","userId",count(*) FROM "BadgeAward" GROUP BY 1,2 HAVING count(*)>1;` — correr **antes** do `migrate deploy`.
2. Se houver linhas: SQL de dedup (manter a `awardedAt` mais antiga por par):
   ```sql
   DELETE FROM "BadgeAward" a USING "BadgeAward" b
   WHERE a."badgeId" = b."badgeId" AND a."userId" = b."userId" AND a."id" > b."id";
   ```
3. Só depois `CREATE UNIQUE INDEX "BadgeAward_badgeId_userId_key"` (incluído na migração — se houver duplicados por limpar, `migrate deploy` falha e pára o deploy, que é o comportamento seguro).

## 3. Colunas novas em `model Badge` (Task 2)

Todas nullable/defaulted → os escritores/leitores existentes de `Badge` não são afectados.

| Coluna | Tipo | Origem (`DigitalBadge`) |
|---|---|---|
| `code` | `String? @unique` | `code` (`BDG-xxxxx`) |
| `imageUrl` | `String?` | `imageUrl` |
| `criteria` | `String?` | `criteria` |
| `skills` | `String[]` (`@default([])`) | `skills` |
| `level` | `BadgeLevel @default(BASIC)` | `level` |
| `issuerName` | `String? @default("INNOVA")` | `issuerName` |
| `isActive` | `Boolean @default(true)` | `isActive` |
| `createdById` | `Int?` (plain, SEM relação) | `createdById` |
| `deletedAt` | `DateTime?` | `deletedAt` |
| `legacyDigitalBadgeId` | `String? @unique` | `id` (cuid) — rastreio 1:1 |

- `name` → `name` já existe (`@unique`). `DigitalBadge.name` **não** é único → na migração de
  dados, se dois `DigitalBadge` tiverem o mesmo `name`, sufixar (` (2)`, ` (3)`…) e registar
  `console.warn`. Se um `Badge` nativo já tiver esse `name` → **reutilizar o nativo**
  (ligar-lhe `legacyDigitalBadgeId`, não criar duplicado).
- `description` → `description` já existe (`String?`); `DigitalBadge.description` é NOT NULL → cabe.
- `DigitalBadge.courseId` / `programId` (String?): **descartados**. Não há coluna equivalente em
  `Badge` e nenhum leitor os consome (confirmado por grep). O backfill emite `console.warn` se
  encontrar um valor não-nulo. Não escrever em `criteria` (é texto humano).
- `createdById` fica **coluna plain `Int?`** (sem `@relation`) — mirror da F2
  (`Certificate.issuedById`). Nenhum retorno inclui um objecto `createdBy`.
- `Badge` continua **sem `createdAt`/`updatedAt`** — não se acrescentam (fora da lista do plano).
  O adaptador devolve `createdAt`/`updatedAt` = `null` no `DigitalShape` (degradação de contrato
  conhecida; `findAllBadges` ordena por `level`, não por data).

## 4. Colunas novas em `model BadgeAward` (Task 2)

| Coluna | Tipo | Origem (`BadgeIssuance`) |
|---|---|---|
| `verifyCode` | `String? @unique` | `verifyCode` |
| `assertionId` | `String? @unique` | `assertionId` |
| `evidenceUrl` | `String?` | `evidenceUrl` |
| `shareUrl` | `String?` | `shareUrl` |
| `isRevoked` | `Boolean @default(false)` | `isRevoked` |
| `revokedAt` | `DateTime?` | `revokedAt` |
| `revokeReason` | `String?` | `revokeReason` |
| `expiresAt` | `DateTime?` | `expiresAt` |
| `issuedById` | `Int?` (plain, SEM relação) | `issuedById` |
| `deletedAt` | `DateTime?` | `deletedAt` |
| `legacyBadgeIssuanceId` | `String? @unique` | `id` (cuid) — rastreio 1:1 |
| — | `@@unique([badgeId, userId])` | espelha o `@@unique` de `BadgeIssuance`; suporta o guard "já possui" sem race |

- `BadgeIssuance.issuedAt` → `BadgeAward.awardedAt` (já existe). `awardedAt` é a data canónica.
- `BadgeIssuance.createdAt` → sem equivalente; adaptador devolve `createdAt = awardedAt`.
- `issuedById` fica **plain `Int?`** (sem `@relation`) — nenhum retorno inclui objecto `issuedBy`
  (`issueBadge` devolve o registo cru sem `include`; `getMyBadges` só faz `include: { badge }`).

## 5. Mapa de campos — backfill + `issueBadge`/`createBadge` (Tasks 3, 5)

### `DigitalBadge` → `Badge`

| `DigitalBadge` | `Badge` | Regra |
|---|---|---|
| `id` (cuid) | `legacyDigitalBadgeId` | rastreio; `Badge.id` fica Int |
| `code` | `code` | directo; colisão com `Badge.code` nativo → prefixar `LEG-` (adaptador remove) |
| `name` | `name` | dedup por sufixo se colidir; reutilizar nativo com mesmo `name` |
| `description` | `description` | directo |
| `imageUrl`/`criteria`/`skills`/`level`/`issuerName`/`isActive`/`deletedAt` | homónimos (novos) | directo |
| `createdById` | `createdById` | directo (plain Int) |
| `courseId`/`programId` | — | descartar; `console.warn` se não-nulo |
| `createdAt`/`updatedAt` | — | `Badge` não tem |

### `BadgeIssuance` → `BadgeAward`

| `BadgeIssuance` | `BadgeAward` | Regra |
|---|---|---|
| `id` (cuid) | `legacyBadgeIssuanceId` | rastreio; `BadgeAward.id` fica Int |
| `badgeId` (String cuid) | `badgeId` (Int) | resolver via `Badge.legacyDigitalBadgeId` do badge acabado de garantir |
| `userId` | `userId` | directo |
| `assertionId`/`verifyCode`/`evidenceUrl`/`shareUrl`/`isRevoked`/`revokedAt`/`revokeReason`/`expiresAt`/`issuedById`/`deletedAt` | homónimos (novos) | directo |
| `issuedAt` | `awardedAt` | directo |
| `createdAt` | — | adaptador devolve `createdAt = awardedAt` |

Backfill idempotente: `upsert` por `legacyDigitalBadgeId` / `legacyBadgeIssuanceId`. 2ª corrida → tudo `0`.
Ordem: primeiro **todos os `Badge`**, depois **todos os `BadgeAward`** (resolvendo `badgeId` via o
`Badge` garantido no passo anterior). Issuance cujo `Badge` legado não resolve → `skipped++` + `console.warn`.

## 6. `DigitalShape` / `IssuanceShape` — contrato de resposta de `/certification/badges*`

Chaves **sempre presentes**; `null` quando sem origem. Derivado dos retornos reais de
`createBadge` / `findAllBadges` / `issueBadge` / `getMyBadges` / `getDashboard`
(`src/certification/certification.service.ts:375–445` e `518–522`).

### `DigitalShape` — objecto "badge" (retorno de `createBadge`, item de `findAllBadges`)

```
id:          string            // legacyDigitalBadgeId ?? String(badge.id)
code:        string | null     // sem prefixo LEG-
name:        string
description: string | null
imageUrl:    string | null
criteria:    string | null
skills:      string[]          // [] quando vazio
level:       BadgeLevel        // default 'BASIC'
issuerName:  string            // default 'INNOVA'
courseId:    null              // descartado na F3 (chave mantida = null)
programId:   null
isActive:    boolean           // default true
createdById: number | null
createdAt:   Date | null       // Badge não tem -> null
updatedAt:   Date | null
deletedAt:   Date | null
_count?:     { issuances: number }   // só em findAllBadges; = _count.awards do Badge
```

### `IssuanceShape` — objecto "issuance" (retorno de `issueBadge`, item de `getMyBadges`)

```
id:           string           // legacyBadgeIssuanceId ?? String(award.id)
badgeId:      string           // legacyDigitalBadgeId do badge ?? String(award.badgeId)
userId:       number
assertionId:  string | null
verifyCode:   string | null
evidenceUrl:  string | null
shareUrl:     string | null
isRevoked:    boolean          // default false
revokedAt:    Date | null
revokeReason: string | null
issuedAt:     Date             // = award.awardedAt
expiresAt:    Date | null
issuedById:   number | null
createdAt:    Date             // = award.awardedAt
deletedAt:    Date | null
badge?:       DigitalShape     // só em getMyBadges (include badge) -> badgeToDigitalShape(award.badge)
```

## 7. `certification.service.ts` — pontos de atenção (Task 5)

- `generateBadgeCode()` lê o último `code` de `digitalBadge` → passa a
  `badge.findFirst({ where: { code: { startsWith: 'BDG-' } }, orderBy: { code: 'desc' }, select: { code: true } })`.
  Formato `BDG-00001` mantém-se.
- `createBadge(dto, userId)`: `badge.create` com `code` (helper), `createdById = userId`,
  `legacyDigitalBadgeId = crypto.randomUUID()` (mirror F2 — projecto usa `crypto.randomUUID()`,
  não `@paralleldrive/cuid2`), `level`/`imageUrl`/`criteria`/`skills` do dto,
  `description`/`name` do dto. `dto.courseId`/`dto.programId` ignorados. Devolve `badgeToDigitalShape(created)`.
- `findAllBadges()`: `badge.findMany({ where: { deletedAt: null, isActive: true }, orderBy: { level: 'asc' }, include: { _count: { select: { awards: true } } } })`
  → `.map(b => badgeToDigitalShape(b, { issuancesCount: b._count.awards }))`.
- `issueBadge(dto, issuerId)`: resolver `dto.badgeId` (cuid) via
  `badge.findFirst({ where: /^\d+$/.test(id) ? { OR: [{ legacyDigitalBadgeId: id }, { id: Number(id) }] } : { legacyDigitalBadgeId: id } })`.
  Guard: `badgeAward.findUnique({ where: { badgeId_userId: { badgeId: <Int>, userId: dto.userId } } })` →
  se existe e `!deletedAt` e `!isRevoked` → `ConflictException('Utilizador já possui este badge')`.
  `verifyCode = 'BADGE-' + Date.now() + '-' + crypto.randomBytes(3).hex.toUpperCase()`;
  `assertionId = crypto.randomUUID()`; `shareUrl = 'https://innova.evos.co.ao/badge/' + verifyCode`;
  `legacyBadgeIssuanceId = crypto.randomUUID()`; `issuedById = issuerId`; `evidenceUrl = dto.evidenceUrl`.
  `audit.logEntity(issuerId, 'CREATE', 'BadgeAward', String(created.id), { badgeId, userId })`.
  `createNotificationSafe(..., type: 'BADGE_EARNED', metadata: { badgeId: badge.id, verifyCode })`.
  Devolve `badgeAwardToIssuanceShape(created, { badgeLegacyId: badge.legacyDigitalBadgeId })`.
- `getMyBadges(userId)`: `badgeAward.findMany({ where: { userId, deletedAt: null, isRevoked: false }, orderBy: { awardedAt: 'desc' }, include: { badge: true } })`
  → `.map(a => badgeAwardToIssuanceShape(a, { badge: a.badge }))`.
- `getDashboard()`: as 2 linhas de badge —
  `totalBadges`: `prisma.read.badge.count({ where: { deletedAt: null, isActive: true } })`
  `badgesIssued`: `prisma.read.badgeAward.count({ where: { deletedAt: null, isRevoked: false } })`.
  Restantes linhas (cert + templates) **não se tocam** (já F2).

## 8. `dashboard-institutional.service.ts` (Task 6)

1 `count` (linha ~75): `this.prisma.read.badgeIssuance.count({ where: { deletedAt: null, isRevoked: false } })`
→ `this.prisma.read.badgeAward.count({ where: { deletedAt: null, isRevoked: false } })`.
Semântica preservada (`deletedAt`/`isRevoked` são colunas novas em `BadgeAward`).

## 9. Sem ciclo de módulos

`certification` e `dashboard-institutional` já dependem de `PrismaModule`. Nada novo a importar.
`Badge`/`BadgeAward` são escritos por ~3 módulos de gamificação (todos com `.catch()`), mas a F3
só acrescenta colunas nullable + 1 índice único e um novo escritor no mesmo módulo — sem ciclo.
