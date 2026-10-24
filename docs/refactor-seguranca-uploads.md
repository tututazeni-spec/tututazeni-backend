# Refactor — Segurança de uploads de ficheiros

> Análise + plano de tarefas. Data: 2026-10-23. Estado: **plano, nada implementado**.

## 1. Como os uploads funcionam hoje

Não existe `multer`/`FileInterceptor`/multipart em lado nenhum. Não há escrita em disco nem `ServeStatic`. Os ficheiros chegam de três formas:

1. **Data URL base64 dentro de JSON** (`data:<mime>;base64,…`), persistido inline em colunas Postgres (`Lesson.contentUrl`, `User.avatarUrl`, `ContentLibrary.url`, …). Limite global do body: `app.useBodyParser('json', { limit: '8mb' })` (`src/main.ts:76`).
2. **URL HTTPS externa** (`fileUrl`), com os bytes nunca a passar pelo backend. Validada por `@IsAllowedFileUrl`.
3. **Metadados** (`mimeType`, `fileSize`, `fileName`) enviados pelo cliente e guardados sem verificação contra o conteúdo.

Consequência: os pontos 3 e 5 do pedido (path traversal em disco, armazenamento fora do diretório público) **não se aplicam no sentido clássico** — não há caminho no filesystem. O risco equivalente é: `fileName` reflectido em `Content-Disposition`/UI, e o conteúdo inline ser servido ao browser com o MIME declarado.

## 2. Inventário de pontos de upload

### A. Data URL inline (bytes passam pelo backend)

| Campo | Validador | Tipos | Tamanho | Magic bytes |
|---|---|---|---|---|
| `Lesson.contentUrl` (PDF) — `common/authz/lesson-files.ts` | `assertValidLessonFile` (manual no service) | PDF | 7 M chars | **Sim** (`%PDF-`) |
| Imagens de certificado — `certificates/templates/image-validation.ts` | `inspectImage` | PNG/JPEG | 2 MB + dimensões | **Sim** (assinatura, IEND/EOI, dimensões) |
| `User.avatarUrl` — `users.dto.ts:396` | `@IsBase64ImageDataUrl` | png/jpeg/webp | `@MaxLength` no DTO | **Não** (só regex do prefixo) |
| `imageUrl` — `trainings.dto.ts:757`, `development-plans.dto.ts:163` | `@IsBase64ImageDataUrl` | png/jpeg/webp | idem | **Não** |
| `ContentLibrary.url` — `content-library.dto.ts:44` | `@IsUrlOrInlineFile` | allowlist 18 MIMEs | 5 MB | **Não** |
| Avatar-training imagem — `avatar-training.dto.ts:82` | `@IsUrlOrInlineFile` + `@Matches` | png/jpeg/webp/**gif** | 5 MB | **Não** |
| Certificado externo `document` — `certificates-lifecycle.dto.ts:76` | `@IsUrlOrInlineFile` | allowlist 18 MIMEs | `MAX_EXTERNAL_BYTES` | **Não** |
| Docs de licença — `leave-management.dto.ts:132` | `@IsAllowedFileUrl` + `allowPdfDataUrl` | PDF | por comprimento | **Não** |
| Docs de formação ×2 — `trainings.dto.ts:560,1033` | idem | PDF | por comprimento | **Não** |
| Docs de onboarding — `onboarding.dto.ts:322` | idem | PDF | 4 MB | **Não** |

### B. Só URL externa HTTPS + metadados (`@IsAllowedFileUrl`)

`assessments`, `audit-internal`, `work-declaration` (×3), `employees`, `document-repository` (×2), `library`, `crm-partners` (×4), `crm-funders` (×6), `crm-beneficiaries`, `course-modules`, `courses`.

### C. Downloads com nome dinâmico (sinks)

`avatar-training.controller.ts:602,608` — `Content-Disposition: attachment; filename="${…}"` sem escape visível. `executive-reports.controller.ts:497` — `StreamableFile` com `contentType` dinâmico. A verificar na tarefa T6.

## 3. Resultado por critério

| # | Critério | Estado | Detalhe |
|---|---|---|---|
| 1 | MIME + extensão | **Parcial** | MIME validado por allowlist/prefixo. **A extensão nunca é validada** e `mimeType`/`fileName` de metadados (B) não são cruzados entre si. |
| 2 | Limite de tamanho por tipo | **Parcial / incoerente** | 2 MB (certificados), 4 MB, 5 MB, ~5 MB por comprimento de string, `@MaxLength` sem relação com bytes (avatar). `MAX_FILE_SIZE_BYTES = 200 MB` em `allowed-mime-types.ts` é só metadado. Sem limite por tipo (imagem vs. PDF vs. vídeo). Limite global de 8 MB aplica-se a **todas** as rotas JSON. |
| 3 | Sanitização do nome | **Parcial** | Só `document-repository` rejeita `/` e `\`. `audit-reports`, `crm-partners` (agreement): só `@IsString`. Sem remoção de `..`, NUL, controlo, aspas/CRLF (header injection), nem nomes reservados do Windows. |
| 4 | Conteúdo real | **Fraco** | Só lições PDF e certificados (2 de ~10). Todos os outros aceitam qualquer coisa com o prefixo certo — ex.: HTML/EXE renomeado como `image/png` passa em avatar. Falta também re-codificar imagens. |
| 5 | Armazenamento fora do público | **N/A / risco diferente** | Sem disco. Dados inline em Postgres. Risco: servir `data:` ao browser como same-origin (XSS se MIME for activo) e URLs externas arbitrárias. |
| 6 | Bloqueio de executáveis | **Parcial (por omissão)** | A allowlist exclui `.exe`/`.js`/`.html`/`.svg` de forma implícita. Mas: (a) `@IsUrlOrInlineFile` aceita **qualquer string não-`data:`** (`javascript:`, `http://`, `file:`); (b) `ALLOWED_FILE_HOST` vazio ⇒ qualquer host HTTPS; (c) sem verificação de magic bytes, um PE/ELF/HTML com MIME `image/png` passa; (d) formatos Office (`.docx/.xlsx/.pptx`, `.doc/.xls/.ppt`) podem trazer macros e não são analisados; (e) `text/plain`/`csv` com injecção de fórmulas. |

### Achados prioritários

- **F1 (Alta)** — `IsUrlOrInlineFile` aceita qualquer URL (`is-url-or-inline-file.decorator.ts:70`): `javascript:`, `http:`, `ftp:`. Usado em `content-library.url` e `certificates-lifecycle.document`, que o frontend pode renderizar em `href`/`src`. É o achado mais fácil de explorar.
- **F2 (Alta)** — Magic bytes só em 2 de ~10 fluxos inline; avatar/imagens de formação/PDFs de licença, formação e onboarding só verificam o prefixo.
- **F3 (Média)** — `ALLOWED_FILE_HOST` vazio liberta todos os hosts HTTPS; confirmar o valor em produção (`.env`/`validate-env.ts`).
- **F4 (Média)** — Limites de tamanho e de comprimento definidos em sítios diferentes e em unidades diferentes (chars vs. bytes).
- **F5 (Média)** — `fileName` sem sanitização uniforme; possível reflexão em `Content-Disposition`.
- **F6 (Baixa)** — `image/gif` permitido em avatar-training; GIF animado/polyglot. Sem re-encode.
- **F7 (Baixa)** — Sem antivírus/AV para Office/PDF. PDFs com JS embutido não são analisados.

## 4. Desenho proposto

Um único módulo `src/common/files/` que substitui as validações dispersas:

```
src/common/files/
  file-policies.ts        // política por categoria: {mimes, exts, maxBytes, requireMagic}
  detect-file-type.ts     // magic bytes (PNG/JPEG/WebP/GIF/PDF/MP4/ZIP-OOXML/OLE) sem dependência externa
  sanitize-file-name.ts   // sanitizeFileName(name): string
  inspect-inline-file.ts  // data URL → { ok, mime, bytes, ext } | { ok:false, error }
  safe-content-disposition.ts // RFC 6266/5987
  decorators/             // @IsInlineFile(policy), @IsSafeFileName(), @IsSafeFileUrl()
```

Políticas (substituem o limite único):

| Categoria | MIMEs | Máx. | Magic | Extra |
|---|---|---|---|---|
| `AVATAR` | png, jpeg, webp | 1 MB | sim | re-encode + dimensões ≤ 2000 |
| `IMAGE` | png, jpeg, webp | 2 MB | sim | dimensões ≤ 4000 (reusar `inspectImage`) |
| `PDF` | pdf | 5 MB | sim (`%PDF-` + `%%EOF`) | rejeitar `/JavaScript`, `/Launch`, `/EmbeddedFile` |
| `OFFICE` | docx/xlsx/pptx | 10 MB | ZIP + `[Content_Types].xml` | rejeitar `vbaProject.bin`; bloquear `.doc/.xls/.ppt` legados e macro (`.docm/.xlsm`) |
| `TEXT` | txt, csv | 1 MB | sem NUL, UTF-8 | prefixar `'` em células `= + - @` no export |
| `MEDIA` | mp4, webm, mp3, wav | só via URL externa | n/a | nunca inline |

Regra transversal: nunca confiar no MIME declarado — **o tipo vem dos bytes**; se divergir do declarado, rejeitar. Dados guardados passam a usar o MIME detectado.

## 5. Tarefas e subtarefas

Ordem recomendada = ordem de risco. Cada tarefa é um commit local (Conventional Commits), seguindo `feedback_git_workflow_rules`.

### T1 — Fechar o buraco de URL (F1, F3) · Alta · pequeno
- T1.1 Criar `@IsSafeFileUrl()`: aceita só `https:` (e opcionalmente `data:` via política); rejeita `javascript:`, `vbscript:`, `file:`, `http:`, credenciais embutidas (`user:pass@`), IPs privados/loopback/link-local, `localhost`.
- T1.2 Trocar `@IsUrlOrInlineFile` por uma versão que usa T1.1 para o ramo "ligação" em `content-library.dto.ts` e `certificates-lifecycle.dto.ts`.
- T1.3 Em `validate-env.ts`: em produção, exigir `ALLOWED_FILE_HOST` não vazio (falhar o arranque, como outras regras de hardening).
- T1.4 Testes: `javascript:alert(1)`, `http://`, `https://user@host`, `https://127.0.0.1`, host fora da allowlist, URL válida.
- T1.5 Actualizar specs existentes (`is-url-or-inline-file.decorator.spec.ts` assume "qualquer string").

### T2 — Biblioteca de detecção de conteúdo real (F2) · Alta · médio
- T2.1 `detect-file-type.ts`: assinaturas PNG, JPEG, WebP (`RIFF…WEBP`), GIF, PDF, ZIP, OLE2 (`D0CF11E0`), MP4 (`ftyp`), WebM (EBML), MP3 (`ID3`/frame sync), WAV (`RIFF…WAVE`); detecta PE (`MZ`), ELF, Mach-O, shebang `#!` e `<script`/`<html` como "executável/activo" para rejeição explícita.
- T2.2 `inspect-inline-file.ts`: parse seguro do data URL (reaproveitar o parser sem regex sobre o payload de `is-url-or-inline-file.decorator.ts` — já resolve o stack overflow), decodifica uma vez, aplica política.
- T2.3 Validação estrutural de PDF (cabeçalho + `%%EOF`, tokens `/JavaScript` `/JS` `/Launch` `/EmbeddedFile` `/OpenAction`).
- T2.4 Validação OOXML: abrir o ZIP (limite de entradas e de tamanho descomprimido contra zip-bomb), exigir `[Content_Types].xml`, rejeitar `vbaProject.bin`, `.exe`, `.dll`, `.js`.
- T2.5 Migrar `inspectImage` para dentro do módulo e generalizar para webp/gif sem quebrar os testes de `image-validation.spec.ts`.
- T2.6 Testes com amostras: PNG verdadeiro, EXE com prefixo `image/png`, HTML como PDF, ZIP bomb, PDF com `/JavaScript`, docm.

### T3 — Aplicar validação por conteúdo nos fluxos inline (F2) · Alta · médio
- T3.1 Avatar (`users.dto.ts`) → `@IsInlineFile(AVATAR)`; opcionalmente re-encode com `sharp` (avaliar dependência) para remover EXIF/payload.
- T3.2 `imageUrl` em `trainings.dto.ts` e `development-plans.dto.ts` → política `IMAGE`.
- T3.3 PDFs inline em `leave-management`, `trainings` (×2), `onboarding` → política `PDF`. Substituir limites por comprimento por limites em bytes.
- T3.4 `content-library.url` e `certificates-lifecycle.document` → política por MIME declarado (PDF/OFFICE/IMAGE/TEXT).
- T3.5 `avatar-training.dto.ts`: remover `gif` ou tratá-lo como `IMAGE` com validação de frames.
- T3.6 `lesson-files.ts`: passar a usar T2 em vez da verificação `%PDF-` própria (manter a API `assertValidLessonFile`).
- T3.7 Gravar o MIME **detectado** (não o declarado) quando a coluna o permitir.

### T4 — Limites de tamanho coerentes (F4) · Média · pequeno
- T4.1 Centralizar em `file-policies.ts`; remover `MAX_PDF_DATA_URL_LENGTH`, `MAX_DOC_PDF_DATA_URL_LEN`, `TRAINING_DOCUMENT_MAX_DATA_URL_LENGTH`, `MAX_LEAVE_DOC_DATA_URL_LEN`, `MAX_INLINE_FILE_BYTES` (manter re-exports temporários).
- T4.2 Medir sempre em bytes decodificados (`floor(len*3/4) - padding`), rejeitando antes de decodificar.
- T4.3 Body parser: manter 8 MB global, mas considerar limite específico mais baixo (1 MB) nas rotas que não recebem ficheiros, para reduzir DoS por corpo grande.
- T4.4 Validar `fileSize` declarado em metadados contra a política da categoria (não só `@Max(200 MB)`).
- T4.5 Mensagens de erro em PT com o limite da categoria.

### T5 — Sanitização de nomes e metadados (F5) · Média · pequeno
- T5.1 `sanitizeFileName()`: `basename`, normalizar Unicode (NFC), remover NUL/controlo/`\r\n`, `..`, `/`, `\`, `:`, aspas; reduzir a ≤ 255; bloquear nomes reservados Windows (`CON`, `NUL`, `COM1`…); trim de pontos/espaços finais.
- T5.2 `@IsSafeFileName()` que rejeita (em vez de reescrever) nos DTOs: `audit-reports.dto.ts:176`, `create-partner-agreement.dto.ts:90`, `document-repository.dto.ts:67,129` (substitui o regex local), restantes `fileName` de `crm-*`, `employees`.
- T5.3 Lista de extensões bloqueadas (`exe, dll, bat, cmd, com, scr, msi, js, jse, vbs, ps1, sh, jar, apk, html, htm, svg, php, hta, lnk, iso, docm, xlsm, pptm`) incluindo **dupla extensão** (`fatura.pdf.exe`).
- T5.4 Cruzar extensão ↔ `mimeType` ↔ bytes (quando houver bytes) e rejeitar divergências.
- T5.5 Testes: `../../etc/passwd`, `a\\b`, `x.pdf.exe`, `nome\r\nSet-Cookie:`, `CON.pdf`, nome com 300 chars.

### T6 — Downloads seguros (sinks) (F5) · Média · pequeno
- T6.1 `safe-content-disposition.ts` (`filename*=UTF-8''…` + fallback ASCII) e usar em `avatar-training.controller.ts:602,608`, `executive-reports.controller.ts` e qualquer outro `Content-Disposition` encontrado (re-grep amplo, segundo `feedback_broaden_grep_sweeps`).
- T6.2 Em respostas que servem conteúdo guardado (`GET /lessons/:id/file`, etc.): `Content-Type` = MIME detectado/guardado, `X-Content-Type-Options: nosniff`, `Content-Disposition: attachment` para tudo menos PDF/imagens, e `Content-Security-Policy: sandbox` nos ficheiros.
- T6.3 Confirmar que o `helmet` já activo em `main.ts` não é sobreposto nestas rotas.

### T7 — Hardening complementar (F6, F7) · Baixa
- T7.1 Decidir sobre AV (ClamAV via `clamd`) para Office/PDF — registar como decisão de produto, só implementar se aprovado.
- T7.2 Neutralização de CSV injection nos exports/imports `text/csv` (`= + - @ \t \r`).
- T7.3 Rate limit específico nas rotas de upload (throttler já existe em `common/config/throttler.config.ts`).
- T7.4 Auditoria: registar rejeições de upload (utilizador, categoria, motivo) via o `AuditService` canónico.

### T8 — Testes, regressão e rollout
- T8.1 Unit tests por módulo novo; manter os specs existentes verdes (`*.dto.fileurl.spec.ts`, `*.filemeta.spec.ts`, `image-validation.spec.ts`, `is-*.spec.ts`).
- T8.2 Teste de integração real contra Postgres para um fluxo de cada categoria (avatar, PDF de licença, content-library). Não confiar em mocks Prisma (regra 11 do CLAUDE.md).
- T8.3 Dados já existentes: script **só de leitura** que varre as colunas inline e reporta ficheiros que falhariam as novas regras (sem apagar nada) antes de activar o modo estrito.
- T8.4 Rollout em dois passos: modo `warn` (log, não rejeita) → modo `enforce`, controlado por env.
- T8.5 Verificar o frontend: tipos aceites nos `<input type=file>` e mensagens de erro (repo `frontend/` separado); não alterar sem pedir.
- T8.6 Correr `npx prettier --write` e o CI `quality` antes de qualquer merge (regra 15).

## 6. Ordem e dependências

```
T1 ──┐
T2 ──┼─► T3 ─► T8
T5 ──┤        ▲
T4 ──┘        │
T6 ───────────┘
T7 (opcional, depois)
```

T1 e T5 não dependem de nada e podem arrancar já. T3 depende de T2 e T4.

## 7. Perguntas em aberto

1. Qual é o valor de `ALLOWED_FILE_HOST` em produção? (determina a gravidade de F3)
2. Aceitam adicionar `sharp` para re-encode de avatares? (vantagem: elimina payloads em metadados de imagem)
3. Ficheiros Office: manter permitidos ou passar a só-PDF?
4. Quer ClamAV (T7.1), ou fica fora de âmbito?
5. Vídeos/áudio: confirmo que ficam apenas por URL externa e nunca inline?

## 8. Estado de execução (2026-10-23)

| Tarefa | Estado | Notas |
|---|---|---|
| T1 URLs | feita | `safe-file-url.ts`; `IsUrlOrInlineFile`/`IsAllowedFileUrl` já não aceitam `javascript:`, `http:`, credenciais nem hosts internos. T1.3 já estava coberta por `validate-env.ts`/Joi. |
| T2 Deteção por bytes | feita | `src/common/files/`: `detect-file-type`, `zip-directory`, `inspect-content`, `data-url`, `inspect-inline-file`. Sem dependências novas. |
| T3 Aplicar nos fluxos | feita | Avatar, `imageUrl`, capas (`IsOptionalImageRef`), PDFs/imagens de licença/formação/onboarding, biblioteca, certificado externo, avatar-training, lições PDF e evidência de auditoria validam pelos bytes. |
| T4 Limites | feita | `FILE_POLICIES` (bytes, sem alargar limites), `fileSize` por MIME, `/auth` com corpo máx. 100 KB. |
| T5 Nomes | feita | `IsSafeFileName`/`sanitizeFileName`. |
| T6 Downloads seguros | feita | `safe-download.ts` (`Content-Disposition` RFC 6266, MIME só da lista segura, `nosniff`, CSP `sandbox`) aplicado a 9 controllers com nome/tipo dinâmico. `helmet` já emite `nosniff` globalmente e as rotas só sobrepõem os headers que definem. |
| T7 Complementares | pendente | CSV injection, rate limit nas rotas de upload, auditoria de rejeições, ClamAV (decisão de produto). |
| T8 Rollout | parcial | Script `npm run audit:uploads` (só leitura) feito. Falta modo `warn`→`enforce` e correr o script em produção. |

### Limites conhecidos
- JavaScript dentro de object streams comprimidos de PDF (≥ 1.5) não é visível sem descomprimir.
- OOXML: tamanhos validados são os declarados no directório ZIP; só quem descomprime apanha uma mentira nesses campos.
- Ficheiros Office legados (`.doc/.xls/.ppt`) deixaram de ser aceites em fluxos com política.
- DNS: URLs externas validam o hostname literal, não a resolução (um domínio público que aponte para IP interno passa).
