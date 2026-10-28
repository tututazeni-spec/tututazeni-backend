# Checklist de segurança para go-live (2026-10-27)

Verificado por leitura de código/configuração; nenhum teste foi corrido. "Confirmar" = depende do ambiente real.

| # | Ponto | Estado | Onde |
|---|---|---|---|
| 1 | HTTPS/TLS com renovação | Existe | Caddy com Cloudflare Origin CA (15 anos, modo Full strict) em `ops/caddy/Caddyfile`; certificado de borda renovado pela Cloudflare; `enforceHttpsMiddleware` + HSTS. **Confirmar**: data de expiração do Origin CA no calendário |
| 2 | Sem segredos no repo | Existe | `.env`/`.env.*` ignorados; só `.example` e `.env.test` (valores de teste) versionados; varredura de padrões de chave sem resultados |
| 3 | Env produção ≠ teste | **Implementado agora** | `validateEnv` recusa em produção segredos JWT de teste, `DATABASE_URL` com `postgres:postgres` & afins, `localhost` em `ALLOWED_ORIGINS` e `SEED_ADMIN_PASSWORD` conhecida |
| 4 | Credenciais por defeito | Existe | `prisma/seed.ts`: em produção exige `SEED_ADMIN_PASSWORD` (≥12) e não cria a conta de teste; contas `PENDING` forçam troca no 1.º login |
| 5 | Debug/stack traces | Existe | `AllExceptionsFilter` não devolve stack; Swagger e `/metrics` com token em produção; `NODE_ENV=production` no Dockerfile |
| 6 | Autenticação | Existe | Login, refresh, reset de senha com throttling; revogação de sessão; SSO OIDC/LDAP. **Confirmar** com teste dinâmico |
| 7 | RBAC | Existe | `@Roles()` + `assertCanAccess` (série A10, não exaustiva — regra 14 do CLAUDE.md) |
| 8 | Isolamento de tenants | Existe | RLS no Postgres (`ops/db/rls/`), `set_config` por transacção. **Confirmar** com teste cruzado entre clientes em staging |
| 9 | OWASP Top 10 | Existe | Só Prisma (sem SQL cru), DOMPurify/CSP no frontend, CSRF double-submit. **Pendente**: `CSRF_TOKEN_STRICT=true` a partir de 2026-11-01 |
| 10 | Headers e CORS | Existe | `helmet`, CSP com nonce, CORS por allowlist https sem wildcard (`allowed-origins.ts`) |
| 11 | Rate limiting | Existe | `ThrottlerModule` global + `@Throttle` em login/refresh/reset/uploads; limite por chave na API pública |
| 12 | Dependências | Verificado | `npm audit --omit=dev`: 0 críticas, 0 altas, 6 moderadas |
| 13 | Firewall/portas | Existe | `ops/deploy/origin-firewall.sh` (80/443 só Cloudflare); Prometheus/Alertmanager/Grafana em `127.0.0.1`; Postgres e Redis sem porta publicada no compose de produção |
