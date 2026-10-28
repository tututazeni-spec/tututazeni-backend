# Medidas técnicas e organizativas de segurança

> Anexo ao Acordo de Processamento de Dados. Cada linha é uma afirmação contratual: só está aqui o que existe no repositório. Antes de assinar com um cliente, a equipa técnica confirma que continua verdadeiro **no ambiente desse cliente** (ex.: RLS activado, backups a correr). O que ainda não está feito está em "Lacunas".

## Existentes

| Área | Medida | Onde |
|---|---|---|
| Autenticação | JWT em cookie httpOnly; renovação de sessão; revogação imediata de sessões; bloqueio de contas e histórico de logins; SSO (OIDC/LDAP) opcional | módulo `auth`, Definições → Autenticação |
| Controlo de acessos | RBAC deny-by-default (cada endpoint declara a política); permissões finas por papel; verificações de propriedade em recursos de terceiros | `RolesGuard`, `assertCanAccess` |
| Isolamento de dados | Row Level Security na base de dados (activável, `ops/db/rls/`); filtragem por departamento/papel | `RLS_ENABLED` |
| Cifra em trânsito | HTTPS obrigatório em produção, HSTS | `enforceHttpsMiddleware`, borda Caddy/Cloudflare |
| Cifra em repouso (campos) | NIF e NIB cifrados com AES-256-GCM; palavras-passe com hash | `backfill-encrypt-user-pii`, `password-hasher` |
| Protecção da aplicação | CSRF (cabeçalho + token double-submit), CORS restrito, limite de corpo, validação estrita de DTOs, rate limiting por IP/utilizador/chave | `main.ts`, `csrf-header-guard` |
| Ficheiros | Verificação do conteúdo real, antivírus, downloads seguros, URL de webhook sem destinos internos (anti-SSRF) | `docs/refactor-seguranca-uploads.md` |
| Registo e auditoria | Auditoria append-only com cadeia SHA-256 (trigger na BD); logs sanitizados; acesso a recibos registado | módulo Auditoria |
| Disponibilidade | 2 réplicas da aplicação, health checks, deploy gradual com rollback automático, SLO 99,5 % e alertas | `docs/deploy/` |
| Cópias de segurança e recuperação | Backups agendados e plano de recuperação com exercício de restauro | `docs/deploy/disaster-recovery.md` |
| Privacidade | Exportação de dados, pedidos do titular, retenção automática, anonimização de ex-colaboradores (reaplicada após restauros) | módulo de privacidade |
| Resposta a incidentes | Processo com severidades, comunicação e post-mortem sem culpas | `docs/deploy/gestao-incidentes.md` |

## Lacunas (declarar com honestidade ao cliente quando perguntado)

- Cifra de **todo o volume/BD em repouso** depende do fornecedor de alojamento (não é feita pela aplicação): confirmar e registar.
- RLS e backups são configuração por ambiente: confirmar activos em produção.
- Pentest independente e certificação (ex.: ISO 27001) não realizados.
- Não existe ainda DPO nomeado nem registo formal de actividades de tratamento (ver DPA, secção de governação).
