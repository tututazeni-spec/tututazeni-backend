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
- Cenário: um utilizador com permissão de escrita grava `javascript:...` (ou `data:text/html,...`) num destes campos; outro utilizador clica no link renderizado. XSS armazenado.
- Mitigação já existente: a CSP (`script-src` sem `'unsafe-inline'`) faz o browser bloquear navegação `javascript:` — é defesa em profundidade, não validação. Browsers sem CSP efectiva ou uma CSP futura mais frouxa reabrem o problema.
- Correcção recomendada (por fazer): (a) no backend, trocar `@IsString()` por um validador `@IsHttpUrl()` (só `http:`/`https:`, `@MaxLength(2048)`) nos campos acima que são ligações externas; (b) no frontend, helper `safeHref(url)` que devolve `undefined` se o protocolo não for `http(s)`/`mailto`/rota relativa, usado nos `href` listados. Cobrir com testes unitários (`javascript:`, `data:`, `vbscript:`, maiúsculas/espaços/tabs no esquema).
- Cuidado ao aplicar: `actionUrl` das notificações é deep link (rota relativa) e `content-library.url`/`contentUrl` podem ser data URL inline por desenho — não aplicar `@IsHttpUrl` cegamente nestes.
- `RichTextEditor.tsx` (`el.innerHTML = lessonTextToHtml(value)`): **verificado, seguro** (2026-10-25). `lessonTextToHtml` sanitiza com DOMPurify o ramo HTML e escapa `& < >` no ramo de texto simples; `emit()` volta a sanitizar à saída e o `LessonReader` renderiza via `SafeHtml`.
