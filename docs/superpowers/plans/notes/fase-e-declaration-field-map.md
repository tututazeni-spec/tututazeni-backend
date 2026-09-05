# Fase E — Nota de mapeamento `DeclarationRequest` ↔ `Declaration` (confirmada contra o schema real)

> Trava as decisões das Tasks 3–9. O plano original (`2026-09-05-fase-e-declarations-merge.md`)
> assumiu valores de enum que **não existem**. Esta nota fixa os valores reais e as decisões
> tomadas pelo dono do produto (2026-09-06: "Full Phase E now, model faz as mapping calls").

## 1. Enums reais (`prisma/schema.prisma`)

```
DocumentRequestStatus  = DRAFT | PENDING | APPROVED | REJECTED | GENERATED | ISSUED | EXPIRED
DeclarationStatus      = DRAFT | PENDING_SIGNATURE | SIGNED | ISSUED | EXPIRED | REVOKED
TemplateLanguage       = PT | EN | FR
DeclarationLocale      = PT | EN | FR
DeclarationType        = EMPLOYMENT | TRAINING | ATTENDANCE | PERFORMANCE | BANKING | LEGAL | ACADEMIC | CUSTOM
DeclarationApproval    campos: reviewerId Int, approved Boolean, notes String?, reviewedAt DateTime
```

**Conclusão-chave:** `/declarations/documents` corre um workflow de *aprovação*
(`PENDING→APPROVED→GENERATED→ISSUED`, + `REJECTED`), enquanto `Declaration` corre um
workflow de *assinatura* (`DRAFT→PENDING_SIGNATURE→SIGNED→ISSUED`, + `REVOKED`). Os
estados **não têm correspondência 1:1**. Portanto o estado legado **não é reconstruído** a
partir de `Declaration.status` — é **persistido tal-e-qual** numa coluna nova
`Declaration.legacyStatus` (fonte de verdade para o contrato do frontend).

## 2. Colunas novas em `model Declaration` (Task 3)

| Coluna | Tipo | Uso |
|---|---|---|
| `legacyRequestId` | `Int? @unique` | id numérico que o frontend `/declarations/documents/:id` usa; NULL para `Declaration` nativas de `/work-declarations` |
| `legacyStatus` | `DocumentRequestStatus?` | estado autoritativo para o contrato legado; mantido pelo `LegacyDocumentDeclarationsService` em cada transição |
| `legacyPurposeId` | `Int?` | id de `DeclarationPurpose` (Declaration só guarda `purpose` String = nome) — permite ao adaptador devolver `purpose: { id, name }` |

Sequência sintética para `legacyRequestId` de requests **novos** criados via
`/declarations/documents`: `max(legacyRequestId) + 1` calculado no create (sem sequência
Postgres dedicada — o volume é baixo e o create já está numa transação lógica única).

## 3. Tabela de tradução de estado

### 3a. `DocumentRequestStatus` → `DeclarationStatus` (para `Declaration.status`, best-effort, NÃO autoritativo)

| legado | nativo | nota |
|---|---|---|
| DRAFT | DRAFT | |
| PENDING | PENDING_SIGNATURE | "aguarda acção" |
| APPROVED | PENDING_SIGNATURE | aprovado mas ainda não gerado/emitido |
| GENERATED | SIGNED | conteúdo finalizado, aguarda emissão |
| ISSUED | ISSUED | |
| REJECTED | REVOKED | + `rejectedReason` |
| EXPIRED | EXPIRED | |

### 3b. `DeclarationStatus` → `DocumentRequestStatus` (fallback do adaptador, só quando `legacyStatus == null`)

| nativo | legado |
|---|---|
| DRAFT | DRAFT |
| PENDING_SIGNATURE | PENDING |
| SIGNED | GENERATED |
| ISSUED | ISSUED |
| EXPIRED | EXPIRED |
| REVOKED | REJECTED |

Regra do adaptador para `status`: **`decl.legacyStatus ?? NATIVE_TO_LEGACY[decl.status]`**.

### 3c. `TemplateLanguage` ↔ `DeclarationLocale`

1:1 — `PT→PT`, `EN→EN`, `FR→FR`. Valor desconhecido → `PT`.

## 4. Mapa de campos `DeclarationRequest` → `Declaration` (backfill + writes legados)

| `DeclarationRequest` | `Declaration` | Regra |
|---|---|---|
| `id` (Int) | `legacyRequestId` | rastreio 1:1; `Declaration.id` fica cuid |
| `userId` | `employeeId` **e** `requestedById` | self-request |
| — | `assignedToId` | `approval?.reviewerId ?? null` |
| `templateId` | `templateId` | igual (`DeclarationTemplate` partilhado) |
| — | `type` (obrigatório) | `template.type` (o `createTemplate` legado põe sempre `CUSTOM`) |
| `purposeId` | `legacyPurposeId` | id preservado |
| `purpose.name` | `purpose` (String) | nome resolvido |
| `language` | `locale` | tabela 3c |
| `addressedTo` | `requestNotes` (prefixo `Destinatário: <x>`) + `employeeSnapshot.addressedTo` | preservado nos dois lados; adaptador extrai de volta |
| `observations` | `requestNotes` (parte livre) | concatenado com o prefixo acima por ` \| ` |
| `extraVariables` (Json) | `employeeSnapshot.extraVariables` | dentro do snapshot |
| `status` | `legacyStatus` (autoritativo) + `status` (tabela 3a) | |
| `generatedContent` | `renderedContent` | |
| `referenceNumber` | `code` | migrados: `LEG-<referenceNumber>`; novos via este caminho: `DEC-<ano>-<legacyRequestId 5 dígitos>` também prefixado `LEG-` para não colidir com `generateUniqueCode` (`INNOVA-...`) |
| `verificationCode` | `verificationHash` | migrados/novos: `LEG-<verificationCode>` (nullable) |
| `generatedAt`/`issuedAt`/`expiresAt` | idem | cópia directa |
| — (obrigatório) `tenantId` | `resolveDefaultTenantId(prisma)` | tenant `DEFAULT` (§7 single-tenant) |
| — (obrigatório) `employeeSnapshot` | `buildEmployeeSnapshotData(prisma, userId)` (helper puro extraído — Task 5) | |
| — (obrigatório) `title` | `generateDeclarationTitle(type, templateName, locale)` (helper puro extraído) | |
| `DeclarationApproval.approved`/`notes`/`reviewerId` | `assignedToId` + (`approved===false` ⇒ `legacyStatus=REJECTED`, `status=REVOKED`, `rejectedReason=notes`) | |

## 5. `LegacyRequestShape` — contrato de resposta de `/declarations/documents/*`

Chaves **sempre presentes** (nunca omitidas; `null` quando sem equivalente). Derivadas de
`document-declarations.service.ts` `findOne`/`findAll`/`request`/`approve`/`generate`/`issue`/`verify`/`getDashboard`.

### Objecto "request" (`findOne`, item de `findAll.data`, retorno de `request`/`approve`/`generate`/`issue`)

```
id:               number | null         // legacyRequestId
userId:           number | null         // employeeId
templateId:       number
purposeId:        number | null         // legacyPurposeId
language:         'PT' | 'EN' | 'FR'    // locale
addressedTo:      string | null         // extraído de employeeSnapshot.addressedTo
observations:     string | null         // requestNotes sem o prefixo "Destinatário:"
extraVariables:   Record<string,string> | null   // employeeSnapshot.extraVariables
status:           DocumentRequestStatus // legacyStatus ?? map(status)
generatedContent: string | null         // renderedContent
referenceNumber:  string | null         // code sem prefixo "LEG-"
verificationCode: string | null         // verificationHash sem prefixo "LEG-"
generatedAt:      Date | null
issuedAt:         Date | null
expiresAt:        Date | null
createdAt:        Date
updatedAt:        Date
template?:        { id, name, language, content, ... }   // passthrough quando incluído
purpose?:         { id: legacyPurposeId, name: purpose, category: null } | null
user?:            { id, fullName, email }                // employee
approval?:        { approved, reviewerId, notes, reviewedAt, reviewer:{id,fullName} } | null
                  // sintetizado: status REJECTED ⇒ {approved:false, notes:rejectedReason};
                  // status APPROVED/GENERATED/ISSUED & assignedToId ⇒ {approved:true};
                  // senão null
```

### `findAll` → `{ data: LegacyRequestShape[], meta: { total, page, limit, totalPages } }`

### `verify(code)` (público) → inalterado em forma:
```
válido:   { valid: true, referenceNumber, issuedAt, expiresAt, employee: fullName, document: templateName }
inválido: { valid: false, message }
```
Resolução: tenta `code` exacto e `LEG-<code>` em `Declaration.verificationHash`; expiração
por `expiresAt`.

### `getDashboard` → inalterado em forma:
```
{ pending, generated, issued, total, topTemplates: [{ templateId, _count }] }
```
`pending`  = count `legacyStatus = PENDING`
`generated`= count `legacyStatus = GENERATED`
`issued`   = count `legacyStatus = ISSUED`
`total`    = count `legacyRequestId != null`
`topTemplates` = groupBy `templateId` sobre `Declaration` com `legacyRequestId != null`

### `previewTemplate` / templates CRUD / purposes CRUD → inalterados
Templates: delegam em `WorkDeclarationService.createTemplate/updateTemplate/getTemplates/getTemplate`
(mesmo modelo `DeclarationTemplate`), com o `previewTemplate` a manter o resolver de variáveis
legado (nomes `employee_name`, `employee_position`, ...).
Purposes: `DeclarationPurposeService` novo (~30 linhas, `DeclarationPurpose` CRUD, portado verbatim).

## 6. Decisão de arquitectura (Task 6)

O workflow legado (variáveis `{{employee_name}}` etc., passos approve→generate→issue) é
**portado** de `document-declarations.service.ts` para um serviço novo
`src/work-declaration/legacy-document-declarations.service.ts`
(`LegacyDocumentDeclarationsService`), **retargetado de `DeclarationRequest` para `Declaration`**
(com `legacyRequestId`/`legacyStatus`/`legacyPurposeId`). Exportado por `WorkDeclarationModule`.
Reutiliza os helpers puros extraídos de `WorkDeclarationService`
(`buildEmployeeSnapshotData`, `generateDeclarationTitle`) e o `resolveDefaultTenantId`.

- `DocumentDeclarationsController` injecta `LegacyDocumentDeclarationsService` +
  `DeclarationPurposeService`; devolve tudo via `declarationToLegacyRequestShape`.
- `DocumentDeclarationsService` (em `src/declarations/`) — **eliminado** + specs.
- `DeclarationRequest`/`DeclarationApproval`/`DeclarationPurpose` **ficam no schema**
  (remoção física é follow-up pós-observação). `DeclarationRequest`/`DeclarationApproval`
  deixam de ser escritos.
- `/declarations/work` (`WorkDeclarationsService` **plural**, forms de compliance) — **intocado**.

## 7. Módulos / ciclos

`declarations` → `work-declaration` (já registados nesta ordem em `app.module.ts`).
`work-declaration` importa `PdfModule`, `UsersModule`, `NotificationsModule`, `PrismaModule` —
não importa `declarations`. Sem ciclo.
