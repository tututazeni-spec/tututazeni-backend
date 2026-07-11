# Design — Remediação A-1: TLS, redirect forçado e security headers

> Remedia os achados do relatório `docs/security/2026-07-10-auditoria-a1-headers-comunicacao.md`
> (B1–B7 backend/ops, F1–F4 frontend). Aprovado em brainstorm a 2026-07-11.

## Decisões tomadas

| Decisão | Escolha | Racional |
|---|---|---|
| Domínio | Existe/vai existir antes do go-live | Let's Encrypt automático viável |
| Topologia | Frontend e API no mesmo VPS, atrás da mesma borda | Single box; same-site simplifica cookies/CORS |
| Servidor de borda | **Caddy** | TLS automático (emissão+renovação embutidas), redirect HTTP→HTTPS por defeito, mínimo de peças móveis |
| Layout de URLs | **Domínio único + `/api`** (`{DOMAIN}` → Next; `{DOMAIN}/api/*` → Nest com strip do prefixo) | Same-origin: zero CORS no browser, `connect-src 'self'`, cookie `lax` |
| Âmbito | A-1 completo nos 2 repos; **sem** containerização/deploy do frontend (fica para a Faixa H) | Fechar os achados sem misturar iniciativas |

Divisão de responsabilidades por camada (deliberada, evita headers duplicados):
**borda = TLS + redirect + HSTS · backend/frontend = CSP, XFO, nosniff, Referrer-Policy.**

## 1. Borda TLS (repo `innova`, `ops/`)

- Novo serviço `caddy` no `ops/docker-compose.prod.yml`:
  - `image: caddy:2-alpine`; portas públicas `80:80`, `443:443`, `443:443/udp` (HTTP/3).
  - Volumes: `./caddy/Caddyfile:/etc/caddy/Caddyfile:ro`, `caddy-data:/data` (certificados ACME persistem), `caddy-config:/config`.
  - `environment`: `DOMAIN`, `ACME_EMAIL` (novas variáveis no `.env.production`, documentadas no `ops/.env.production.example`).
  - `depends_on: app`.
- Serviço `app`: `ports` passa de `'4000:4000'` para `'127.0.0.1:4000:4000'` (debug só via túnel SSH).
- `ops/caddy/Caddyfile`:
  - Global: `email {$ACME_EMAIL}`.
  - Vhost `{$DOMAIN}`:
    - `header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"`.
    - `handle_path /api/*` → `reverse_proxy app:4000` (o `handle_path` remove o prefixo `/api`; Swagger fica em `https://{DOMAIN}/api/docs`).
    - `handle` restante: `respond 404` enquanto o frontend não estiver deployado; bloco `reverse_proxy` do frontend deixado comentado e pronto.
  - Redirect HTTP→HTTPS: automático do Caddy (nenhuma config; nunca servir conteúdo em `:80`).
- Prometheus continua a fazer scrape interno (`app:4000` na rede docker) — não passa pela borda.
- Runbook (`docs/deploy/runbook.md`): `ufw allow 80/tcp`, `ufw allow 443/tcp`, **remover** `allow 4000/tcp`; secret `SMOKE_BASE_URL` passa a `https://<dominio>/api`; nota sobre DNS do domínio a apontar ao VPS antes do primeiro arranque do Caddy.
- `deploy.sh`/`rollback.sh`: sem alterações (o `compose up -d` cobre o serviço novo).
- Submissão a hstspreload.org: manual, adiada até TLS estabilizar (preload é difícil de reverter).

## 2. Hardening do backend (repo `innova`, `src/`)

Lógica extraída para `src/common/security/` como funções puras testáveis (não inline no bootstrap):

1. **`trust proxy`** — `app.getHttpAdapter().getInstance().set('trust proxy', 1)` em `main.ts`.
2. **Middleware anti-downgrade** — em produção, request com `x-forwarded-proto: http` → `308` para `https://<host><url>`. Usa o header explícito (não `!req.secure`): o healthcheck do Docker (GET direto a `:4000` sem XFP) continua a passar — o health gate do deploy não parte. Proteção contra proxy futuro mal configurado; o Caddy já redireciona na borda.
3. **Helmet explícito** — `helmet({ hsts: { maxAge: 31536000, includeSubDomains: true, preload: true } })`, restantes defaults mantidos.
4. **`ALLOWED_ORIGINS` fail-fast** — em produção, bootstrap lança erro se a var faltar ou tiver origens `http://`; sem fallback silencioso para localhost. Dev mantém comportamento atual. Documentar em `.env.example` e `ops/.env.production.example`.
5. **Cookie de sessão** (`src/auth/auth.controller.ts`) — `sameSite: 'lax'` em todos os ambientes (era `'none'` em prod; frontend e API agora são same-site); `secure`/`httpOnly` mantidos.
6. **Endpoint raiz** — link `docs` derivado do request (protocolo/host), não hardcoded `http://localhost`.

## 3. Frontend (repo `innova-frontend`)

1. **`headers()` no `next.config.ts`** para todas as rotas:
   - CSP: `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'; upgrade-insecure-requests`.
   - `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`.
   - `script-src 'unsafe-inline'` é concessão aos scripts inline de hidratação do App Router; migração para nonces (via middleware, força rendering dinâmico) fica registada como iteração futura — não bloqueia esta remediação.
2. **`API_URL` unificado** — browser chama sempre `/api` relativo (same-origin):
   - `lib/api.ts` canónico (`export const API_URL = '/api'`); `lib/apiClient.ts`, `services/api.ts`, `config/env.ts` importam daí. Elimina `NEXT_PUBLIC_API_URL` e os 4 fallbacks `http://localhost` inconsistentes.
   - Rewrite dev `/api/:path*` mantém-se com destino em env server-side única `API_INTERNAL_URL` (default `http://localhost:4000`); em produção o Caddy interceta `/api` antes do Next — rewrite inerte.
   - `app/api/users/route.ts` (server-side) usa a mesma `API_INTERNAL_URL`, nunca `NEXT_PUBLIC_*`.
3. **`remotePatterns`** — remover `{ protocol: "http", hostname: "**" }`; manter só `https` até haver inventário de hosts de imagens reais.

## Testes (TDD por PR)

- **Backend**: specs unitários para o middleware anti-downgrade (redirige com XFP http; ignora sem header; ignora em dev) e para a validação de `ALLOWED_ORIGINS` (falta/http/ok); spec das cookie options atualizado. Padrões Jest existentes do repo.
- **Ops**: `caddy validate --config ops/caddy/Caddyfile` como passo de verificação (no plano; execução conforme ambiente disponível).
- **Frontend**: specs para o módulo `api` (URL relativo, sem `http://`) e asserção sobre os headers exportados pelo `next.config`; o plano confirma primeiro o test runner disponível no repo (o CI `quality.yml` valida o build).

## Ordem de entrega

1. **PR ① (`innova`)** — borda Caddy + hardening Nest + runbook/env examples.
2. **PR ② (`innova-frontend`)** — headers/CSP + API_URL + remotePatterns.
3. Cada PR: TDD → code review → ship (auto-merge com CI verde).

## Critérios de aceitação (do relatório A-1)

- `curl -I http://<dominio>` → `301/308` para HTTPS; `:4000` inacessível publicamente.
- `curl -sI https://<dominio>/api/health/ready` → 200 com `Strict-Transport-Security … preload`.
- Respostas do frontend com CSP/XFO/nosniff; login não enquadrável em iframe.
- Zero pedidos `http://` no Network do browser no fluxo login → dashboard.
- Healthcheck do Docker e health gate do deploy continuam verdes.
