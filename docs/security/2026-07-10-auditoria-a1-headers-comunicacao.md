# Auditoria A-1 — Comunicação e Security Headers (INNOVA)

> Faixa A-1 da auditoria de production readiness. Data: 2026-07-10.
> Âmbito: mixed content, redirect HTTP→HTTPS, headers de segurança (HSTS, CSP,
> X-Frame-Options, etc.) e proteção contra downgrade de protocolo.
> Repositórios auditados: `innova` (backend NestJS) e `innova-frontend` (Next.js).
> **Este documento só reporta e planeia — nenhuma correção foi aplicada.**

---

## 1. Resumo executivo

O backend está razoavelmente bem servido de headers (helmet@8 com defaults em
`src/main.ts:16`), mas **a stack de produção não tem TLS nem reverse proxy** —
a API é exposta em HTTP puro na porta 4000 (`ops/docker-compose.prod.yml`).
Sem HTTPS, o header HSTS emitido pelo helmet é ignorado pelos browsers e não
existe (nem pode existir) redirect HTTP→HTTPS. O frontend Next.js **não define
nenhum security header** e autoriza explicitamente imagens via `http://` de
qualquer origem.

Efeito colateral já latente: o cookie de sessão é criado com `secure: true` em
produção (`src/auth/auth.controller.ts:29`) — sobre HTTP puro, os browsers
recusam enviá-lo, ou seja **o login em produção quebraria de qualquer forma**.
O TLS não é opcional: é pré-requisito funcional.

## 2. Cenário de ataque (porquê importa)

**SSL-strip / downgrade + roubo de sessão.** Um utilizador na rede corporativa
(ou Wi-Fi partilhado) acede à plataforma. Como não há HTTPS nem HSTS efetivo,
um atacante em posição de MITM (ARP spoofing no mesmo segmento de rede — banal
numa empresa de 6000 funcionários) intercepta:

1. As credenciais do `POST /auth/login` em texto claro.
2. O cookie `token` (JWT) em cada request — mesmo `httpOnly` não protege
   contra sniffing de rede, só contra XSS.
3. Qualquer dado de RH em trânsito (PDI, presenças, dados pessoais — dados
   sensíveis com implicações legais).

**Clickjacking no frontend.** Sem `X-Frame-Options`/`frame-ancestors` no
Next.js, a página de login pode ser embebida num iframe invisível de um site
malicioso para capturar credenciais por sobreposição de UI.

## 3. Achados

### 3.1 Backend (`innova`)

| # | Severidade | Achado | Evidência |
|---|---|---|---|
| B1 | 🔴 Crítico | Produção sem TLS e sem reverse proxy: app exposta em `0.0.0.0:4000` HTTP puro; nenhum nginx/Caddy no compose; runbook de deploy não menciona TLS/certbot | `ops/docker-compose.prod.yml:11-12`; `docs/deploy/runbook.md` |
| B2 | 🔴 Crítico | Sem redirect forçado HTTP→HTTPS em nenhuma camada (não há camada HTTPS para onde redirecionar) | consequência de B1 |
| B3 | 🟠 Alto | `trust proxy` não configurado no Express — atrás de um proxy futuro, `req.secure`/`req.ip` ficam errados (afeta redirect condicional, rate limiting e cookies `Secure`) | `src/main.ts` (ausente) |
| B4 | 🟠 Alto | CORS com fallback `http://localhost:3000` se `ALLOWED_ORIGINS` faltar; a variável nem sequer está documentada no `.env.example` — em produção mal configurada, aceita origem HTTP local | `src/main.ts:22`; `.env.example` |
| B5 | 🟡 Médio | HSTS do helmet sem `preload` (default: `max-age=31536000; includeSubDomains`) — primeira visita HTTP continua vulnerável a strip mesmo depois de haver TLS | `src/main.ts:16` (helmet default) |
| B6 | 🟡 Médio | Cookie de sessão com `sameSite: 'none'` em produção — enviado em requests cross-site; exige que a proteção CSRF (Faixa A-4) esteja de facto implementada | `src/auth/auth.controller.ts:30` |
| B7 | 🟢 Baixo | Endpoint raiz devolve link `http://localhost:{port}/docs` hardcoded no JSON | `src/main.ts:106` |

**Headers presentes vs. em falta no backend** (com `helmet@8` default, verificado em `package.json:129`):

| Header | Estado | Valor efetivo |
|---|---|---|
| Content-Security-Policy | ✅ presente | default helmet: `default-src 'self'; script-src 'self'; object-src 'none'; frame-ancestors 'self'; upgrade-insecure-requests; …` |
| Strict-Transport-Security | ⚠️ emitido mas inerte | `max-age=31536000; includeSubDomains` — ignorado pelo browser porque a resposta chega por HTTP (B1); sem `preload` (B5) |
| X-Frame-Options | ✅ presente | `SAMEORIGIN` |
| X-Content-Type-Options | ✅ presente | `nosniff` |
| Referrer-Policy | ✅ presente | `no-referrer` |
| X-XSS-Protection | ✅ presente | `0` (valor moderno correto — o filtro legado criava vulnerabilidades) |
| Cross-Origin-Opener-Policy / Resource-Policy | ✅ presente | `same-origin` |
| X-Powered-By | ✅ removido | — |
| Redirect HTTP→HTTPS | ❌ ausente | nenhuma camada o faz (B1/B2) |

### 3.2 Frontend (`innova-frontend`)

| # | Severidade | Achado | Evidência |
|---|---|---|---|
| F1 | 🔴 Crítico | **Nenhum security header definido**: `next.config.ts` sem `headers()` — sem CSP, sem HSTS, sem X-Frame-Options, sem nosniff, sem Referrer-Policy. Página de login enquadrável em iframe (clickjacking) | `next.config.ts` (ausente) |
| F2 | 🟠 Alto | `images.remotePatterns` autoriza `protocol: "http"` com hostname `**` — mixed content de imagens explicitamente permitido de qualquer origem | `next.config.ts:10` |
| F3 | 🟠 Alto | `API_URL` definido em **4 sítios** com fallbacks inconsistentes (`lib/api.ts`, `lib/apiClient.ts`, `services/api.ts` → `http://localhost:4000`; `config/env.ts`, `app/api/users/route.ts` → `http://localhost:3000`). Se `NEXT_PUBLIC_API_URL` faltar no build de produção, o browser chama `http://localhost:4000` — mixed content + app quebrada | `git grep "http://"` no frontend |
| F4 | 🟡 Médio | Rewrite `/api/:path*` com destino hardcoded `http://localhost:4000`. É server-side (não gera mixed content no browser), mas não é parametrizável por ambiente | `next.config.ts:17` |
| F5 | 🟢 Baixo | Sem mixed content real no código atual: nenhuma chamada/script/imagem externa `http://` encontrada (o `xmlns="http://www.w3.org/2000/svg"` em `app/login/page.tsx:294` é namespace XML, não carregamento de recurso) | auditoria de `http://` |

## 4. Plano de remediação proposto (não aplicado)

> Cada bloco segue o fluxo `brainstorming → writing-plans → TDD → code review`
> antes de tocar em código. Ordem = ordem de execução.

### 4.1 🔴 Borda TLS + redirect forçado (fecha B1, B2; liga à Faixa H-2)

- Adicionar **Caddy** (TLS automático Let's Encrypt) ou nginx + certbot ao
  `ops/docker-compose.prod.yml`, como único serviço com portas públicas
  (80/443).
- App presa à rede interna do compose (remover `4000:4000` público; ou
  `127.0.0.1:4000:4000` no máximo, para debug via túnel SSH).
- Vhost `:80` → `301 https://` incondicional (nunca servir conteúdo em HTTP).
- HSTS aplicado na borda: `max-age=31536000; includeSubDomains; preload`
  (submeter a hstspreload.org só depois de estabilizar — `preload` é
  difícil de reverter).
- Renovação automática de certificado confirmada **antes** do go-live.

### 4.2 🟠 Backend — defesa em profundidade (fecha B3, B4, B5, B7)

- `app.set('trust proxy', 1)` (via `app.getHttpAdapter().getInstance()`).
- Middleware de produção: se `NODE_ENV=production` e `!req.secure`, responder
  `308` para `https://` — bloqueia downgrade mesmo se o proxy for mal
  configurado no futuro.
- Helmet explícito: `hsts: { maxAge: 31536000, includeSubDomains: true, preload: true }`.
- `ALLOWED_ORIGINS` documentado no `.env.example` e **fail-fast no bootstrap**
  se ausente/HTTP em produção (sem fallback silencioso para localhost).
- Link de docs no endpoint raiz derivado do request/env, não hardcoded.

### 4.3 🟠 Frontend — headers + fecho de mixed content (fecha F1–F4)

- `headers()` no `next.config.ts` com a CSP da secção 4.4 +
  `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`,
  `Permissions-Policy: camera=(), microphone=(), geolocation=()`.
  (HSTS pode ser emitido aqui também, mas a fonte de verdade é a borda 4.1.)
- Remover `{ protocol: "http", hostname: "**" }` dos `remotePatterns` e
  restringir o `https` aos hostnames realmente usados.
- Unificar `API_URL` num único módulo (`lib/api.ts`) com **fail-fast em
  produção** se `NEXT_PUBLIC_API_URL` faltar ou começar por `http://`;
  os restantes 3 ficheiros importam daí.
- Destino do rewrite via variável de ambiente (`API_INTERNAL_URL`).

### 4.4 CSP proposta para o frontend

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data: https:;
font-src 'self' data:;
connect-src 'self' https://<dominio-api>;
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
object-src 'none';
upgrade-insecure-requests
```

Notas:
- `upgrade-insecure-requests` converte automaticamente qualquer subrecurso
  `http://` residual em `https://` — rede de segurança contra mixed content.
- `script-src 'self'` sem `unsafe-inline`/`unsafe-eval`: o Next.js em produção
  pode exigir nonces para os scripts inline de hidratação — validar no plano
  (estratégia com nonce via middleware, padrão documentado do Next).
- `style-src 'unsafe-inline'` é concessão pragmática ao Tailwind/Next; apertar
  numa iteração posterior se viável.
- No backend (API pura, sem HTML), a CSP default do helmet é suficiente.

## 5. Critério de fecho

- [ ] B1/B2 fechados: `curl -I http://<dominio>` devolve `301/308` para HTTPS; app inacessível diretamente na :4000 pública.
- [ ] HSTS com `preload` visível em `curl -sI https://<dominio> | grep -i strict`.
- [ ] Frontend com CSP/XFO/nosniff visíveis nas respostas e login não enquadrável em iframe.
- [ ] Build de produção do frontend falha se `NEXT_PUBLIC_API_URL` for HTTP ou estiver ausente.
- [ ] Zero pedidos `http://` no separador Network do browser em todo o fluxo login → dashboard → curso.
