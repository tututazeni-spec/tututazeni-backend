# Auditoria A-9 — Follow-up à A-5 (Upload de Ficheiros / Validação de URLs)

> Faixa A-9 da auditoria de production readiness. Data: 2026-07-27.
> Âmbito: revisão de conformidade com a convenção `@IsAllowedFileUrl()`
> estabelecida na A-5, em todos os módulos criados antes e depois dessa
> auditoria, e adição de um guard-rail automatizado contra regressão.
> Repositório: `innova` (backend NestJS).
> **Todos os achados foram remediados nesta sessão. Faixa encerrada.**

---

## 1. Resumo executivo

A auditoria A-5 (2026-07-14) fechou o Multer e unificou todos os campos de
ficheiro em `{ fileUrl: string }` validado por `@IsAllowedFileUrl()` (HTTPS +
allowlist de domínio via `ALLOWED_FILE_HOST`). A A-9 revisitou essa
convenção pedindo uma nova varredura completa aos 6 critérios clássicos de
upload (MIME/extensão, tamanho, path traversal, conteúdo real, armazenamento
fora do público, ficheiros executáveis) — todos **não aplicáveis** pela
arquitectura actual (não há bytes recebidos pelo backend), o que deslocou o
foco para a única superfície real: **a validação do `fileUrl` em si**.

Essa revisão encontrou **3 desvios concretos** à convenção estabelecida na
A-5, em três módulos diferentes, nenhum deles apanhado pela auditoria
original:

- `crm-funders` (módulo criado 2026-06-25, **antes** da A-5) — um endpoint
  aceitava `fileUrl` sem qualquer validação e sem restrição de role;
- `work-declaration` — dois campos usavam `@IsUrl()` em vez de
  `@IsAllowedFileUrl()`, um deles a contornar directamente o controlo que a
  própria A-5 tinha introduzido;
- `certification` — dois campos sem validação de URL nenhuma.

Também foi removida uma dependência morta (`multer`) deixada para trás pela
remoção de A-5, e foi adicionado um **guard-rail automatizado** (teste Jest
que corre em CI) para que o próximo módulo com um campo `fileUrl`/`logoUrl`/
`signatureUrl` sem `@IsAllowedFileUrl()` falhe a build em vez de depender de
uma próxima auditoria manual.

---

## 2. Achados

| ID | Severidade | Descrição | Evidência | Estado |
|---|---|---|---|---|
| A9-1 | 🔴 Alto | `fileUrl` aceite via `@Body('fileUrl')` sem DTO, sem `@IsString()`/`@IsAllowedFileUrl()` nenhum, e sem `@Roles()` — qualquer utilizador autenticado (qualquer role) podia submeter qualquer URL para qualquer `reportId` | `src/crm-funders/crm-funders.controller.ts` (`PUT /crm/funders/reports/:reportId/submit`) | ✅ Corrigido |
| A9-2 | 🟠 Médio | `SignDeclarationDto.signatureUrl` e `UpsertTenantConfigDto.logoUrl` usavam `@IsUrl()` (sem HTTPS-only nem allowlist). O segundo é especialmente grave: `PATCH /work-declarations/branding/settings` escreve no mesmo campo que `POST /work-declarations/branding/logo` protege com `@IsAllowedFileUrl()` — era um bypass total do controlo da A-5 para `logoUrl` | `src/work-declaration/work-declaration.dto.ts` | ✅ Corrigido |
| A9-3 | 🟡 Baixo | `CreateTemplateDto.logoUrl`/`signatureUrl` só com `@IsString()` — sem validação de URL nenhuma. Severidade reduzida: endpoint restrito a ADMIN/RH, e confirmado que o campo não é renderizado no backend nem no frontend hoje (ver §3) | `src/certification/dto/create-template.dto.ts` | ✅ Corrigido |
| A9-4 | ℹ️ Informativo | `multer`/`@types/multer` permaneciam como dependências directas no `package.json` sem qualquer uso em `src/` desde a remoção do Multer na A-5 — superfície de supply-chain morta | `package.json` | ✅ Removido |
| A9-5 | ℹ️ Preventivo | A convenção `@IsAllowedFileUrl()` dependia só de disciplina manual — os 3 desvios acima (A9-1/2/3) passaram despercebidos apesar de a A-5 já ter estabelecido essa convenção explicitamente | — | ✅ Guard-rail de CI adicionado |
| A9-6 | ℹ️ Verificação | `ops/.env.production.example` tem `ALLOWED_FILE_HOST=CHANGE_ME` como placeholder. Confirmado directamente com o responsável do ambiente que o valor real em produção é `ALLOWED_FILE_HOST=storage.innova.ao` (2026-07-27) — não é o placeholder | `ops/.env.production.example:49` | ✅ Confirmado |

---

## 3. Cenários de ataque

### 3.1 A9-1 — `crm-funders`: IDOR + injecção de URL arbitrária

Qualquer utilizador autenticado (independentemente de role) podia:

```http
PUT /crm/funders/reports/{qualquer-reportId}/submit
Content-Type: application/json

{ "fileUrl": "https://evil.com/malware.exe" }
```

O `reportId` pertence a qualquer financiador — não há verificação de posse —
e o `fileUrl` era gravado verbatim (`funderReport.update({ data: { fileUrl }
})`) sem qualquer validação de esquema, host, ou sequer de tipo. O mesmo
padrão de ataque documentado na A-5 (A5-4: exfiltração via SSRF, esquemas
maliciosos `javascript:`/`data:`, ou redirecionamento para malware) aplicava-se
aqui sem qualquer mitigação.

### 3.2 A9-2 — `work-declaration`: bypass do controlo de logoUrl

A A-5 protegeu `POST /work-declarations/branding/logo` com
`@IsAllowedFileUrl()`. No entanto, `PATCH /work-declarations/branding/settings`
(restrito a ADMIN, mas ainda assim um utilizador legítimo com conta
comprometida ou erro operacional) escrevia no mesmo campo `logoUrl` via
`UpsertTenantConfigDto`, validado apenas com `@IsUrl()` — que aceita
`http://`, qualquer host, e não passa pela allowlist `ALLOWED_FILE_HOST`.
Ou seja, o controlo dedicado da A-5 tinha uma porta ao lado sem fechadura.

### 3.3 A9-3 — `certification`: campos sem validação, risco de renderização futura

`logoUrl`/`signatureUrl` em `CreateTemplateDto` aceitavam qualquer string.
Investigação ao `template.html`/`logoUrl` confirmou que **não são
renderizados hoje** — nem no backend (`PdfService.generateCertificate` usa
PDFKit puro, sem consumir o template) nem no frontend
(`certification/templates/page.tsx` só mostra `html` num `<textarea>`, nunca
via `dangerouslySetInnerHTML`). Risco actualmente não explorável, mas a
validação foi adicionada por consistência e para não deixar a porta aberta
caso uma funcionalidade de preview/emissão renderizada seja adicionada no
futuro sem se lembrar desta lacuna.

---

## 4. Correcções aplicadas

### 4.1 `crm-funders` — DTO + `@IsAllowedFileUrl()` + `@Roles()`

**`src/crm-funders/dto/submit-report.dto.ts`** (novo):
```typescript
export class SubmitFunderReportDto {
  @ApiProperty({ example: 'https://storage.innova.ao/reports/q2-2026.pdf' })
  @IsAllowedFileUrl()
  fileUrl!: string;
}
```

**`src/crm-funders/crm-funders.controller.ts`**:
```typescript
// Antes
@Put('reports/:reportId/submit')
@ApiOperation({ summary: 'Submeter relatório' })
submitReport(
  @Param('reportId') reportId: string,
  @Body('fileUrl') fileUrl: string,
  @CurrentUser() user: CurrentUserData,
) {
  return this.service.submitReport(reportId, fileUrl, user.id);
}

// Depois
@Put('reports/:reportId/submit')
@Roles(Role.ADMIN, Role.RH, Role.GESTOR)
@ApiOperation({ summary: 'Submeter relatório' })
submitReport(
  @Param('reportId') reportId: string,
  @Body() dto: SubmitFunderReportDto,
  @CurrentUser() user: CurrentUserData,
) {
  return this.service.submitReport(reportId, dto.fileUrl, user.id);
}
```

**`src/crm-funders/crm-funders.service.ts`** — `submitReport` passou também a
rejeitar relatórios com soft-delete (`report.deletedAt`), consistente com o
resto do módulo (`findOne` já fazia essa verificação).

> Nota: não existe no schema um campo de "responsável" pelo `FunderReport"
> que permita uma verificação de posse mais fina do que a role — a
> restrição a ADMIN/RH/GESTOR é o controlo equivalente disponível no modelo
> de dados actual.

### 4.2 `work-declaration` — unificar em `@IsAllowedFileUrl()`

**`src/work-declaration/work-declaration.dto.ts`**:
```typescript
// SignDeclarationDto
@IsOptional()
@IsAllowedFileUrl()   // era @IsUrl()
signatureUrl?: string;

// UpsertTenantConfigDto
@IsOptional()
@IsAllowedFileUrl()   // era @IsUrl()
logoUrl?: string;
```
Import de `IsUrl` removido do ficheiro (deixou de ter uso).

### 4.3 `certification` — validar `logoUrl`/`signatureUrl`

**`src/certification/dto/create-template.dto.ts`**:
```typescript
@ApiPropertyOptional()
@IsOptional()
@IsAllowedFileUrl()   // era @IsString()
logoUrl?: string;

@ApiPropertyOptional()
@IsOptional()
@IsAllowedFileUrl()   // era @IsString()
signatureUrl?: string;
```

### 4.4 Limpeza de dependência

`npm uninstall multer @types/multer` — ambos continuam disponíveis em
`node_modules` como dependência transitiva de `@nestjs/platform-express`
(o adapter HTTP do NestJS, necessário independentemente de uploads), pelo
que a remoção não tem impacto funcional.

### 4.5 Guard-rail de CI contra regressão

**`src/common/validators/file-url-fields.guard.spec.ts`** (novo) — teste Jest
que corre automaticamente em `npm run test:coverage` (já presente no
`.github/workflows/quality.yml`, sem necessidade de alterar a pipeline) e
varre toda a `src/` à procura de:

- **Check A** — `@Body('fileUrl'|'logoUrl'|'signatureUrl')` usado directamente
  num controller em vez de um DTO;
- **Check B** — uma propriedade de DTO com esses nomes sem
  `@IsAllowedFileUrl()` nos decoradores imediatamente anteriores.

Validado por reversão controlada: reintroduzi temporariamente os bugs A9-1 e
A9-2 no código, confirmei que o teste falha com uma mensagem de
ficheiro:linha accionável, e revertei para o estado corrigido.

Âmbito deliberadamente restrito aos 3 nomes de campo já estabelecidos
(`fileUrl`, `logoUrl`, `signatureUrl`) — campos como `webhookUrl`/`baseUrl`/
`cdnBaseUrl` (integrações externas, ex: `src/scalability/scalability.dto.ts`)
são URLs de terceiros por natureza e não devem ser forçados à mesma
allowlist de storage.

---

## 5. Testes

- `src/crm-funders/dto/submit-report.dto.spec.ts` — 4 testes (https válido,
  http recusado, host não autorizado recusado, string vazia recusada)
- `src/work-declaration/work-declaration.dto.fileurl.spec.ts` — 8 testes
  (`signatureUrl` e `logoUrl`, cada um com https válido / opcional ausente /
  http recusado / host não autorizado)
- `src/certification/dto/create-template.dto.fileurl.spec.ts` — 6 testes
- `src/crm-funders/crm-funders.service.spec.ts` — novo teste para o guard de
  `deletedAt` em `submitReport`
- `src/common/validators/file-url-fields.guard.spec.ts` — guard-rail de CI

Suites afectadas (`crm-funders`, `work-declaration`, `certification`, guard):
**104/104 testes a passar**, `tsc --noEmit` limpo.

---

## 6. Resultado final

| Sub-faixa | Achados | Estado |
|---|---|---|
| A9-1 `crm-funders` (fileUrl + roles) | 1 | ✅ |
| A9-2 `work-declaration` (signatureUrl/logoUrl) | 1 | ✅ |
| A9-3 `certification` (logoUrl/signatureUrl) | 1 | ✅ |
| A9-4 dependência `multer` morta | 1 | ✅ |
| A9-5 guard-rail de CI | 1 | ✅ |
| A9-6 `ALLOWED_FILE_HOST` em produção | 1 | ✅ |
| **Total** | **6** | **6 ✅** |

A faixa A-9 está encerrada, incluindo o item de infra: `ALLOWED_FILE_HOST` em
produção foi confirmado como `storage.innova.ao` (2026-07-27), não o
placeholder `CHANGE_ME` de `ops/.env.production.example`.
