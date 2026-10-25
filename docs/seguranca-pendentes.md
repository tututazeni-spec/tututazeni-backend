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

### 4. Validação no frontend (não auditada)
- Não há `zod`/`yup`/`react-hook-form` no frontend; não foi verificada formulário a formulário a validação no cliente.
- Risco de segurança baixo (o backend valida sempre), mas a UX/consistência de erros por campo fica por rever.
- Também por confirmar: `RichTextEditor.tsx` faz `el.innerHTML = lessonTextToHtml(value)` sem DOMPurify; confirmar que `lessonTextToHtml` escapa o texto.
