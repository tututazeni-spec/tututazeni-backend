# Auditoria de segurança em produção — relatório consolidado (2026-10-27)

Consolida as auditorias A1–A10 (`docs/security/`), `docs/seguranca-pendentes.md` e uma passagem nova sobre a **infraestrutura** (`Dockerfile`, `ops/`, `.github/workflows/`, arranque em `src/main.ts`).

**Método:** leitura de código e configuração. Não foram corridos testes dinâmicos (pentest, DAST, carga) nem a aplicação — por decisão explícita. Tudo o que está marcado "por confirmar em produção" depende de variáveis/estado do ambiente real que este repositório não mostra.

## 1. Severidade e estado

| # | Área | Achado | Gravidade | Estado |
|---|---|---|---|---|
| 1 | Autorização | IDOR em endpoints de escrita; a série A10 não é garantidamente exaustiva (`leader.approvePlan` já escapou uma vez) | Alta | Mitigado (A10-1…24); **risco residual** — confirmar por método |
| 2 | Autenticação | Sessões não invalidadas na troca de senha, passwords em queries, escalada RH→ADMIN | Alta | Corrigido (#60, #67, #402, #412) |
| 3 | CSRF | Token double-submit existe mas `CSRF_TOKEN_STRICT=false` — escritas aceites só com `X-Requested-With` | Média | **Pendente** — activar a partir de 2026-11-01 |
| 4 | Injecção | Só Prisma; único `$queryRawUnsafe` com string fixa; regra ESLint contra SQL inseguro | Baixa | Corrigido |
| 5 | XSS armazenado | Campos de URL sem filtro de protocolo (`javascript:`) | Média | Corrigido em 17 campos (2026-10-25) + **mais 7 campos nesta passagem** (ver §3) |
| 6 | Uploads | Conteúdo real não verificado, SVG/HTML aceites | Alta | Corrigido (#411, #413, A5/A9) |
| 7 | Segredos | Placeholders `CHANGE_ME` aceites em produção; sem aviso para JWT curto/igual ao refresh | Média | **Corrigido nesta passagem** (`validate-env.ts`) |
| 8 | Infra — Redis | Redis de produção sem `requirepass`: qualquer contentor comprometido na rede Docker acedia a filas, throttler e cache | Média | **Corrigido nesta passagem** (compose + `.env.production.example`) |
| 9 | Infra — borda | `/api/metrics` alcançável pelo domínio público (protegido só pelo guard por token) | Baixa | **Corrigido nesta passagem** (Caddy responde 404) |
| 10 | Infra — contentores | `app`, `frontend` e `caddy` sem `no-new-privileges` nem `cap_drop` | Baixa | **Corrigido nesta passagem** (não testado — ver §4) |
| 11 | CI/CD | Workflows sem `permissions:` de topo → `GITHUB_TOKEN` com permissões por omissão | Média | **Corrigido nesta passagem** |
| 12 | CSP | `style-src 'unsafe-inline'` | Baixa | **Pendente** — exige nonces de estilo + teste visual |
| 13 | Dados antigos | Registos já gravados com `javascript:` continuam na BD (o `safeHref` cobre a renderização) | Baixa | **Pendente** — query de verificação em §3 |
| 14 | Auditoria/compliance | Dois `AuditService` paralelos; registos antigos fora da cadeia SHA-256 | Informativa | Unificado (regra 12 do CLAUDE.md) |
| 15 | Dependências | Imagens Docker por tag (não por digest); GitHub Actions por tag (`@v3`), não por SHA | Baixa | **Aberto** — recomendação |

## 2. Cenários de ataque (os que motivaram correcções)

**Redis sem senha (#8).** Atacante explora uma vulnerabilidade no `frontend` ou num serviço de monitorização → ganha execução num contentor da rede `innova_default` → `redis-cli -h redis` sem credenciais → lê/escreve filas Bull (injecta jobs que a app executa), apaga contadores do throttler (anula o rate limiting do login) e envenena a cache de utilizadores (`JWT_USER_CACHE_TTL_MS`). Com `requirepass`, precisa também do segredo.

**Segredo placeholder (#7).** Deploy com `.env.production` copiado do exemplo sem substituir `JWT_REFRESH_SECRET=CHANGE_ME` → o valor é público no repositório → qualquer pessoa forja refresh tokens válidos. Agora a aplicação recusa arrancar.

**`/api/metrics` público (#9).** O endpoint revela rotas, volumes e latências por endpoint (reconhecimento) e, com um `METRICS_TOKEN` fraco, é um alvo de brute-force. A borda passa a não o expor.

**`GITHUB_TOKEN` com permissões por omissão (#11).** Uma action de terceiros comprometida (as actions estão por tag, não por SHA) num job sem `permissions:` herdava a permissão por omissão do repositório, potencialmente de escrita.

**CSRF sem modo estrito (#3).** Com `false`, um pedido cross-site que consiga o cabeçalho `X-Requested-With` (p.ex. via CORS mal configurado numa origem confiada) escreve em nome da vítima sem token. A mitigação actual é `SameSite=Lax` + CORS restrito; o modo estrito fecha a lacuna.

## 3. O que foi alterado nesta passagem

**Validação de URLs/ficheiros (backend)**
- Novo `@IsWebLinkOrInlineFile()` (`src/common/validators/is-web-link-or-inline-file.decorator.ts`): http(s) OU data URL base64 com MIME na allowlist e tamanho ≤ 5 MB. Aplicado a `courses.contentUrl` (2 DTOs) e `assessments.mediaUrl`.
- `@IsWebLink()` em `live-classes.meetingUrl` e `live-classes.recordingUrl` (2 DTOs).
- `@IsOptionalImageRef(FILE_POLICIES.IMAGE)` em `events.bannerUrl`, `events.photoUrl` e `crm-beneficiaries.photoUrl` (imagem png/jpeg/webp verificada pelos bytes, ou URL).

**Infra e configuração**
- `ops/docker-compose.prod.yml`: Redis com `--requirepass` e healthcheck autenticado; `no-new-privileges` + `cap_drop: ALL` em `app` e `frontend`; `caddy` com `cap_drop: ALL` + `NET_BIND_SERVICE`.
- `ops/caddy/Caddyfile`: `/api/metrics*` → 404 no domínio público.
- `ops/.env.production.example`: `REDIS_PASSWORD`.
- `src/common/bootstrap/validate-env.ts`: em produção, falha o arranque se `JWT_SECRET`, `JWT_REFRESH_SECRET`, `SWAGGER_TOKEN` ou `METRICS_TOKEN` forem placeholders; avisa (sem bloquear) se `JWT_SECRET` < 32 caracteres, igual ao refresh, ou se não há `REDIS_PASSWORD`.
- `.github/workflows/deploy.yml` e `quality.yml`: `permissions: contents: read` de topo.

**Query para os dados antigos (item 13)** — correr em leitura, por coluna (Postgres):
```sql
SELECT id FROM "<tabela>" WHERE "<coluna>" ~* '^\s*(javascript|data|vbscript):';
```
Colunas a verificar: `Event.meetingUrl/bannerUrl`, `LiveClass.meetingUrl/recordingUrl`, `Lesson.contentUrl`, `Question.mediaUrl`, `User.linkedinUrl`, `Partner.contractUrl`, `Disbursement.proofUrl`, `NotificationLog`/`Notification.actionUrl`. (Nomes de tabela por confirmar no `schema.prisma`; `data:` é legítimo em ficheiros inline — só interessam os que não são imagens/PDF.)

## 4. Pendente e porquê não foi feito

| Item | Motivo | Quando / como |
|---|---|---|
| `CSRF_TOKEN_STRICT=true` | As sessões anteriores a `49f2523` não têm o cookie `csrf_token`; com `true` as escritas dariam 403 até novo login. Hoje é 2026-10-27. | A partir de **2026-11-01**: pôr `true` no `.env` de produção e nos dois `.example`, reiniciar, verificar 403 sem `X-CSRF-Token` e OK com ele |
| Confirmar `IMG_ALLOWED_HOSTS`, `JITSI_APP_SECRET` em produção | Só se vê no ambiente real | Verificar no `.env.production` do VPS / variáveis do repo do frontend |
| CSP sem `unsafe-inline` em estilos | Nonces de estilo afectam Tailwind e `style={}`; precisa de teste visual (excluído por decisão) | Trabalho à parte |
| `settings.logoUrl/faviconUrl/signatureUrl`, `users.avatarUrl` | O frontend de definições pode enviar SVG/ICO e o validador de imagem recusa-os; alterar sem alinhar o frontend parte o upload | Alinhar primeiro o frontend com a política de imagem |
| `crm/beneficiaries/PhotoField.tsx` (`accept="image/*"`) | Com a nova validação, GIF/SVG passam a ser recusados pelo backend | Restringir `accept` a `image/png,image/jpeg,image/webp` (repo do frontend, separado) |

**Não testado:** as alterações em `docker-compose.prod.yml` e `Caddyfile` não foram executadas (sem testes, sem VPS). Antes do deploy: `docker compose -f ops/docker-compose.prod.yml config` para validar a sintaxe; confirmar que `REDIS_PASSWORD` está no `.env.production` **antes** de reiniciar (sem ele o Redis arranca com `--requirepass ""` e a app não autentica); e confirmar que o Caddy arranca com `cap_drop: ALL` (se falhar a escrever em `/data`, acrescentar `DAC_OVERRIDE`).

## 5. Recomendações para produção

1. **Ordem de deploy:** definir `REDIS_PASSWORD` e substituir todos os `CHANGE_ME` → fazer deploy → só depois activar `CSRF_TOKEN_STRICT` (≥ 2026-11-01).
2. **Pinar por digest** as imagens do `docker-compose.prod.yml` (`caddy`, `redis`, `prom/*`, `edoburu/pgbouncer`) e as GitHub Actions por SHA de commit; activar Dependabot para ambas.
3. **Rotação de segredos** (`JWT_*`, `METRICS_TOKEN`, `SWAGGER_TOKEN`, `REDIS_PASSWORD`) com data fixa; documentar no runbook.
4. **IDOR:** ao tocar em qualquer escrita sobre recurso de outro utilizador, confirmar `assertCanAccess`/`isPrivileged` por método (regra 14).
5. **Antes de considerar isto fechado:** um teste dinâmico (DAST/pentest autenticado por papel) e a suite de integração completa — esta auditoria é só de leitura de código.
6. **Backups:** `ops/backup/` e `ops/dr/DISASTER-RECOVERY.md` existem mas não foram auditados nesta passagem (cifragem, retenção, teste de restauro).
