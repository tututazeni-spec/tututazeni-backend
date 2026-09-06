# Fase E — Fundir `declarations` + `work-declaration` (E-full) — Plano de Implementação

> **Para agentes de execução:** SUB-SKILL OBRIGATÓRIA: usar `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans` para executar este plano tarefa a tarefa. Os passos usam checkbox (`- [ ]`) para acompanhamento.

**Goal:** Existe **uma única implementação** de "emitir documento/certidão de colaborador": o modelo `Declaration` (rico) e o `WorkDeclarationService`. O modelo antigo `DeclarationRequest` deixa de ser escrito; as rotas `/declarations/documents/*` passam a ser servidas pelo serviço canónico com adaptador de forma. O helper `getDefaultTenantId()`/`resolveTenantId()` — hoje copiado literalmente em **5 ficheiros** — passa a existir uma só vez.

**Architecture:** `WorkDeclarationService` (`src/work-declaration/`, 948 linhas, modelo `Declaration` + PDF/DOCX/assinatura/branding/templates) é o canónico. `DocumentDeclarationsController` (`/declarations/documents`) passa a injectar `WorkDeclarationService` e delegar, com um adaptador `declarationToLegacyRequestShape()` que devolve a forma que o frontend já consome. `DocumentDeclarationsService` é eliminado. Os dados existentes de `DeclarationRequest` são migrados para `Declaration` por um script idempotente com uma coluna de rastreio `Declaration.legacyRequestId`. `DeclarationRequest`/`DeclarationApproval`/`DeclarationPurpose` **ficam no schema** (não se apagam nesta fase — remoção do modelo é um follow-up depois de um período de observação), mas deixam de ser escritos. `/declarations/work` (forms periódicos de compliance, `WorkDeclarationsService` **plural**) **não é tocado** — é uma feature distinta apesar do nome. O helper de tenant vai para `src/common/helpers/tenant.helper.ts`.

**Tech Stack:** NestJS, Prisma (migração SQL manual — ver nota sobre `migrate dev` inutilizável no dev DB, memória "innova computed-then-discarded"), Jest (unit + integração com Postgres real), `class-validator`.

**Spec:** `docs/arquitetura-modular-analise.md` (§2.3 item 13, §2.5, §3–4 domínio 5, §5, §7, §13 fase E) e `docs/arquitetura-modular.md` (Fases 3–6). **Decisão do dono do produto (2026-09-05):** E-full — fundir os modelos.

## Global Constraints

- **Forma de resposta do frontend preservada** (`docs/arquitetura-modular.md` §12). As rotas `/declarations/documents/*` continuam a devolver a forma histórica (id numérico, `referenceNumber`, `verificationCode`, `status` de `DocumentRequestStatus`, `generatedContent`, ...) — obtida por um adaptador que traduz `Declaration` → forma legada. Se algum campo legado não tiver equivalente exacto em `Declaration`, o adaptador devolve `null` para esse campo (nunca omite a chave).
- **Rotas preservadas (todas):** `/declarations/documents/*` (dashboard, purposes CRUD, templates CRUD, `GET`/`GET my`/`GET :id`, `POST`, `PATCH :id/approve`, `PATCH :id/generate`, `PATCH :id/issue`, `GET verify/:code` público); `/work-declarations/*` (canónico, sem alteração); `/declarations/work/*` (**intocado**).
- **`Declaration.id` é `String` (cuid); `DeclarationRequest.id` é `Int`.** As rotas `/declarations/documents/:id` recebem hoje um `Int`. Após a migração, cada `Declaration` migrada guarda `legacyRequestId Int? @unique`; o handler de `/declarations/documents/:id` resolve `Int` → `Declaration` via `legacyRequestId`. Requests **novos** criados por `/declarations/documents` recebem um `legacyRequestId` sintético (sequência dedicada) para manterem um id numérico estável no contrato. (Alternativa se o revisor preferir: aceitar o cuid na rota — decisão a tomar na Task 1.)
- **Migração de dados idempotente:** o script de backfill pode correr N vezes sem duplicar (`upsert` por `legacyRequestId`). Corre em `test/integration/setup.ts`? **Não** — corre uma vez em produção/staging como passo de deploy e é testado por um spec de integração dedicado que semeia `DeclarationRequest` e verifica o resultado.
- **Enum mapping `DocumentRequestStatus` → `DeclarationStatus`:** confirmar os valores exactos de ambos em `prisma/schema.prisma` na Task 1 e fixar a tabela de tradução ali. Valor sem correspondência → `DRAFT` + `internalNotes` a registar o valor original.
- **Single-tenant** (§7): `Declaration.tenantId` obrigatório → todas as `Declaration` (migradas e novas por este caminho) usam o tenant `DEFAULT` (`getDefaultTenantId()` do helper novo).
- **`getDefaultTenantId` está em 5 ficheiros:** `declarations/document-declarations.service.ts:507`, `work-declaration/work-declaration.service.ts:78` (`resolveTenantId`), `api-integration/api-integration.service.ts:180`, `automation/automation.service.ts:228`, `notifications/notifications.service.ts:438`. Os 5 passam a usar `resolveDefaultTenantId(prisma)` do helper. (Os de `api-integration`/`automation`/`notifications` são dedup de baixo risco incluído aqui porque é o mesmo código exacto.)
- `prettier`/`eslint`/`tsc` limpos antes de cada commit. `format:check` do CI corre só `src/**`. **Não** correr prettier em `prisma/**`.
- Integração: lotes contra `postgresql://postgres:postgres@127.0.0.1:5432/innova_test`, `--runInBand`, Redis local, `DB_POOL_MAX=5`. `declarations` e `work-declaration` são lotes distintos.

---

## File Structure

**Novos:**
- `src/common/helpers/tenant.helper.ts` — `resolveDefaultTenantId(prisma: PrismaService, tenantId?: string): Promise<string>`.
- `src/common/helpers/tenant.helper.spec.ts`.
- `prisma/migrations/<ts>_add_declaration_legacy_request_id/migration.sql` — `ALTER TABLE declarations ADD COLUMN "legacyRequestId" INTEGER; CREATE UNIQUE INDEX ... ON declarations("legacyRequestId");`
- `prisma/backfill-declaration-requests.ts` — script de migração de dados idempotente.
- `src/work-declaration/declaration-legacy-adapter.ts` — `declarationToLegacyRequestShape(decl): LegacyRequestShape`.
- `test/integration/declarations/declaration-backfill.integration-spec.ts` — testa o backfill.

**Modificados:**
- `prisma/schema.prisma` — `Declaration` += `legacyRequestId Int? @unique`. (Migração SQL manual — ver Task 3.)
- `src/work-declaration/work-declaration.service.ts` — `resolveTenantId` delega no helper; novos métodos "legacy-facing" se necessário (`requestFromLegacy`, ...).
- `src/declarations/declarations.controller.ts` — `DocumentDeclarationsController` injecta `WorkDeclarationService` + adaptador; delega. `WorkDeclarationsController` (`/declarations/work`) **inalterado**.
- `src/declarations/declarations.module.ts` — `imports: [..., WorkDeclarationModule]`; remove `DocumentDeclarationsService` de `providers`/`exports`.
- `src/declarations/document-declarations.service.ts` — **eliminado** (após migração de toda a lógica útil).
- `src/declarations/document-declarations.service.spec.ts`, `*.additional.spec.ts` — **eliminados**.
- `src/declarations/declarations.controller.spec.ts` — adaptar `DocumentDeclarationsController`.
- `src/api-integration/api-integration.service.ts`, `src/automation/automation.service.ts`, `src/notifications/notifications.service.ts` — `getDefaultTenantId` privado → chamada ao helper.
- `docs/arquitetura-modular-analise.md` — §2.3 item 13, §5, §13 fase E.

---

### Task 1: Nota de mapeamento — campos `DeclarationRequest` ↔ `Declaration`, enums, e forma legada de resposta

**Files:**
- Create: `docs/superpowers/plans/notes/fase-e-declaration-field-map.md`

**Interfaces:** nenhuma — trava as decisões das tarefas seguintes.

- [ ] **Step 1: Ler os dois modelos + os dois enums de estado**

`prisma/schema.prisma`: `model Declaration` (~6360), `model DeclarationRequest` (~6583), `model DeclarationApproval`, `model DeclarationPurpose`, `enum DeclarationStatus`, `enum DocumentRequestStatus`, `enum DeclarationLocale`, `enum TemplateLanguage`, `enum DeclarationType`.

- [ ] **Step 2: Preencher a tabela de mapeamento de campos**

| `DeclarationRequest` | `Declaration` | Regra |
|---|---|---|
| `id` (Int) | `legacyRequestId` (Int, novo) | rastreio 1:1; `Declaration.id` fica cuid |
| `userId` | `employeeId` **e** `requestedById` | mesmo utilizador (self-request) |
| `templateId` | `templateId` | igual (`DeclarationTemplate` partilhado) |
| `purposeId` → `DeclarationPurpose.name` | `purpose` (String) | resolver nome; `type` = heurística ou `OTHER` |
| `language` (`TemplateLanguage`) | `locale` (`DeclarationLocale`) | tabela de tradução (Step 3) |
| `addressedTo` | `purpose` (concat) ou `requestNotes` | decidir; preferir `requestNotes` prefixado |
| `observations` | `requestNotes` | |
| `extraVariables` (Json) | `employeeSnapshot` (merge) | chave `extraVariables` dentro do snapshot |
| `status` (`DocumentRequestStatus`) | `status` (`DeclarationStatus`) | tabela de tradução (Step 3) |
| `generatedContent` | `renderedContent` | |
| `referenceNumber` | `code` | prefixar migrados: `LEG-<referenceNumber>` (evita colisão com `generateUniqueCode`) |
| `verificationCode` | `verificationHash` | prefixar migrados: `LEG-<verificationCode>` |
| `generatedAt`/`issuedAt`/`expiresAt` | idem | cópia directa |
| — (obrigatório) `tenantId` | `resolveDefaultTenantId()` | |
| — (obrigatório) `employeeSnapshot` | `buildEmployeeSnapshot(userId)` no momento do backfill | reutilizar o helper privado do `WorkDeclarationService` (expor como `public` ou duplicar mínimo no script) |
| — (obrigatório) `title` | `generateTitle(type, templateName, locale)` | reutilizar helper |
| `DeclarationApproval.reviewerId`/`decision`/`comments` | `assignedToId` + `status` + `rejectedReason`/`internalNotes` | se `decision = REJECTED` → `status = REJECTED`, `rejectedReason = comments` |

- [ ] **Step 3: Fixar as 2 tabelas de tradução de enum** (valores reais, confirmados no schema)

```
DocumentRequestStatus → DeclarationStatus
  PENDING        → PENDING_APPROVAL   (confirmar nome exacto no enum DeclarationStatus)
  APPROVED       → APPROVED
  GENERATED      → GENERATED / READY  (confirmar)
  ISSUED         → ISSUED
  REJECTED       → REJECTED
  <outro>        → DRAFT  + internalNotes "migrado de status <X>"

TemplateLanguage → DeclarationLocale
  PT → PT ; EN → EN ; <outro> → PT
```

- [ ] **Step 4: Definir a `LegacyRequestShape`** (o objecto que `/declarations/documents/:id` etc. devem devolver)

Ler `document-declarations.service.ts` `findOne`/`findAll`/`request`/`verify`/`getDashboard` e registar os campos exactos de cada resposta. Isto é o contrato do adaptador (Task 5).

- [ ] **Step 5: Commit da nota**

```bash
git add docs/superpowers/plans/notes/fase-e-declaration-field-map.md
git commit -m "docs(fase-e): mapa de campos/enums DeclarationRequest↔Declaration + forma legada de resposta"
```

---

### Task 2: Helper `resolveDefaultTenantId` — uma só implementação para os 5 call sites

**Files:**
- Create: `src/common/helpers/tenant.helper.ts`
- Create: `src/common/helpers/tenant.helper.spec.ts`

**Interfaces:**
- Produces: `resolveDefaultTenantId(prisma: PrismaService, tenantId?: string): Promise<string>` — se `tenantId` vier, devolve-o; senão devolve o `id` do primeiro `TenantConfig`, criando `{ tenantCode: 'DEFAULT', tenantName: 'Default Tenant' }` se não existir nenhum.

- [ ] **Step 1: Teste (deve falhar)**

```ts
import { resolveDefaultTenantId } from './tenant.helper';

describe('resolveDefaultTenantId', () => {
  const mkPrisma = (over: any) => ({ tenantConfig: { findFirst: jest.fn(), create: jest.fn() }, ...over });

  it('devolve o tenantId explícito quando fornecido', async () => {
    const prisma: any = mkPrisma({});
    expect(await resolveDefaultTenantId(prisma, 'abc')).toBe('abc');
    expect(prisma.tenantConfig.findFirst).not.toHaveBeenCalled();
  });

  it('devolve o id do TenantConfig existente', async () => {
    const prisma: any = mkPrisma({});
    prisma.tenantConfig.findFirst.mockResolvedValue({ id: 't1' });
    expect(await resolveDefaultTenantId(prisma)).toBe('t1');
  });

  it('cria o tenant DEFAULT quando não existe nenhum', async () => {
    const prisma: any = mkPrisma({});
    prisma.tenantConfig.findFirst.mockResolvedValue(null);
    prisma.tenantConfig.create.mockResolvedValue({ id: 'tNew' });
    expect(await resolveDefaultTenantId(prisma)).toBe('tNew');
    expect(prisma.tenantConfig.create).toHaveBeenCalledWith({
      data: { tenantCode: 'DEFAULT', tenantName: 'Default Tenant' },
    });
  });
});
```

- [ ] **Step 2: FAIL**

```bash
npx jest src/common/helpers/tenant.helper.spec.ts
```

- [ ] **Step 3: Implementar**

```ts
import { PrismaService } from '../../prisma/prisma.service';

export async function resolveDefaultTenantId(
  prisma: PrismaService,
  tenantId?: string,
): Promise<string> {
  if (tenantId) return tenantId;
  const existing = await prisma.tenantConfig.findFirst();
  if (existing) return existing.id;
  const created = await prisma.tenantConfig.create({
    data: { tenantCode: 'DEFAULT', tenantName: 'Default Tenant' },
  });
  return created.id;
}
```

- [ ] **Step 4: PASS + tsc**

```bash
npx jest src/common/helpers/tenant.helper.spec.ts
npx tsc --noEmit
```

- [ ] **Step 5: Substituir os 5 call sites**

Em cada um dos 5 ficheiros, remover o método privado `getDefaultTenantId`/`resolveTenantId` e substituir as chamadas por `resolveDefaultTenantId(this.prisma, tenantId?)`. Correr os specs de cada módulo tocado:

```bash
npx jest src/api-integration src/automation src/notifications src/work-declaration
```

(o de `declarations/document-declarations` será eliminado na Task 6 — nesse ficheiro, por agora, trocar a chamada na mesma para manter o ficheiro compilável até lá.)

- [ ] **Step 6: prettier + tsc**

```bash
npx prettier --write src/common/helpers/ src/api-integration/ src/automation/ src/notifications/ src/work-declaration/ src/declarations/
npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add src/common/helpers/tenant.helper.ts src/common/helpers/tenant.helper.spec.ts src/api-integration/ src/automation/ src/notifications/ src/work-declaration/ src/declarations/
git commit -m "refactor(common): resolveDefaultTenantId helper único — elimina 5 cópias de getDefaultTenantId"
```

---

### Task 3: Migração de schema — `Declaration.legacyRequestId`

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_declaration_legacy_request_id/migration.sql`

- [ ] **Step 1: Editar o schema**

Em `model Declaration`, adicionar:

```prisma
  legacyRequestId Int? @unique
```

- [ ] **Step 2: Criar a migração SQL manualmente**

O dev DB local tem drift que impede `prisma migrate dev` (memória "innova computed-then-discarded"). Criar a pasta e o ficheiro:

```sql
-- prisma/migrations/<timestamp>_add_declaration_legacy_request_id/migration.sql
ALTER TABLE "declarations" ADD COLUMN "legacyRequestId" INTEGER;
CREATE UNIQUE INDEX "declarations_legacyRequestId_key" ON "declarations"("legacyRequestId");
```

- [ ] **Step 3: Aplicar**

```bash
npx prisma migrate deploy
npx prisma generate
```

- [ ] **Step 4: `tsc` (confirma que o Prisma Client regenerado tipa `legacyRequestId`)**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(db): Declaration.legacyRequestId para rastrear a migração de DeclarationRequest"
```

---

### Task 4: Script de backfill idempotente `DeclarationRequest` → `Declaration`

**Files:**
- Create: `prisma/backfill-declaration-requests.ts`
- Create: `test/integration/declarations/declaration-backfill.integration-spec.ts`

**Interfaces:**
- Produces: `backfillDeclarationRequests(prisma): Promise<{ created: number; updated: number; skipped: number }>` — para cada `DeclarationRequest`, `upsert` de uma `Declaration` com `where: { legacyRequestId: req.id }`, aplicando o mapa da Task 1. Idempotente.

- [ ] **Step 1: Escrever o teste de integração (deve falhar)**

```ts
// test/integration/declarations/declaration-backfill.integration-spec.ts
describe('backfill DeclarationRequest → Declaration', () => {
  it('migra uma request pendente para uma Declaration com legacyRequestId e campos mapeados', async () => {
    const tmpl = await prisma.declarationTemplate.create({ data: { /* mínimo válido */ } as any });
    const req = await prisma.declarationRequest.create({
      data: {
        userId: seededUserId, templateId: tmpl.id, language: 'PT',
        status: 'PENDING', referenceNumber: 'REF-E2E-1', verificationCode: 'VER-E2E-1',
      },
    });

    const r1 = await backfillDeclarationRequests(prisma);
    expect(r1.created).toBeGreaterThanOrEqual(1);

    const decl = await prisma.declaration.findUnique({ where: { legacyRequestId: req.id } });
    expect(decl).not.toBeNull();
    expect(decl!.employeeId).toBe(seededUserId);
    expect(decl!.requestedById).toBe(seededUserId);
    expect(decl!.code).toBe('LEG-REF-E2E-1');
    expect(decl!.status).toBe('PENDING_APPROVAL'); // conforme tabela de tradução da Task 1

    // idempotência
    const r2 = await backfillDeclarationRequests(prisma);
    expect(r2.created).toBe(0);
    expect(await prisma.declaration.count({ where: { legacyRequestId: req.id } })).toBe(1);

    // cleanup
    await prisma.declaration.deleteMany({ where: { legacyRequestId: req.id } });
    await prisma.declarationRequest.delete({ where: { id: req.id } });
    await prisma.declarationTemplate.delete({ where: { id: tmpl.id } });
  });
});
```

- [ ] **Step 2: FAIL** (ficheiro/função não existem)

- [ ] **Step 3: Implementar o script**

```ts
// prisma/backfill-declaration-requests.ts
import { PrismaClient } from '@prisma/client';

const STATUS_MAP: Record<string, string> = {
  PENDING: 'PENDING_APPROVAL',
  APPROVED: 'APPROVED',
  GENERATED: 'GENERATED',
  ISSUED: 'ISSUED',
  REJECTED: 'REJECTED',
};
const LOCALE_MAP: Record<string, string> = { PT: 'PT', EN: 'EN' };

export async function backfillDeclarationRequests(prisma: PrismaClient) {
  const result = { created: 0, updated: 0, skipped: 0 };

  const tenant =
    (await prisma.tenantConfig.findFirst()) ??
    (await prisma.tenantConfig.create({ data: { tenantCode: 'DEFAULT', tenantName: 'Default Tenant' } }));

  const requests = await prisma.declarationRequest.findMany({
    include: { template: true, purpose: true, approval: true },
  });

  for (const req of requests) {
    const status = STATUS_MAP[req.status] ?? 'DRAFT';
    const locale = LOCALE_MAP[req.language] ?? 'PT';
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { fullName: true, email: true, position: { select: { name: true } }, department: { select: { name: true } }, hireDate: true },
    });
    const snapshot = {
      fullName: user?.fullName ?? null,
      email: user?.email ?? null,
      position: user?.position?.name ?? null,
      department: user?.department?.name ?? null,
      hireDate: user?.hireDate ?? null,
      extraVariables: req.extraVariables ?? null,
      addressedTo: req.addressedTo ?? null,
    };

    const data = {
      tenantId: tenant.id,
      templateId: req.templateId,
      requestedById: req.userId,
      employeeId: req.userId,
      assignedToId: req.approval?.reviewerId ?? null,
      type: 'OTHER' as any, // ver Task 1 Step 2 — heurística se DeclarationType tiver algo melhor
      status: status as any,
      locale: locale as any,
      renderedContent: req.generatedContent ?? null,
      title: `${req.template?.name ?? 'Declaração'}`,
      purpose: req.purpose?.name ?? null,
      requestNotes: [req.observations, req.addressedTo ? `Destinatário: ${req.addressedTo}` : null].filter(Boolean).join(' | ') || null,
      internalNotes: STATUS_MAP[req.status] ? null : `migrado de status ${req.status}`,
      rejectedReason: req.approval?.decision === 'REJECTED' ? req.approval?.comments ?? null : null,
      code: `LEG-${req.referenceNumber ?? req.id}`,
      verificationHash: req.verificationCode ? `LEG-${req.verificationCode}` : null,
      employeeSnapshot: snapshot as any,
      generatedAt: req.generatedAt ?? null,
      issuedAt: req.issuedAt ?? null,
      expiresAt: req.expiresAt ?? null,
      legacyRequestId: req.id,
    };

    const existing = await prisma.declaration.findUnique({ where: { legacyRequestId: req.id } });
    if (existing) {
      result.skipped++;
      continue;
    }
    await prisma.declaration.create({ data });
    result.created++;
  }

  return result;
}

if (require.main === module) {
  const prisma = new PrismaClient();
  backfillDeclarationRequests(prisma)
    .then(r => console.log('backfill:', r))
    .catch(e => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
}
```

> Ajustar `type`/`title`/`snapshot` aos campos reais confirmados na Task 1. Se `WorkDeclarationService` expuser `buildEmployeeSnapshot`/`generateTitle` publicamente, preferir reutilizá-los (Task 5 Step 0).

- [ ] **Step 4: PASS**

```bash
npx cross-env NODE_ENV=test jest --config test/jest-integration.json --forceExit --runInBand --testPathPatterns "test/integration/(declarations)/" -t "backfill"
```

- [ ] **Step 5: prettier (só o ficheiro `.ts` em `prisma/` — este é código, não schema; prettier não é corrido em `prisma/` pelo CI mas manter consistente à mão) + tsc**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add prisma/backfill-declaration-requests.ts test/integration/declarations/declaration-backfill.integration-spec.ts
git commit -m "feat(db): script idempotente de backfill DeclarationRequest → Declaration"
```

---

### Task 5: Adaptador `Declaration` → forma legada + métodos "legacy-facing" no `WorkDeclarationService`

**Files:**
- Create: `src/work-declaration/declaration-legacy-adapter.ts`
- Create: `src/work-declaration/declaration-legacy-adapter.spec.ts`
- Modify: `src/work-declaration/work-declaration.service.ts` (expor helpers usados pelo backfill; adicionar wrappers se preciso)

**Interfaces:**
- Produces: `declarationToLegacyRequestShape(decl: Declaration & {...includes}): LegacyRequestShape` — traduz uma `Declaration` para o objecto que `/declarations/documents/*` devolvia (id = `legacyRequestId`, `referenceNumber` = `code` sem prefixo `LEG-`, `verificationCode` = `verificationHash` sem prefixo, `status` = `DeclarationStatus` → `DocumentRequestStatus` inverso, `generatedContent` = `renderedContent`, etc.). Campos legados sem equivalente → `null`, chave sempre presente.

- [ ] **Step 0: Expor os helpers do serviço usados pelo backfill**

Em `work-declaration.service.ts`, mudar `private async buildEmployeeSnapshot` e `private generateTitle` para `public` (ou extrair para `src/work-declaration/declaration-render.helpers.ts`). Actualizar o script da Task 4 para os usar. Teste: os specs existentes de `WorkDeclarationService` continuam a passar.

- [ ] **Step 1: Teste do adaptador (deve falhar)**

```ts
import { declarationToLegacyRequestShape } from './declaration-legacy-adapter';

describe('declarationToLegacyRequestShape', () => {
  const base = {
    id: 'clx123', legacyRequestId: 42, templateId: 7, employeeId: 10, requestedById: 10,
    status: 'PENDING_APPROVAL', locale: 'PT', renderedContent: '<p>x</p>',
    code: 'LEG-REF-1', verificationHash: 'LEG-VER-1', purpose: 'Bancária',
    createdAt: new Date('2026-01-01'), issuedAt: null, expiresAt: null,
  } as any;

  it('mapeia id ← legacyRequestId, referenceNumber ← code sem prefixo, status invertido', () => {
    const out = declarationToLegacyRequestShape(base);
    expect(out.id).toBe(42);
    expect(out.referenceNumber).toBe('REF-1');
    expect(out.verificationCode).toBe('VER-1');
    expect(out.status).toBe('PENDING');
    expect(out.generatedContent).toBe('<p>x</p>');
  });

  it('legacyRequestId ausente → id = null (Declaration nativa, não migrada)', () => {
    const out = declarationToLegacyRequestShape({ ...base, legacyRequestId: null });
    expect(out.id).toBeNull();
  });

  it('todas as chaves legadas presentes mesmo quando sem equivalente', () => {
    const out = declarationToLegacyRequestShape(base);
    for (const k of ['id', 'userId', 'templateId', 'purposeId', 'language', 'addressedTo', 'observations', 'status', 'generatedContent', 'referenceNumber', 'verificationCode', 'generatedAt', 'issuedAt', 'expiresAt']) {
      expect(k in out).toBe(true);
    }
  });
});
```

- [ ] **Step 2: FAIL → implementar** o adaptador com a tabela inversa de estados da Task 1 e a `LegacyRequestShape` da Task 1 Step 4.

- [ ] **Step 3: PASS + tsc**

```bash
npx jest src/work-declaration/declaration-legacy-adapter.spec.ts
npx tsc --noEmit
```

- [ ] **Step 4: prettier + commit**

```bash
npx prettier --write src/work-declaration/
git add src/work-declaration/
git commit -m "feat(work-declaration): adaptador Declaration→forma legada + helpers de render públicos"
```

---

### Task 6: `DocumentDeclarationsController` delega em `WorkDeclarationService`; eliminar `DocumentDeclarationsService`

**Files:**
- Modify: `src/declarations/declarations.controller.ts` (`DocumentDeclarationsController` só)
- Modify: `src/declarations/declarations.module.ts`
- Delete: `src/declarations/document-declarations.service.ts` + specs
- Test: `src/declarations/declarations.controller.spec.ts`

**Interfaces:**
- Consumes: `WorkDeclarationService` + `declarationToLegacyRequestShape`.

- [ ] **Step 1: Adaptar `declarations.controller.spec.ts` (deve falhar)** — mock de `WorkDeclarationService`; para cada rota de `/declarations/documents`, testar delegação no método canónico correcto (matriz da Task 1) e que a resposta passa pelo adaptador. Rotas de `purposes` continuam a usar Prisma directo dentro do controller? Não — mover para `WorkDeclarationService` um par de métodos `listPurposes`/`createPurpose`/`updatePurpose` (thin, sobre `DeclarationPurpose`), ou manter um mini-serviço `DeclarationPurposeService` no módulo `declarations`. **Decisão:** manter `DeclarationPurpose` CRUD como um pequeno serviço `DeclarationPurposeService` novo em `src/declarations/` (é um catálogo, ~30 linhas, sem duplicação com nada) — só `DocumentDeclarationsService` (a lógica de requests) é que é eliminado.

- [ ] **Step 2: FAIL**

```bash
npx jest src/declarations/declarations.controller.spec.ts
```

- [ ] **Step 3: Implementar**

- `src/declarations/declaration-purpose.service.ts` — `createPurpose`/`getPurposes`/`updatePurpose` (portados verbatim de `document-declarations.service.ts`).
- `DocumentDeclarationsController`:
  - `constructor(private readonly wd: WorkDeclarationService, private readonly purposes: DeclarationPurposeService)`.
  - `GET dashboard` → `wd.getStats(await tenant)` adaptado à forma de `getDashboard`.
  - `purposes*` → `this.purposes.*`.
  - `templates*` → `wd.listTemplates/getTemplate/createTemplate/updateTemplate/previewTemplate` (tenant resolvido internamente).
  - `GET` / `GET my` / `GET :id` → `wd.listDeclarations` / `wd.getDeclaration` filtrado por `employeeId = user.id` / resolver `:id` (Int) via `legacyRequestId`; mapear cada resultado com `declarationToLegacyRequestShape`.
  - `POST` → `wd.requestDeclaration(tenant, user.id, mappedDto)`; devolver `declarationToLegacyRequestShape(created)`.
  - `PATCH :id/approve` → `wd.changeStatus(..., 'APPROVED', ...)`.
  - `PATCH :id/generate` → `wd.changeStatus(..., 'GENERATED', ...)` (ou o método de geração de documento).
  - `PATCH :id/issue` → `wd.changeStatus(..., 'ISSUED', ...)`.
  - `GET verify/:code` (público) → `wd.verifyDeclaration({ code: 'LEG-' + code OR code })` — tentar ambos os prefixos; adaptar a resposta.
- `src/declarations/declarations.module.ts`:

```ts
@Module({
  imports: [PrismaModule, AuditModule, WorkDeclarationModule],
  providers: [WorkDeclarationsService, DeclarationPurposeService],
  controllers: [DocumentDeclarationsController, WorkDeclarationsController],
  exports: [WorkDeclarationsService],
})
```

(`DocumentDeclarationsService` sai; `WorkDeclarationsService` **plural** — o de `/declarations/work` — fica.)

- [ ] **Step 4: Eliminar `document-declarations.service.ts` + specs**

```bash
grep -rn "DocumentDeclarationsService" src/ --include=*.ts   # deve ficar sem hits
git rm src/declarations/document-declarations.service.ts src/declarations/document-declarations.service.spec.ts src/declarations/document-declarations.service.additional.spec.ts
```

- [ ] **Step 5: PASS**

```bash
npx jest src/declarations/
```

- [ ] **Step 6: prettier + tsc + eslint**

```bash
npx prettier --write src/declarations/
npx tsc --noEmit
npx eslint src/declarations/ --config eslint.config.staged.mjs
```

- [ ] **Step 7: Commit**

```bash
git add src/declarations/
git commit -m "refactor(declarations): /declarations/documents delega em WorkDeclarationService; elimina DocumentDeclarationsService"
```

---

### Task 7: Testes de integração — paridade `/declarations/documents` ↔ `/work-declarations` + backfill completo

**Files:**
- Modify: `test/integration/declarations/*.integration-spec.ts`
- Modify: `test/integration/work-declaration/*.integration-spec.ts` (se necessário)

- [ ] **Step 1: `/declarations/documents` — fluxo completo pós-consolidação**

```ts
describe('/declarations/documents servido por WorkDeclarationService (Fase E)', () => {
  it('POST /declarations/documents → cria uma Declaration e devolve a forma legada (id numérico, referenceNumber, status PENDING)', async () => {
    const res = await request(app.getHttpServer())
      .post('/declarations/documents')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ templateId: seededTemplateId, language: 'PT', purposeId: seededPurposeId })
      .expect(201);
    expect(typeof res.body.id).toBe('number');
    expect(res.body.status).toBe('PENDING');
    expect(res.body).toHaveProperty('referenceNumber');

    const decl = await prisma.declaration.findUnique({ where: { legacyRequestId: res.body.id } });
    expect(decl).not.toBeNull();
  });

  it('GET /declarations/documents/:id resolve o id numérico legado', async () => { /* ... */ });

  it('PATCH /declarations/documents/:id/approve → status APPROVED na forma legada', async () => { /* ... */ });

  it('GET /declarations/documents/verify/:code (público) verifica um documento migrado e um nativo', async () => { /* ... */ });
});
```

- [ ] **Step 2: backfill — dataset com vários estados**

Estender `declaration-backfill.integration-spec.ts`: criar `DeclarationRequest` em `PENDING`, `APPROVED`, `ISSUED`, `REJECTED` (+ um com `DeclarationApproval`), correr o backfill, verificar mapeamento de estado e `rejectedReason`.

- [ ] **Step 3: `/declarations/work` intocado** — correr o spec de `WorkDeclarationsController` (plural) e confirmar 0 alterações necessárias.

- [ ] **Step 4: prettier + commit**

```bash
npx prettier --write test/integration/
git add test/integration/
git commit -m "test(integration): paridade /declarations/documents↔/work-declarations + backfill multi-estado"
```

---

### Task 8: Verificação completa + documento de arquitectura

**Files:**
- Modify: `docs/arquitetura-modular-analise.md`

- [ ] **Step 1: Unit dos módulos tocados**

```bash
npx jest src/common/helpers src/declarations src/work-declaration src/api-integration src/automation src/notifications
```

- [ ] **Step 2: Suite unitária completa**

```bash
npm test
```

- [ ] **Step 3: Integração — lotes `declarations` e `work-declaration` (Redis local)**

```bash
npx cross-env NODE_ENV=test jest --config test/jest-integration.json --forceExit --runInBand --testPathPatterns "test/integration/(declarations)/"
npx cross-env NODE_ENV=test jest --config test/jest-integration.json --forceExit --runInBand --testPathPatterns "test/integration/(work-declaration)/"
```

- [ ] **Step 4: prettier (`src/**`) + eslint + tsc**

```bash
npx prettier --check "src/**/*.ts"
npx eslint src/declarations src/work-declaration src/common/helpers/tenant.helper.ts --config eslint.config.staged.mjs
npx tsc --noEmit
```

- [ ] **Step 5: `grep` de confirmação**

```bash
grep -rn "getDefaultTenantId\|DocumentDeclarationsService" src/ --include=*.ts   # sem hits em código vivo
```

- [ ] **Step 6: Actualizar `docs/arquitetura-modular-analise.md`**

- §13, linha E:

```
| E | Fundir `declarations`+`work-declaration` | 5 | Baixo-médio | Remove duplicação de tenant-resolution copiada literalmente |
```

→

```
| E | ~~Fundir `declarations`+`work-declaration`~~ — **concluída (E-full)**: `WorkDeclarationService`/`Declaration` é o caminho único de emissão de documentos; `/declarations/documents/*` delega com adaptador de forma; `DeclarationRequest` migrado (`legacyRequestId` + backfill idempotente) e deprecado; `getDefaultTenantId` unificado num helper (5→1). `/declarations/work` (forms de compliance) intocado. | 5 | — | Ver `docs/superpowers/plans/2026-09-05-fase-e-declarations-merge.md` |
```

- §2.3 item 13: acrescentar `\n\n> **Actualização (Fase E, 2026-09-05):** consolidado. `DeclarationRequest` deixou de ser escrito (migrado para `Declaration` via `legacyRequestId`); `resolveTenantId`/`getDefaultTenantId` tem uma só implementação (`src/common/helpers/tenant.helper.ts`). Remoção física do modelo `DeclarationRequest` fica para follow-up após período de observação.`
- §5: acrescentar nota de conclusão da Fase E.

- [ ] **Step 7: Commit**

```bash
git add docs/arquitetura-modular-analise.md
git commit -m "docs: marcar Fase E (fusão declarations/work-declaration, E-full) como concluída"
```

---

### Task 9: PR e CI

- [ ] **Step 1: Branch + push**

```bash
git push -u origin <branch>:refactor/declarations-merge
```

- [ ] **Step 2: PR** — corpo deve incluir:
  - Aviso de **migração de dados**: o backfill (`prisma/backfill-declaration-requests.ts`) tem de correr no deploy, **depois** de `prisma migrate deploy`, **antes** de o tráfego bater nas rotas `/declarations/documents`.
  - Aviso de **verificação do frontend**: confirmar que o frontend não depende de campos legados que o adaptador devolve como `null`.
  - Nota de que `DeclarationRequest`/`DeclarationPurpose`/`DeclarationApproval` ficam no schema (removê-los é follow-up).

- [ ] **Step 3: Aguardar `quality` verde.**
- [ ] **Step 4: `gh pr merge --squash --auto`.**
- [ ] **Step 5 (pós-merge, manual no ambiente):** correr `npx prisma migrate deploy && npx ts-node prisma/backfill-declaration-requests.ts` em staging/produção.

---

## Self-Review

**1. Cobertura da spec (§2.3 item 13 + §5 + §13 fase E):**
- "Fundir `declarations`+`work-declaration`" → Tasks 5–7 (`/declarations/documents` passa a `WorkDeclarationService`; `DocumentDeclarationsService` eliminado). ✔
- "a mesma função `resolveTenantId()`/`getDefaultTenantId()` copiada literalmente" → Task 2 (helper único, 5 call sites). ✔
- "partilham `DeclarationTemplate`" → após a Task 6, templates de `/declarations/documents` e `/work-declarations` passam pelo mesmo serviço/modelo. ✔
- "Duas features 'gerar certidão de trabalho' quase idênticas" → `DeclarationRequest` migrado para `Declaration` (Tasks 3–4). ✔
- §7 single-tenant → backfill e criação nova usam o tenant `DEFAULT`. ✔
- Fora do âmbito por decisão do dono do produto: `/declarations/work` (compliance forms). Anotado. ✔
- Fora do âmbito por prudência: remoção física de `DeclarationRequest`/`DeclarationApproval`/`DeclarationPurpose` do schema (follow-up após observação). Anotado no doc e no PR. ✔

**2. Placeholders:** as Tasks 1 e 5 Step 4 produzem/consomem tabelas de mapeamento cujos valores exactos de enum têm de ser confirmados no schema em runtime — os steps dependentes dizem-no explicitamente e dão o critério. O `type: 'OTHER'` no script de backfill é marcado como "heurística, ver Task 1". Não há "TODO/implement later" sem critério.

**3. Consistência de tipos:**
- `resolveDefaultTenantId(prisma, tenantId?)` — assinatura usada nas Tasks 2 (5 call sites) e 4 (script). ✔
- `backfillDeclarationRequests(prisma) → { created, updated, skipped }` — Tasks 4 e 7. ✔
- `declarationToLegacyRequestShape(decl) → LegacyRequestShape` — Tasks 5 e 6; `LegacyRequestShape` definida na Task 1 Step 4. ✔
- `Declaration.legacyRequestId` (Int? @unique) — introduzido na Task 3, usado nas Tasks 4/5/6/7. ✔
- `code`/`verificationHash` de migrados levam prefixo `LEG-`; o adaptador (Task 5) remove-o ao devolver `referenceNumber`/`verificationCode`; o handler de `verify` (Task 6) tenta ambos. Consistente. ✔

**4. Riscos anotados:** migração de dados (backfill idempotente + passo de deploy explícito no PR); `Declaration.id` cuid vs `:id` Int nas rotas legadas (resolvido via `legacyRequestId`, alternativa anotada na Task 1); `prisma migrate dev` inutilizável no dev DB → migração SQL manual + `migrate deploy` (Task 3); forma de resposta legada preservada via adaptador com chaves sempre presentes; `/declarations/work` (plural) não confundir com `/work-declarations` (singular) — a Task 6 Step 3 e a 7 Step 3 fixam que o plural fica intocado. Sem ciclo de módulos: `declarations` → `work-declaration` → (`pdf`, `users`, `notifications`, prisma); `work-declaration` não importa `declarations`.
