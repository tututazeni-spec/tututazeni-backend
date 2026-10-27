# Auditoria de controlos de segurança (2026-10-27)

Verificação por leitura de código; sem testes dinâmicos. Complementa `2026-10-27-relatorio-consolidado-producao.md`.

| Controlo | Estado | Evidência |
|---|---|---|
| Hash seguro de palavras-passe | ✅ | `src/common/security/password-hasher.ts` (argon2 via `@node-rs/argon2`, com compatibilidade bcrypt para hashes antigos) |
| MFA/2FA | ✅ | TOTP no login (`auth.service.ts`, `settings/totp.ts`), segredo cifrado; política exige 2FA a ADMIN/RH (`twoFactorSetupRequired`) |
| SSO | ⚠️ parcial | OIDC (Google/Microsoft/próprio) e LDAP/AD em `auth/sso-auth.service.ts`. **SAML 2.0 não está implementado** — só existe como tipo de configuração/monitorização |
| RBAC / menor privilégio | ✅ | `RolesGuard` global + `@Roles()`, RLS por utilizador, decisões em `docs/security/rbac-decisions.md`; IDOR auditado (A10) |
| TLS em trânsito | ✅ | Caddy com TLS e HSTS (`security-headers.ts`, `docs/deploy/cloudflare.md`) |
| Cifra de segredos em repouso | ✅ | AES-256-GCM (`encryptSecret`) para credenciais de integração, segredos 2FA/SSO |
| Cifra de PII em repouso | ⚠️ pendente | `User.nif`/`User.nib` ficam em claro na BD. Mitigação actual: omitidos nas respostas/logs (`user-profile-redaction.ts`, `sanitize.ts`) e RLS. Ver abaixo |
| OWASP Top 10 | ✅ | Prisma sem SQL cru, DOMPurify, CSRF double-submit (`CSRF_TOKEN_STRICT`), helmet/CSP, ValidationPipe whitelist, rate limiting, uploads (A1–A10 em `docs/security/`) |
| Gestão de segredos | ✅ | Só variáveis de ambiente; `.env` fora do git; gitleaks no CI (`.gitleaks.toml`); segredos de produção por gerar (checklist em `arquitetura-producao.md`) |
| Registos de auditoria | ✅ | Cadeia SHA-256 append-only (trigger na BD), `src/common/helpers/audit-chain.ts`; quem/o quê/quando em acções críticas |
| Análise de dependências | ✅ | `npm audit --audit-level=high` e gitleaks no `quality.yml`, Trivy no `deploy.yml`, Dependabot |
| Pentest periódico | ❌ não existe | Nenhum plano nem registo. Ver abaixo |

## Pendentes (não implementados de propósito)

1. **SAML 2.0** — exige biblioteca (`@node-saml/node-saml`), metadados do IdP, validação de assinatura e testes contra um IdP real. Implementar quando um cliente o pedir; seguir o desenho do `sso-auth.service.ts` (config em Definições §11, utilizador criado/ligado por email).
2. **Cifra de `User.nif`/`nib`** — uma extensão Prisma só cobre leituras directas de `User`; os `select` aninhados (`payslips`, `payroll-payments`, `payroll-insights`, PDF) devolveriam texto cifrado. Fazer com migração (coluna `nibEnc`) + helper explícito nesses 5 pontos de leitura + backfill, e testes de integração de folha. Entretanto, activar cifra de disco/volume do Postgres e dos backups (confirmar no fornecedor).
3. **Pentest** — antes do 1.º cliente externo e depois anual ou após mudanças grandes de auth/RLS: pentest autenticado por papel (COLABORADOR, GESTOR, RH, ADMIN) com foco em IDOR e escalada de privilégios, mais DAST (OWASP ZAP) contra staging. Guardar relatórios em `docs/security/`.
4. **Confirmar em produção** — `CSRF_TOKEN_STRICT=true` (a partir de 2026-11-01), `JITSI_APP_SECRET`, `IMG_ALLOWED_HOSTS`, cifra dos backups.
