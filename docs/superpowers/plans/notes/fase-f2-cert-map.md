# Fase F2 — Nota de mapeamento `IssuedCertificate` ↔ `Certificate` (confirmada contra o schema real)

> Trava as decisões das Tasks 2–9. Enums e campos confirmados em `prisma/schema.prisma`.

## 1. Modelos e enums reais

```
Certificate (schema:1991)       id Int; type CertificateType; userId Int?; enrollmentId Int? @unique;
                                courseId Int?; programId Int?; developmentPlanId Int?; eventId Int?;
                                issuedAt DateTime @default(now()); code String? @unique;
                                validationCode String @unique; fileUrl String? @db.Text;
                                expiresAt DateTime?; revoked Boolean @default(false)
                                (SEM createdAt/updatedAt; SEM relação issuedBy/template)

IssuedCertificate (schema:7469) id String @id @default(cuid()); code @unique; verificationCode @unique;
                                hashCode String (NOT NULL); userId Int; templateId String?;
                                courseId String?; programId String?; title String; recipientName String;
                                issuerName String @default("INNOVA"); type CertificateTemplateType;
                                score Float?; pdfUrl/publicUrl/linkedInUrl String?; isRevoked Boolean;
                                revokedAt DateTime?; revokeReason String?; revokedById Int?;
                                issuedAt DateTime; expiresAt DateTime?; downloadCount/verifyCount Int;
                                metadata String?; issuedById Int (NOT NULL); createdAt/updatedAt;
                                deletedAt DateTime?

CertificateType         = COURSE | TRAINING | LEADERSHIP | DEVELOPMENT
CertificateTemplateType = COURSE | PROGRAM | COMPETENCY | ATTENDANCE | PARTICIPATION | ACHIEVEMENT
```

**Escritores/leitores de `IssuedCertificate`:** só `certification.service.ts` (escreve+lê) e `dashboard-institutional.service.ts` (2 `count`). Premissa do plano confirmada.

## 2. Colunas novas em `model Certificate` (Task 2)

Todas nullable/defaulted → escritores existentes de `Certificate` (course-completion, courses, events, ...) não são afectados.

| Coluna | Tipo |
|---|---|
| `hashCode` | `String?` |
| `title` | `String?` |
| `recipientName` | `String?` |
| `issuerName` | `String? @default("INNOVA")` |
| `score` | `Float?` |
| `pdfUrl` | `String?` |
| `publicUrl` | `String?` |
| `linkedInUrl` | `String?` |
| `revokedAt` | `DateTime?` |
| `revokeReason` | `String?` |
| `revokedById` | `Int?` |
| `downloadCount` | `Int @default(0)` |
| `verifyCount` | `Int @default(0)` |
| `issuedById` | `Int?` |
| `templateId` | `String?` (id de `CertificateTemplate`; SEM relação — lookup manual onde a forma histórica incluía `template`) |
| `metadata` | `String?` |
| `deletedAt` | `DateTime?` |
| `legacyType` | `CertificateTemplateType?` — **estado autoritativo do `type` no contrato legado** (ver §3) |
| `legacyIssuedCertId` | `String? @unique` — rastreio 1:1 |

Decisão sobre `fileUrl` vs `pdfUrl`: manter `fileUrl` (já existe, usado pelos escritores nativos) **e** adicionar `pdfUrl`. O adaptador devolve `pdfUrl ?? fileUrl` onde a forma histórica pedia o PDF (`downloadCertificate`).

## 3. Tradução de `type` — `legacyType` é a fonte de verdade

`CertificateTemplateType` → `CertificateType` (para `Certificate.type`, best-effort; lossy — 3 valores colapsam em TRAINING):

| legado (`CertificateTemplateType`) | canónico (`CertificateType`) |
|---|---|
| COURSE | COURSE |
| PROGRAM | LEADERSHIP |
| COMPETENCY | DEVELOPMENT |
| ATTENDANCE | TRAINING |
| PARTICIPATION | TRAINING |
| ACHIEVEMENT | TRAINING |

**Como é lossy**, o valor legado original é **persistido tal-e-qual** em `Certificate.legacyType`. O adaptador (`certificateToIssuedShape`) devolve **`cert.legacyType ?? INVERSE[cert.type]`**, com o inverso só usado para `Certificate` nativos (sem `legacyType`):

| canónico | inverso (fallback) |
|---|---|
| COURSE | COURSE |
| LEADERSHIP | PROGRAM |
| DEVELOPMENT | COMPETENCY |
| TRAINING | PARTICIPATION |

> A tabela forward está marcada **"confirmar com o dono do produto no PR"** — se preferir outra agregação, muda-se só o forward map; o `legacyType` garante que os dados existentes não perdem informação.

`byType` do dashboard (`groupBy(['type'])`) passa a agrupar por **`legacyType`** para manter a granularidade histórica de 6 valores.

## 4. Mapa de campos `IssuedCertificate` → `Certificate` (backfill + issueCertificate)

| `IssuedCertificate` | `Certificate` | Regra |
|---|---|---|
| `id` (cuid) | `legacyIssuedCertId` | rastreio; `Certificate.id` fica Int |
| `code` | `code` | directo (ambos `CERT-xxxxx`; colisão com nativo → prefixar `LEG-`) |
| `verificationCode` | `validationCode` | directo (colisão → `LEG-`) |
| `hashCode` | `hashCode` | |
| `userId` | `userId` | |
| `templateId` (String?) | `templateId` (String?) | directo |
| `courseId` (String?) | `courseId` (Int?) | `Number()`; `!Number.isInteger` ou não existe → `null` + `console.warn` |
| `programId` (String?) | `programId` (Int?) | idem |
| `title`/`recipientName`/`issuerName`/`score`/`pdfUrl`/`publicUrl`/`linkedInUrl`/`metadata` | homónimos (novos) | directo |
| `type` (`CertificateTemplateType`) | `type` (traduzido) + `legacyType` (verbatim) | §3 |
| `isRevoked` | `revoked` | |
| `revokedAt`/`revokeReason`/`revokedById` | homónimos (novos) | directo |
| `issuedAt`/`expiresAt` | homónimos | directo |
| `issuedById` (NOT NULL) | `issuedById` (Int?, novo) | directo |
| `downloadCount`/`verifyCount` | homónimos (novos) | directo |
| `deletedAt` | `deletedAt` (novo) | directo |
| `createdAt`/`updatedAt` | — | `Certificate` não tem; adaptador devolve `createdAt = issuedAt`, `updatedAt = issuedAt` |

Backfill: `code`/`validationCode` — verificar colisão com um `Certificate` nativo (`findUnique`); se colidir, prefixar `LEG-` (o adaptador remove o prefixo à saída).

## 5. `IssuedShape` — contrato de resposta de `/certification/*`

Chaves **sempre presentes**; `null` quando sem origem. Derivado dos retornos reais de
`issueCertificate`/`findAllCertificates`/`findCertificateById`/`verify`/`revokeCertificate`/`downloadCertificate`/`getMyCertificates`/`getDashboard`.

### objecto "certificate" (issue / findById / item de findAll.data / my-certificates.data)

```
id:              string            // legacyIssuedCertId ?? String(cert.id)
code:            string | null     // sem prefixo LEG-
verificationCode:string            // validationCode sem prefixo LEG-
hashCode:        string | null
userId:          number
templateId:      string | null
courseId:        string | null     // String(cert.courseId) ou null
programId:       string | null
title:           string | null
recipientName:   string | null
issuerName:      string            // default "INNOVA"
type:            CertificateTemplateType   // legacyType ?? INVERSE[type]
score:           number | null
pdfUrl:          string | null     // pdfUrl ?? fileUrl
publicUrl:       string | null
linkedInUrl:     string | null
isRevoked:       boolean           // revoked
revokedAt:       Date | null
revokeReason:    string | null
revokedById:     number | null
issuedAt:        Date
expiresAt:       Date | null
downloadCount:   number
verifyCount:     number
metadata:        string | null
issuedById:      number | null
deletedAt:       Date | null
createdAt:       Date              // = issuedAt
updatedAt:       Date              // = issuedAt
user?:           { fullName, email? }        // passthrough quando incluído (relação user)
issuedBy?:       { fullName } | null         // lookup manual por issuedById
template?:       { name, html } | null       // lookup manual por templateId
```

### `findAllCertificates` → `{ data: IssuedShape[], total, page, limit, totalPages }` (spread de meta, NÃO aninhado)
### `getMyCertificates` → idem
### `verify(code)` → inalterado em forma:
```
válido:   { valid: true, certificate: { code, holder, title, type, score, issuer, issuedAt, expiresAt, verificationCode, hashCode } }
revogado: { valid: false, reason: 'Certificado revogado', revokedAt, revokeReason }
expirado: { valid: false, reason: 'Certificado expirado', expiresAt }
inválido: { valid: false, reason: 'Código de verificação inválido' }
```
`type`/`holder` na forma de `verify` = `legacyType ?? INVERSE[type]` / `recipientName`.
### `revokeCertificate` → `IssuedShape` (com `isRevoked: true`)
### `downloadCertificate` → `{ pdfUrl: pdfUrl ?? fileUrl, publicUrl, title }` (inalterado)
### `getDashboard` → inalterado em forma:
```
{ totals: { totalCerts, issuedThisMonth, revoked, expired, valid, totalBadges, badgesIssued, totalTemplates, totalVerifications },
  byType: [{ type: <CertificateTemplateType>, _count: { id } }],   // groupBy legacyType
  recentCertificates: IssuedShape[] (take 5, com user.fullName) }
```
Contagens de certificado passam a `Certificate` com `where: { legacyIssuedCertId: { not: null }, deletedAt: null }` (preserva a semântica "certificados do módulo certification", exclui os nativos de course-completion). Contagens de **badge** (`digitalBadge`/`badgeIssuance`) e `certificateTemplate` **não se tocam** (F3 / catálogo).

## 6. `certification.service.ts` — pontos de atenção

- `generateCertCode()` lê o último `code` — passa a `certificate.findFirst({ where: { code: { startsWith: 'CERT-' } }, orderBy: { code: 'desc' } })`.
- `issueCertificate` novo: `certificate.create` com `legacyIssuedCertId = createId()` (cuid sintético — usar `@paralleldrive/cuid2` se disponível, senão `crypto.randomUUID()` prefixado; **confirmar** qual gerador o projecto usa). `type` traduzido + `legacyType` verbatim. `courseId`/`programId` string→Int (guard).
- `findCertificateById`/`findAllCertificates`/`getDashboard.recentCerts`: `Certificate` não tem relações `issuedBy`/`template` → resolver por lookup (batch para listas) e injectar no adaptador.
- Métodos de **badge** (`createBadge`/`findAllBadges`/`issueBadge`/`getMyBadges`) e `createTemplate`/`findAllTemplates` — **NÃO TOCAR** (badges = F3; templates = catálogo).
- `getDashboard` mistura certs + badges no mesmo retorno — mudar só as linhas de cert, deixar as de badge.

## 7. `dashboard-institutional.service.ts`

2 `count` (linhas ~69 e ~162): `issuedCertificate` → `certificate`, `where` += `legacyIssuedCertId: { not: null }` (preserva semântica), `isRevoked` → `revoked`, `deletedAt: null` mantém-se (coluna nova).

## 8. Sem ciclo de módulos

`certification` e `dashboard-institutional` já dependem de `PrismaModule`. Nada novo a importar. `Certificate` é escrito por vários módulos mas F2 só acrescenta colunas (nullable) e um novo escritor no mesmo módulo — sem ciclo.
