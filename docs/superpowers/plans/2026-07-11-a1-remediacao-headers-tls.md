# Remediação A-1 (TLS, redirect e headers) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar os achados da auditoria A-1 — borda TLS com redirect forçado HTTP→HTTPS, hardening do backend NestJS e security headers/CSP no frontend Next.js.

**Architecture:** Caddy como única porta pública do VPS (80/443, TLS Let's Encrypt automático, HSTS na borda) com `{DOMAIN}/api/*` a fazer proxy para o Nest (porta 4000 presa a localhost). Backend ganha defesa em profundidade (trust proxy, 308 anti-downgrade, ALLOWED_ORIGINS fail-fast, cookie `lax`). Frontend passa a chamar `/api` relativo (same-origin) e define CSP + headers via `next.config.ts`. Spec: `docs/superpowers/specs/2026-07-11-a1-headers-remediacao-design.md`.

**Tech Stack:** NestJS/Express + helmet@8, Jest (`--forceExit`), Caddy 2 (docker compose), Next.js (App Router).

## Global Constraints

- **NUNCA correr `lint`, `format:check` ou `build` locais** — validação é do CI (check `quality` bloqueante). Correr apenas os specs Jest indicados em cada task.
- Hooks Husky: `git commit --no-verify` / `git push --no-verify` autorizados (máquina lenta).
- Rede instável: se `git push`/`gh` pendurar, usar `git -c http.version=HTTP/1.1 push --no-verify …` e repetir até 3× (sleep 10). Preferir a shell **Bash**; a sessão PowerShell tende a ficar presa.
- Testes backend: `npm run test -- <caminho-do-spec>` (equivale a `jest --forceExit <caminho>`).
- Commits: Conventional Commits em português técnico, terminados com `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Frontend **não tem test runner** — não introduzir um (YAGNI). Validação = CI `quality.yml` (build) na PR + review.
- PR ① = repo `innova` (branch `feat/a1-remediacao-headers-tls`, já existe com o spec commitado). PR ② = repo `innova-frontend` (branch `feat/a1-security-headers`, criar na Task 7). Working dirs: `C:\Users\Placido Costa\innova` e `C:\Users\Placido Costa\innova-frontend`.

---

## PR ① — repo `innova`

### Task 1: Middleware anti-downgrade (`enforce-https`)

**Files:**
- Create: `src/common/security/enforce-https.ts`
- Test: `src/common/security/enforce-https.spec.ts`

**Interfaces:**
- Consumes: nada (módulo folha).
- Produces: `httpsRedirectTarget(proto: string | undefined, host: string | undefined, url: string, isProd: boolean): string | null` e `enforceHttpsMiddleware(isProd: boolean): (req, res, next) => void` — usados na Task 4 (`main.ts`).

- [ ] **Step 1: Write the failing test**

```typescript
// src/common/security/enforce-https.spec.ts
import { httpsRedirectTarget, enforceHttpsMiddleware } from './enforce-https';

describe('httpsRedirectTarget', () => {
  it('devolve o URL https quando x-forwarded-proto é http em produção', () => {
    expect(httpsRedirectTarget('http', 'innova.example.com', '/auth/login', true)).toBe(
      'https://innova.example.com/auth/login',
    );
  });

  it('usa o primeiro valor quando o header é lista (proxy encadeado)', () => {
    expect(httpsRedirectTarget('http, https', 'innova.example.com', '/x', true)).toBe(
      'https://innova.example.com/x',
    );
  });

  it('não redirige sem header (healthcheck interno do Docker)', () => {
    expect(httpsRedirectTarget(undefined, 'localhost:4000', '/health/ready', true)).toBeNull();
  });

  it('não redirige quando o protocolo já é https', () => {
    expect(httpsRedirectTarget('https', 'innova.example.com', '/x', true)).toBeNull();
  });

  it('não redirige fora de produção', () => {
    expect(httpsRedirectTarget('http', 'localhost:3000', '/x', false)).toBeNull();
  });

  it('não redirige sem host (não há para onde)', () => {
    expect(httpsRedirectTarget('http', undefined, '/x', true)).toBeNull();
  });
});

describe('enforceHttpsMiddleware', () => {
  function run(isProd: boolean, headers: Record<string, string>, originalUrl = '/cursos') {
    const req = { headers, originalUrl } as never;
    const redirect = jest.fn();
    const next = jest.fn();
    enforceHttpsMiddleware(isProd)(req, { redirect } as never, next);
    return { redirect, next };
  }

  it('responde 308 para https quando o proxy reporta http', () => {
    const { redirect, next } = run(true, {
      'x-forwarded-proto': 'http',
      host: 'innova.example.com',
    });
    expect(redirect).toHaveBeenCalledWith(308, 'https://innova.example.com/cursos');
    expect(next).not.toHaveBeenCalled();
  });

  it('segue em frente no healthcheck interno (sem x-forwarded-proto)', () => {
    const { redirect, next } = run(true, { host: 'localhost:4000' });
    expect(redirect).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (Bash, em `C:\Users\Placido Costa\innova`): `npm run test -- src/common/security/enforce-https.spec.ts`
Expected: FAIL — `Cannot find module './enforce-https'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/common/security/enforce-https.ts
// Defesa em profundidade contra downgrade de protocolo (auditoria A-1, achado B2).
// O Caddy já redirecciona HTTP na borda; isto protege contra um proxy futuro
// mal configurado. Usa o header explícito (e não req.secure) de propósito: o
// healthcheck do Docker bate directo na :4000 sem X-Forwarded-Proto e tem de
// continuar a passar — senão o health gate do deploy parte.
import { Request, Response, NextFunction } from 'express';

export function httpsRedirectTarget(
  proto: string | undefined,
  host: string | undefined,
  url: string,
  isProd: boolean,
): string | null {
  if (!isProd || !host) return null;
  const first = proto?.split(',')[0]?.trim();
  if (first !== 'http') return null;
  return `https://${host}${url}`;
}

export function enforceHttpsMiddleware(isProd: boolean) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const target = httpsRedirectTarget(
      req.headers['x-forwarded-proto'] as string | undefined,
      req.headers.host,
      req.originalUrl,
      isProd,
    );
    if (target) {
      res.redirect(308, target);
      return;
    }
    next();
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/common/security/enforce-https.spec.ts`
Expected: PASS (8 testes)

- [ ] **Step 5: Commit**

```bash
git add src/common/security/enforce-https.ts src/common/security/enforce-https.spec.ts
git commit --no-verify -m "feat(security): middleware anti-downgrade 308 (isento para healthcheck interno)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task 2: Validação fail-fast de `ALLOWED_ORIGINS`

**Files:**
- Create: `src/common/security/allowed-origins.ts`
- Test: `src/common/security/allowed-origins.spec.ts`
- Modify: `.env.example` (acrescentar bloco `ALLOWED_ORIGINS`)

**Interfaces:**
- Consumes: nada.
- Produces: `parseAllowedOrigins(raw: string | undefined, isProd: boolean): string[]` — usado na Task 4 (`main.ts`).

- [ ] **Step 1: Write the failing test**

```typescript
// src/common/security/allowed-origins.spec.ts
import { parseAllowedOrigins } from './allowed-origins';

describe('parseAllowedOrigins', () => {
  it('em dev sem valor devolve o fallback localhost', () => {
    expect(parseAllowedOrigins(undefined, false)).toEqual(['http://localhost:3000']);
  });

  it('em dev com valor devolve a lista (trim aplicado)', () => {
    expect(parseAllowedOrigins('http://localhost:3000, http://localhost:5173', false)).toEqual([
      'http://localhost:3000',
      'http://localhost:5173',
    ]);
  });

  it('em produção sem valor lança erro (sem fallback silencioso)', () => {
    expect(() => parseAllowedOrigins(undefined, true)).toThrow(/ALLOWED_ORIGINS/);
    expect(() => parseAllowedOrigins('  ', true)).toThrow(/ALLOWED_ORIGINS/);
  });

  it('em produção rejeita origens http://', () => {
    expect(() => parseAllowedOrigins('https://ok.example.com,http://mau.example.com', true)).toThrow(
      /http:\/\/mau\.example\.com/,
    );
  });

  it('em produção aceita lista https válida', () => {
    expect(parseAllowedOrigins('https://innova.example.com', true)).toEqual([
      'https://innova.example.com',
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/common/security/allowed-origins.spec.ts`
Expected: FAIL — `Cannot find module './allowed-origins'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/common/security/allowed-origins.ts
// CORS fail-fast (auditoria A-1, achado B4): em produção a lista é obrigatória
// e só aceita https:// — acabou o fallback silencioso para localhost.
export function parseAllowedOrigins(raw: string | undefined, isProd: boolean): string[] {
  const origins = (raw ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  if (!isProd) {
    return origins.length ? origins : ['http://localhost:3000'];
  }

  if (!origins.length) {
    throw new Error(
      'ALLOWED_ORIGINS é obrigatório em produção (lista separada por vírgulas, apenas origens https://)',
    );
  }

  const insecure = origins.filter((o) => !o.startsWith('https://'));
  if (insecure.length) {
    throw new Error(
      `ALLOWED_ORIGINS em produção só aceita origens https:// — inválidas: ${insecure.join(', ')}`,
    );
  }

  return origins;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/common/security/allowed-origins.spec.ts`
Expected: PASS (5 testes)

- [ ] **Step 5: Documentar no `.env.example`**

Em `.env.example`, substituir a linha `FRONTEND_URL=http://localhost:5173` por:

```bash
FRONTEND_URL=http://localhost:5173

# ─── CORS ───
# Lista separada por vírgulas. Em produção é OBRIGATÓRIA e só aceita https://
# (o bootstrap falha de propósito se faltar — auditoria A-1).
ALLOWED_ORIGINS=http://localhost:3000
```

- [ ] **Step 6: Commit**

```bash
git add src/common/security/allowed-origins.ts src/common/security/allowed-origins.spec.ts .env.example
git commit --no-verify -m "feat(security): ALLOWED_ORIGINS fail-fast em producao (so https)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task 3: Cookie de sessão `sameSite: 'lax'`

**Files:**
- Create: `src/auth/token-cookie.ts`
- Test: `src/auth/token-cookie.spec.ts`
- Modify: `src/auth/auth.controller.ts:21-33` (remover constantes locais, importar do novo módulo)

**Interfaces:**
- Consumes: nada.
- Produces: `TOKEN_COOKIE: string` e `buildTokenCookieOptions(isProd: boolean): CookieOptions` — usados por `auth.controller.ts`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/auth/token-cookie.spec.ts
import { TOKEN_COOKIE, buildTokenCookieOptions } from './token-cookie';

describe('token-cookie', () => {
  it('o nome do cookie é "token" (o middleware do frontend depende disto)', () => {
    expect(TOKEN_COOKIE).toBe('token');
  });

  it('usa sameSite lax em todos os ambientes (frontend e API são same-site)', () => {
    expect(buildTokenCookieOptions(true).sameSite).toBe('lax');
    expect(buildTokenCookieOptions(false).sameSite).toBe('lax');
  });

  it('exige secure e httpOnly em produção', () => {
    const prod = buildTokenCookieOptions(true);
    expect(prod.secure).toBe(true);
    expect(prod.httpOnly).toBe(true);
    expect(prod.path).toBe('/');
    expect(prod.maxAge).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('em dev não exige secure (não há TLS local)', () => {
    expect(buildTokenCookieOptions(false).secure).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/auth/token-cookie.spec.ts`
Expected: FAIL — `Cannot find module './token-cookie'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/auth/token-cookie.ts
// Cookie httpOnly que transporta o access token. JS no browser nunca lê este
// valor (mitiga XSS). sameSite 'lax' em todos os ambientes: em produção o
// frontend e a API são servidos no MESMO domínio atrás da borda Caddy
// (spec 2026-07-11-a1-headers-remediacao-design.md) — 'none' era necessário
// apenas no antigo layout cross-site e alargava a superfície CSRF.
import { CookieOptions } from 'express';

export const TOKEN_COOKIE = 'token';

export function buildTokenCookieOptions(isProd: boolean): CookieOptions {
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 dias (sessão); o JWT em si expira antes
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/auth/token-cookie.spec.ts`
Expected: PASS (4 testes)

- [ ] **Step 5: Usar o módulo no controller**

Em `src/auth/auth.controller.ts`, apagar as linhas 21-33 (bloco `const isProd …` até `};` de `tokenCookieOptions`) e substituir por:

```typescript
import { TOKEN_COOKIE, buildTokenCookieOptions } from './token-cookie';

const tokenCookieOptions = buildTokenCookieOptions(process.env.NODE_ENV === 'production');
```

(A linha de import junta-se aos imports existentes no topo; a constante fica no lugar do bloco removido. Nada mais muda — `res.cookie`/`clearCookie` continuam a usar `TOKEN_COOKIE` e `tokenCookieOptions`.)

- [ ] **Step 6: Confirmar que os specs de auth continuam verdes**

Run: `npm run test -- src/auth`
Expected: PASS (auth.controller.spec, auth.service.spec, jwt.strategy.spec, token-cookie.spec)

- [ ] **Step 7: Commit**

```bash
git add src/auth/token-cookie.ts src/auth/token-cookie.spec.ts src/auth/auth.controller.ts
git commit --no-verify -m "feat(auth): cookie de sessao sameSite lax (same-site atras da borda)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task 4: Wiring no `main.ts` (trust proxy, HSTS, middleware, CORS, link docs)

**Files:**
- Modify: `src/main.ts:15-25` (secções Security e CORS) e `src/main.ts:101-109` (endpoint raiz)

**Interfaces:**
- Consumes: `enforceHttpsMiddleware(isProd)` (Task 1), `parseAllowedOrigins(raw, isProd)` (Task 2).
- Produces: nada (bootstrap).

- [ ] **Step 1: Editar o bloco Security/CORS**

Em `src/main.ts`, acrescentar aos imports:

```typescript
import { enforceHttpsMiddleware } from './common/security/enforce-https';
import { parseAllowedOrigins } from './common/security/allowed-origins';
```

Substituir o bloco actual (linhas 15-25):

```typescript
  // ─── Security ────────────────────────────────────────────────────────────
  app.use(helmet());
  app.use(compression());
  app.use(cookieParser());

  // ─── CORS ────────────────────────────────────────────────────────────────
  app.enableCors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') ?? ['http://localhost:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
```

por:

```typescript
  // ─── Security ────────────────────────────────────────────────────────────
  const isProd = process.env.NODE_ENV === 'production';

  // Atrás da borda Caddy: X-Forwarded-* passam a alimentar req.secure/req.ip.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  app.use(
    helmet({
      // Coerente com o HSTS emitido pela borda (auditoria A-1, achado B5).
      hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    }),
  );
  app.use(enforceHttpsMiddleware(isProd));
  app.use(compression());
  app.use(cookieParser());

  // ─── CORS ────────────────────────────────────────────────────────────────
  app.enableCors({
    origin: parseAllowedOrigins(process.env.ALLOWED_ORIGINS, isProd),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
```

- [ ] **Step 2: Corrigir o link de docs no endpoint raiz**

No mesmo ficheiro, no handler da raiz (linhas 101-109), mudar o parâmetro de `_req` para `req` e a linha do `docs:`:

```typescript
  app.getHttpAdapter().get('/', (req: Request, res: Response) => {
    res.json({
      name: 'INNOVA API',
      version: '1.0',
      status: 'running',
      docs: `${req.protocol}://${req.get('host')}/docs`,
      timestamp: new Date().toISOString(),
    });
  });
```

(A referência à variável `port` desaparece deste bloco — `req.get('host')` já traz host+porta.)

- [ ] **Step 3: Correr os specs de segurança (sanidade do wiring)**

Run: `npm run test -- src/common/security`
Expected: PASS (enforce-https + allowed-origins). A compilação completa é validada pelo CI na PR.

- [ ] **Step 4: Commit**

```bash
git add src/main.ts
git commit --no-verify -m "feat(security): trust proxy, HSTS preload, anti-downgrade e CORS fail-fast no bootstrap

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task 5: Borda Caddy (compose, Caddyfile, env, runbook)

**Files:**
- Create: `ops/caddy/Caddyfile`
- Modify: `ops/docker-compose.prod.yml` (serviço `app` linhas 11-12; novo serviço `caddy`; volumes)
- Modify: `ops/.env.production.example` (bloco Borda TLS)
- Modify: `docs/deploy/runbook.md` (ufw, SMOKE_BASE_URL, DNS, curl de verificação)

**Interfaces:**
- Consumes: nada dos tasks anteriores (camada ops).
- Produces: serviço `caddy` no compose; vars `DOMAIN`/`ACME_EMAIL` no `.env.production`.

- [ ] **Step 1: Criar `ops/caddy/Caddyfile`**

```caddyfile
# Borda TLS do INNOVA (auditoria A-1). Única porta pública do VPS.
# {$DOMAIN} e {$ACME_EMAIL} vêm do ambiente do container (env_file .env.production).
# Redirect HTTP→HTTPS: automático do Caddy — nunca serve conteúdo em :80.
{
	email {$ACME_EMAIL}
}

{$DOMAIN} {
	# HSTS emitido na borda; CSP/XFO/nosniff são responsabilidade das apps.
	# preload: submeter a hstspreload.org só depois do TLS estabilizar.
	header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"

	# API: strip do prefixo /api → Nest (Swagger fica em /api/docs).
	handle_path /api/* {
		reverse_proxy app:4000
	}

	# Frontend ainda não deployado (fica para a Faixa H). Quando existir:
	# handle {
	# 	reverse_proxy frontend:3000
	# }
	handle {
		respond "Not Found" 404
	}
}
```

- [ ] **Step 2: Alterar o compose de produção**

Em `ops/docker-compose.prod.yml`:

1. No serviço `app`, substituir:

```yaml
    ports:
      - '4000:4000'
```

por:

```yaml
    ports:
      - '127.0.0.1:4000:4000' # debug só via túnel SSH; público é o Caddy
```

2. Acrescentar o serviço `caddy` (depois do bloco `app`, antes de `redis`):

```yaml
  # ─── Borda TLS (auditoria A-1) — única porta pública do VPS ───
  caddy:
    image: caddy:2-alpine
    container_name: innova-caddy
    env_file: .env.production # DOMAIN e ACME_EMAIL para o Caddyfile
    ports:
      - '80:80'
      - '443:443'
      - '443:443/udp' # HTTP/3
    volumes:
      - ./caddy/Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data # certificados ACME — persistir entre deploys
      - caddy-config:/config
    depends_on:
      - app
    restart: unless-stopped
```

3. No bloco `volumes:` final, acrescentar:

```yaml
  caddy-data:
  caddy-config:
```

- [ ] **Step 3: Validar o Caddyfile (best effort)**

Run (Bash, na raiz do repo):

```bash
docker run --rm -e DOMAIN=innova.example.com -e ACME_EMAIL=ops@example.com \
  -v "$PWD/ops/caddy/Caddyfile:/etc/caddy/Caddyfile:ro" \
  caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile
```

Expected: `Valid configuration`. Se o Docker não estiver disponível na máquina, registar como não-validado e seguir (a review cobre; o formato é simples).

- [ ] **Step 4: Env example e runbook**

Em `ops/.env.production.example`, acrescentar depois do bloco `# ─── CORS / frontend ───`:

```bash
# ─── Borda TLS (Caddy — auditoria A-1) ───
# Domínio público que aponta ao VPS (DNS configurado ANTES do primeiro arranque,
# senão o Let's Encrypt falha a emissão e aplica rate-limit).
DOMAIN=innova.example.com
ACME_EMAIL=ops@example.com
```

Em `docs/deploy/runbook.md`:

1. Linha 21, substituir `ufw allow OpenSSH && ufw allow 4000/tcp && ufw enable` por:

```bash
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw enable
# A porta 4000 NÃO se abre: a app está presa a 127.0.0.1; público é só o Caddy.
```

2. Na secção 1, acrescentar ao parágrafo de requisitos: `Pré-requisito: DNS do DOMAIN a apontar ao IP do VPS antes do primeiro arranque do Caddy (emissão Let's Encrypt).`

3. Na tabela de secrets (linha 53), mudar o exemplo de `SMOKE_BASE_URL` de `http://<HOST>:4000` para `https://<DOMAIN>/api`.

4. Secção 4, passo 3: mudar `curl http://<HOST>:4000/health/ready` para `curl https://<DOMAIN>/api/health/ready` e acrescentar linha: `curl -I http://<DOMAIN>  # deve responder 308 https`.

- [ ] **Step 5: Commit**

```bash
git add ops/caddy/Caddyfile ops/docker-compose.prod.yml ops/.env.production.example docs/deploy/runbook.md
git commit --no-verify -m "feat(ops): borda Caddy com TLS automatico e redirect forcado; porta 4000 presa a localhost

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task 6: Ship da PR ①

**Files:** nenhum novo (branch `feat/a1-remediacao-headers-tls` com os commits das Tasks 1-5 + spec).

- [ ] **Step 1: Correr a suite de segurança/auth completa uma última vez**

Run: `npm run test -- src/common/security src/auth`
Expected: PASS total.

- [ ] **Step 2: Push + PR + auto-merge (Bash)**

```bash
cd "/c/Users/Placido Costa/innova"
git -c http.version=HTTP/1.1 push --no-verify -u origin feat/a1-remediacao-headers-tls
gh pr create --title "feat(security): remediacao A-1 — borda TLS, anti-downgrade e hardening de headers" \
  --body "Implementa o spec docs/superpowers/specs/2026-07-11-a1-headers-remediacao-design.md (PR 1/2): borda Caddy (TLS automatico + redirect 308 + HSTS preload), trust proxy, middleware anti-downgrade, ALLOWED_ORIGINS fail-fast, cookie sameSite lax e link de docs dinamico. Fecha os achados B1-B7 do relatorio docs/security/2026-07-10-auditoria-a1-headers-comunicacao.md.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
gh pr merge --auto --squash --delete-branch
```

Expected: PR criada; auto-merge armado; o check `quality` (CI) valida lint+build+testes. Se o push pendurar >3 min, matar e repetir com retry (Global Constraints).

---

## PR ② — repo `innova-frontend` (working dir `C:\Users\Placido Costa\innova-frontend`)

### Task 7: Security headers, CSP e rewrite parametrizado (`next.config.ts`)

**Files:**
- Modify: `next.config.ts` (substituição completa)
- Modify: `.env.example` (substituição completa)

**Interfaces:**
- Consumes: nada.
- Produces: env server-side `API_INTERNAL_URL` (usada também na Task 8 pelo route handler).

- [ ] **Step 1: Criar a branch**

```bash
cd "/c/Users/Placido Costa/innova-frontend"
git checkout main && git pull --ff-only
git checkout -b feat/a1-security-headers
```

- [ ] **Step 2: Substituir `next.config.ts` por completo**

```typescript
import type { NextConfig } from "next";

// Security headers (auditoria A-1, achados F1/F2). HSTS é emitido pela borda
// Caddy — aqui ficam os headers de conteúdo. `script-src 'unsafe-inline'` é a
// concessão aos scripts inline de hidratação do App Router; migrar para nonces
// (via middleware) é iteração futura registada no spec.
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
      "upgrade-insecure-requests",
    ].join("; "),
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  experimental: {
    reactCompiler: true,
  },
  images: {
    // https apenas — imagens http:// eram mixed content (achado F2).
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  async rewrites() {
    return [
      {
        // Proxy de dev para o Nest. Em produção o Caddy interceta /api antes
        // de chegar ao Next — este rewrite fica inerte.
        source: "/api/:path*",
        destination: `${process.env.API_INTERNAL_URL ?? "http://localhost:4000"}/:path*`,
      },
    ];
  },
};

export default nextConfig;
```

- [ ] **Step 3: Substituir `.env.example` por completo**

```bash
# Destino interno (server-side) do proxy /api em dev e dos route handlers.
# NUNCA é exposto ao browser — o browser chama sempre /api relativo.
API_INTERNAL_URL=http://localhost:4000
```

- [ ] **Step 4: Commit**

```bash
git add next.config.ts .env.example
git commit --no-verify -m "feat(security): CSP e security headers em todas as rotas; remotePatterns so https

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task 8: `API_URL` unificado — browser chama sempre `/api` relativo

**Files:**
- Modify: `lib/api.ts:1`, `lib/apiClient.ts:14-17`, `services/api.ts:1-3`, `config/env.ts` (completo), `app/login/page.tsx:5`, `components/Topbar.tsx:11`, `components/Sidebar.tsx:131`, `components/ui/PdfDownloadButton.tsx:30`, `lib/auth.ts:8`, `lib/http.ts:12`, `app/api/users/route.ts:4`

**Interfaces:**
- Consumes: `API_INTERNAL_URL` (Task 7).
- Produces: `API_URL = '/api'` exportado de `lib/api.ts` — fonte única para todo o frontend.

- [ ] **Step 1: `lib/api.ts` — tornar canónico**

Substituir a linha 1 por:

```typescript
// Base única da API (auditoria A-1, achado F3): caminho relativo same-origin.
// Em dev o rewrite do next.config.ts faz proxy para o Nest; em produção o
// Caddy interceta /api na borda. Zero dependência de NEXT_PUBLIC_API_URL.
export const API_URL = '/api';
```

- [ ] **Step 2: `lib/apiClient.ts` — importar em vez de redefinir**

Substituir as linhas 16-17 (`export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';`) por:

```typescript
import { API_URL } from './api';

export { API_URL };
```

(O import junta-se ao de `./performanceMonitor` no topo; o re-export mantém compatível quem importava `API_URL` de `apiClient`.)

- [ ] **Step 3: `services/api.ts`**

Substituir as linhas 1-3 por:

```typescript
import axios from "axios";
import { API_URL } from "@/lib/api";
```

e na criação da instância (linha 8 actual) usar `baseURL: API_URL` — a constante local `API_URL` desaparece; o resto do ficheiro não muda.

- [ ] **Step 4: `config/env.ts` — substituição completa**

```typescript
import { API_URL } from "@/lib/api";

export const env = {
  API_URL,
};
```

- [ ] **Step 5: `app/login/page.tsx`**

Substituir a linha 5 (`const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';`) por:

```typescript
import { API_URL } from "@/lib/api";
```

(vai para junto do `import { useState } from "react";`; o resto do ficheiro usa `API_URL` sem alterações.)

- [ ] **Step 6: `components/Topbar.tsx`**

Acrescentar `import { API_URL } from "@/lib/api";` aos imports e substituir a linha 11 (`const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "";`) por:

```typescript
    const apiUrl = API_URL;
```

- [ ] **Step 7: `components/Sidebar.tsx`**

Acrescentar `import { API_URL } from "@/lib/api";` aos imports e substituir na linha 131:

```typescript
    void fetch(`${API_URL}/auth/logout`, {
```

- [ ] **Step 8: `components/ui/PdfDownloadButton.tsx`**

Acrescentar `import { API_URL } from "@/lib/api";` aos imports e substituir na linha 30:

```typescript
        `${API_URL}/pdf/${type}/${id}`,
```

- [ ] **Step 9: `lib/auth.ts` e `lib/http.ts`**

Em ambos, substituir a linha `const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';` por:

```typescript
import { API_URL } from './api';

const API_BASE = API_URL;
```

(Em `lib/http.ts` a função `isApiRequest` continua correcta: `/api/...` começa por `/` e por `API_BASE`.)

- [ ] **Step 10: `app/api/users/route.ts` (server-side)**

Substituir a linha 4 por:

```typescript
  const apiUrl = process.env.API_INTERNAL_URL || "http://localhost:4000";
```

(Corrige também a porta errada 3000 — o Nest está na 4000.)

- [ ] **Step 11: Verificar que não resta nenhum uso**

Run: `git grep -n "NEXT_PUBLIC_API_URL" -- ':!*.md'`
Expected: **0 resultados** (só documentação histórica em .md pode referir).

- [ ] **Step 12: Commit**

```bash
git add lib/api.ts lib/apiClient.ts lib/auth.ts lib/http.ts services/api.ts config/env.ts app/login/page.tsx app/api/users/route.ts components/Topbar.tsx components/Sidebar.tsx components/ui/PdfDownloadButton.tsx
git commit --no-verify -m "refactor(api): base unica /api relativo same-origin; elimina NEXT_PUBLIC_API_URL e fallbacks http

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task 9: Ship da PR ②

**Files:** nenhum novo (branch `feat/a1-security-headers` com os commits das Tasks 7-8).

- [ ] **Step 1: Push + PR (Bash)**

```bash
cd "/c/Users/Placido Costa/innova-frontend"
git -c http.version=HTTP/1.1 push --no-verify -u origin feat/a1-security-headers
gh pr create --title "feat(security): CSP + security headers e API_URL unificado /api (remediacao A-1)" \
  --body "PR 2/2 da remediacao A-1 (spec no repo backend: docs/superpowers/specs/2026-07-11-a1-headers-remediacao-design.md): headers() com CSP/XFO/nosniff/Referrer-Policy/Permissions-Policy, remotePatterns so https, e base unica /api relativo (elimina NEXT_PUBLIC_API_URL e 4 fallbacks http inconsistentes — achados F1-F4).

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

- [ ] **Step 2: Merge**

```bash
gh pr merge --auto --squash --delete-branch
```

Se falhar com "Auto merge is not allowed", aguardar o CI (`gh pr checks --watch`) e fazer `gh pr merge --squash --delete-branch` quando verde. O build do CI é a validação de compilação de toda a Task 8.

---

## Verificação pós-deploy (fica no runbook; não bloqueia as PRs)

Quando houver domínio + VPS activos: `curl -I http://<DOMAIN>` → 308/301 https; `curl -sI https://<DOMAIN>/api/health/ready | grep -i strict` → HSTS com preload; `:4000` inacessível de fora; fluxo login→dashboard sem nenhum pedido `http://` no Network.
