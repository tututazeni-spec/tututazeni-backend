# Auditoria A-4 — Injecção, XSS e Validação de Input (INNOVA)

> Faixa A-4 da auditoria de production readiness. Data: 2026-07-13.
> Âmbito: SQL injection via queries raw, XSS em componentes React, e
> ausência de validação de input no backend (inline body interfaces).
> Repositórios: `innova` (backend NestJS) e `innova-frontend` (Next.js).
> **Todos os achados foram remediados em PR#28 (A4-PR2), PR#29 (A4-PR3)
> e no repositório frontend (A4-PR1).**

---

## 1. Resumo executivo

A faixa A-4 identificou três classes de vulnerabilidade relacionadas com
a ausência de sanitização e validação do input do utilizador:

1. **SQL Injection latente** (`$queryRawUnsafe` com interpolação de string)
   — não exploitável no estado actual, mas uma armadilha prestes a disparar.
2. **XSS no preview de declarações** — `dangerouslySetInnerHTML` com uma
   regex de strip que tem bypasses conhecidos.
3. **18 endpoints sem validação de input** — `@Body()` tipado com interfaces
   TypeScript puras (apagadas em runtime), tornando o `ValidationPipe` global
   inoperante nessas rotas.

Os três achados foram tratados em PRs cirúrgicos: A4-PR1 (1 linha no frontend),
A4-PR2 (4 linhas no backend), A4-PR3 (18 DTOs novos + controllers actualizados).

---

## 2. Achado A4-PR1 — XSS em `declarations/page.tsx`

### 2.1 Cenário de ataque

**Stored XSS via template de declaração.** Um administrador que gerencie
templates de declarações pode introduzir conteúdo malicioso no campo
`DeclarationTemplate.content`. O preview do frontend renderizava esse campo
com `dangerouslySetInnerHTML` depois de aplicar uma regex de strip de tags
(`/<[^>]*>/g`). Esta regex tem bypasses documentados — por exemplo,
`<img src=x onerror=alert(1)>` sobrevive a variantes com atributos malformados.
O resultado: qualquer utilizador que abrisse o preview de uma declaração com
conteúdo manipulado executava JavaScript arbitrário no contexto da aplicação.

**Impacto:** roubo de sessão (cookie `httpOnly` não é acessível via JS, mas o
localStorage e tokens em memória sim), exfiltração de dados do DOM, phishing
interno, ou tomada de controlo da sessão do utilizador.

### 2.2 Achados

| ID | Severidade | Descrição | Evidência | Estado |
|---|---|---|---|---|
| A4-XSS-1 | 🟠 Alto | `dangerouslySetInnerHTML` com regex de strip insuficiente no preview de declarações | `frontend/app/(platform)/declarations/page.tsx:232` | ✅ Corrigido (frontend) |

### 2.3 Correcção aplicada

```tsx
// Antes — regex de strip com bypasses conhecidos
<pre className="text-xs text-gray-700 whitespace-pre-wrap font-sans"
     dangerouslySetInnerHTML={{ __html: preview.previewHtml.replace(/<[^>]*>/g, ' ').trim() }} />

// Depois — React children com escape automático
<pre className="text-xs text-gray-700 whitespace-pre-wrap font-sans">
  {preview.previewHtml.replace(/<[^>]*>/g, ' ').trim()}
</pre>
```

React faz escape automático de todo o conteúdo passado como children — o
browser recebe texto, nunca HTML. A alteração foi 1 linha no ficheiro alvo.
Comportamento visual idêntico ao utilizador.

---

## 3. Achado A4-PR2 — SQL Injection latente em `crm-funders`

### 3.1 Cenário de ataque

**SQL Injection via `$queryRawUnsafe`.** O serviço `crm-funders` usava
`prisma.$queryRawUnsafe` com interpolação directa de string para invocar
`nextval()` numa sequência PostgreSQL:

```typescript
const rows = await this.prisma.$queryRawUnsafe<{ nextval: bigint }[]>(
  `SELECT nextval('${sequence}') AS nextval`,
);
```

No estado actual, `sequence` vem de um mapa hardcoded (`CODE_SEQUENCES`) e
não é input externo — portanto não é exploitável directamente. O risco é
**latente e arquitectural**: `$queryRawUnsafe` desactiva completamente a
parametrização do Prisma. Qualquer refactoring futuro que introduza input
do utilizador nesta variável — mesmo que pareça inocente — cria um SQLi
imediato sem qualquer aviso do compilador ou do ORM.

**Impacto potencial:** exfiltração de toda a BD, modificação arbitrária de
dados, escalada de privilégios via tabelas de utilizadores.

### 3.2 Achados

| ID | Severidade | Descrição | Evidência | Estado |
|---|---|---|---|---|
| A4-SQLi-1 | 🟡 Médio | `$queryRawUnsafe` com interpolação de string para `nextval()` — não exploitável hoje mas vectoriza SQLi em qualquer refactoring futuro | `src/crm-funders/crm-funders.service.ts:44` | ✅ Corrigido (PR#28) |

### 3.3 Correcção aplicada

```typescript
// Antes — $queryRawUnsafe com interpolação de string
const rows = await this.prisma.$queryRawUnsafe<{ nextval: bigint }[]>(
  `SELECT nextval('${sequence}') AS nextval`,
);

// Depois — $queryRaw com tagged template literal e cast ::regclass
const rows = await this.prisma.$queryRaw<{ nextval: bigint }[]>`
  SELECT nextval(${sequence}::regclass) AS nextval
`;
```

`$queryRaw` com tagged template literal força parametrização automática.
O PostgreSQL aceita o nome da sequência como parâmetro de texto e resolve
o OID internamente via `::regclass` — sem concatenação, sem risco. 4 linhas
alteradas entre o service e o spec.

---

## 4. Achado A4-PR3 — 18 endpoints sem validação de input

### 4.1 Cenário de ataque

**DoS por query amplificada via `ReadBulkDto`.** O endpoint
`PATCH /notifications/my/read-bulk` aceitava `@Body() body: { ids: number[] }`
— uma interface TypeScript pura, apagada em runtime. O `ValidationPipe` global
(com `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`) não
consegue validar interfaces: sem classe, sem decoradores, sem validação. Um
utilizador autenticado podia enviar `{ "ids": [1,2,3,...100000] }` e disparar
uma query `UPDATE ... WHERE id IN (...)` com 100 000 parâmetros, saturando a BD.

**Manipulação de tipos.** Endpoints como `PATCH /employees/:id/contract-status`
aceitavam `{ status: any }` sem validação de enum — qualquer string era aceite
e persistida na BD, potencialmente corrompendo o estado da aplicação.

**Injecção de campos extra.** Sem `forbidNonWhitelisted` efectivo (inoperante
sobre interfaces), o servidor processava silenciosamente campos arbitrários no
body, incluindo tentativas de mass assignment.

### 4.2 Achados

| ID | Severidade | Descrição | Evidência |
|---|---|---|---|
| A4-DTO-1 | 🟠 Alto | `ReadBulkDto` — array sem `@ArrayMaxSize`, permite DoS com 100k IDs | `src/notifications/notifications.controller.ts:70` |
| A4-DTO-2 | 🟠 Alto | `UpdateContractStatusDto` — enum sem `@IsEnum`, aceita qualquer string | `src/employees/employees.controller.ts:147` |
| A4-DTO-3 | 🟠 Alto | `ValidateApiKeyBodyDto` — string sem `@MaxLength`, permite payload ilimitado | `src/api-integration/api-integration.controller.ts:132` |
| A4-DTO-4..18 | 🟠 Alto | 15 endpoints adicionais com inline interfaces — `ValidationPipe` inoperante | Vários controllers |

**Estado:** ✅ Todos corrigidos em PR#29.

### 4.3 Correcção aplicada

Para cada um dos 18 endpoints, substituição da interface inline por uma classe
decorada com `class-validator`. Exemplo mais crítico:

```typescript
// Antes — interface inline, ValidationPipe inoperante
async readBulk(@Body() body: { ids: number[] }) { ... }

// Depois — DTO com limites explícitos
export class ReadBulkDto {
  @IsArray()
  @ArrayMaxSize(100)
  @IsInt({ each: true })
  @Min(1, { each: true })
  ids!: number[];
}

async readBulk(@Body() dto: ReadBulkDto) { ... }
```

**18 DTOs criados** (ou controllers actualizados para usar DTOs já existentes),
distribuídos por 10 módulos:
`api-integration`, `avatar-training`, `declarations`, `document-repository`,
`employees`, `instructor`, `leader`, `notifications`, `roles-permissions`,
`work-declaration`.

---

## 5. Resultado final

| Sub-faixa | Achados | PRs | Estado |
|---|---|---|---|
| A4-PR1 XSS frontend | 1 | frontend repo | ✅ |
| A4-PR2 SQL Injection | 1 | #28 | ✅ |
| A4-PR3 Input validation | 18 | #29 | ✅ |
| **Total** | **20** | **3 PRs** | **✅ Encerrado** |

A faixa A-4 está encerrada. O `ValidationPipe` global opera correctamente em
todos os endpoints. Não existem ocorrências de `$queryRawUnsafe` na base de
código. O frontend não usa `dangerouslySetInnerHTML` no fluxo de declarações.
