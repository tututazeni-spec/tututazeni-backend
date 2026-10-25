# Segurança — itens pendentes da auditoria (2026-10-25)

Auditoria dos 5 pontos (SQL injection, XSS, CSRF, validação, headers). Estado verificado por leitura de código; não foram corridos testes nem a aplicação.

## Concluído
- SQL injection: só Prisma ORM; único `$queryRawUnsafe` (`src/prisma/prisma.service.ts`) usa string fixa. Regra ESLint contra SQL inseguro (commit `49f2523`).
- XSS: `dangerouslySetInnerHTML` só em `frontend/components/ui/SafeHtml.tsx` (DOMPurify, `frontend/lib/sanitize.ts`).
- Validação backend: `ValidationPipe` global com `whitelist` + `forbidNonWhitelisted` (`src/main.ts`).
- Headers: `helmet` no backend; CSP com nonce (`frontend/middleware.ts`, `frontend/lib/csp.ts`) e `X-Frame-Options: DENY` (`frontend/next.config.ts`).
- `ops/.env.production.example`: removida a definição duplicada de `IMG_ALLOWED_HOSTS` (ficava a valer a última).

## Pendente

### 1. Activar `CSRF_TOKEN_STRICT=true` em produção
- Estado: `false` em `.env.example` e `ops/.env.production.example`. Com `false` o backend aceita escritas só com `X-Requested-With`, sem token double-submit.
- Porque ainda não: o token foi introduzido em `49f2523` (2026-10-25). Sessões anteriores não têm o cookie `csrf_token`; com `true` as suas escritas dariam 403 até novo login.
- Quando: depois da janela de 24h–7d após o deploy (seguro a partir de 2026-11-01).
- Como: pôr `CSRF_TOKEN_STRICT=true` no `.env` de produção e nos dois ficheiros `.example` (actualizar o comentário); reiniciar o backend. Verificar com uma escrita autenticada sem `X-CSRF-Token` → 403, e com token → OK.

### 2. Confirmar `IMG_ALLOWED_HOSTS` no ambiente real
- Os `.example` só têm valores de exemplo. Vazio = `img-src https:` (qualquer host https).
- Tem de coincidir com a variável de repositório `IMG_ALLOWED_HOSTS` do frontend (build-arg do `next/image`).

### 3. CSP: `style-src 'unsafe-inline'`
- Assumido em `frontend/lib/csp.ts` ("apertar com nonces de estilo fica para depois").
- Apertar exige nonces de estilo e pode afectar Tailwind e `style={}` do React; tratar como trabalho à parte, com teste visual.

### 4. Validação de inputs (auditada 2026-10-25, por amostragem/contagem — não formulário a formulário)

**Frontend**
- Sem `zod`/`yup`/`react-hook-form`. Existe `frontend/lib/validation.ts` (`required`, `email`, `validate`), usado em 19 ficheiros. Os restantes ~26 dos 45 ficheiros com `<form>`/`onSubmit` validam à mão ou só com atributos HTML (`required` em 58 ficheiros, `maxLength` em 41).
- Uploads (`type="file"`): todos verificam tamanho/tipo ou têm `accept=`, excepto `components/audit/ExportsView.tsx` (sem `accept=`, mas valida `file.size > MAX_EVIDENCE_BYTES`). Aceitável; o backend tem políticas de ficheiro (`FILE_POLICIES`).
- Não existe helper de URL segura no frontend. `href={...}` com URLs vindas da BD sem filtro de protocolo, p.ex.: `live-classes/[id]/page.tsx:226` (`recordingUrl`), `events/DetailView.tsx:399` (`meetingUrl`), `courses-learn/ContentPlayer.tsx:283` (`liveSessionUrl`), `notifications/InboxView.tsx:85` (`actionUrl`), `executive-reports/AlertsPanel.tsx:172` (`alert.link`), `courses-modulos/LessonRow.tsx`, `crm/partners/*` (`contractUrl`).

**Backend** (lacuna real, severidade média-baixa)
- Campos de URL em DTOs: 52. Muitos usam o validador próprio `@IsAllowedFileUrl` / `@IsUrlOrInlineFile` (`src/common/validators/is-allowed-file-url.validator.ts`; não revisto a fundo aqui), mas vários são só `@IsString()` sem validar protocolo: `events.meetingUrl`, `courses.liveSessionUrl/contentUrl/introVideoUrl/captionsUrl`, `notifications.actionUrl`, `users.linkedinUrl`, `crm-partners.contractUrl`, `crm-funders.proofUrl`, `competencies.evidenceUrl`, `onboarding.welcomeVideoUrl/evidenceUrl`, `trainings.meetingUrl`, `avatar-training.mediaUrl`, `crm-beneficiaries.photoUrl`, `events.bannerUrl/photoUrl`.
- **CORRIGIDO (2026-10-25)**, commits `ff2bbc0` (backend) e `8355efed` (frontend):
  - Backend: novo `@IsWebLink()` (`src/common/validators/is-web-link.decorator.ts`): só http(s), máx. 2048, rejeita whitespace/controlo (`java	script:`), `//host` e backslash; `''` aceita-se (campo limpo). Opção `allowRelative` para caminhos internos. Aplicado a 17 campos: `events.meetingUrl`, `trainings.meetingUrl`, `courses.liveSessionUrl/introVideoUrl/captionsUrl`, `users.linkedinUrl`, `crm-partners.contractUrl`, `crm-funders.proofUrl`, `competencies.evidenceUrl` (x2), `onboarding.welcomeVideoUrl/evidenceUrl`, `avatar-training.resourceUrl` (x3), `notifications.actionUrl` (x2, com `allowRelative`).
  - Frontend: `frontend/lib/safeHref.ts` aplicado a 21 `href` (recordingUrl, meetingUrl, liveSessionUrl, resourceUrl, contractUrl, actionUrl, alert.link, welcomeVideoUrl, search result.url, etc.).
  - Testes: 23 (validador) + 22 (`safeHref`); `tsc` limpo nos dois; jest dos módulos tocados (66 suites) e vitest (26 ficheiros) a passar.
- **Ainda por fazer** (deixado de fora de propósito):
  - Campos de URL que podem ser data URL inline ou ficheiro, onde `@IsWebLink` partiria o fluxo: `courses.contentUrl` (2 DTOs), `content-library.url`, `events.bannerUrl/photoUrl`, `crm-beneficiaries.photoUrl`, `users.avatarUrl`, `settings.*Url`, `assessments.mediaUrl`. Cada um precisa de um validador próprio (http(s) OU data URL de imagem/ficheiro com política), como `@IsUrlOrInlineFile`.
  - `href` de `fileUrl` (já validados no backend por `@IsAllowedFileUrl`) e `LessonRow` (`contentUrl` pode ser data URL) não passam por `safeHref`.
  - Dados antigos: o validador só actua em escritas novas; registos já gravados com `javascript:` continuam na BD (o `safeHref` no frontend cobre a renderização). Query de verificação sugerida: procurar `~* '^s*(javascript|data|vbscript):'` nas colunas acima.
