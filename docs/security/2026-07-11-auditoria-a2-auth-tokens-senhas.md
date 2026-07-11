# Auditoria A-2 — Autenticação, Tokens e Senhas (INNOVA)

> Faixa A-2 da auditoria de production readiness. Data: 2026-07-11.
> Âmbito: hashing de senhas, salt, algoritmos obsoletos, gestão de JWT
> (access/refresh), política de senhas, brute-force e fluxos de recuperação.
> Repositórios: `innova` (backend NestJS) e `innova-frontend` (Next.js).
> **Este documento só reporta e planeia — nenhuma correção foi aplicada.**

---

## 1. Resumo executivo

A base de autenticação está saudável: senhas de utilizador são **bcrypt cost 12**
(`src/auth/auth.service.ts:60,100`; `src/users/users.service.ts:203,272,363`),
os segredos JWT falham alto se ausentes (sem fallback inseguro), e o token de
sessão já migrou para cookie `httpOnly` (feito na Faixa A-1). Não há senhas em
texto plano nem MD5/SHA-1 em lado nenhum.

Os problemas concentram-se em três frentes: (1) **os fluxos de recuperação de
senha são stubs vazios** que respondem "sucesso" sem fazer nada — o pior tipo de
falha, porque parece funcionar; (2) **o mecanismo de refresh token está partido
por desenho** — o refresh token é emitido mas nunca verificado, e o endpoint de
refresh exige um access token ainda válido, o que torna o refresh inútil assim
que o access expira; (3) **passwords de share links de documentos usam SHA-256
sem salt** (`src/document-repository/document-repository.service.ts:424,461`) —
hash rápido e sem salt, exatamente o anti-padrão que a Faixa A-2 caça.

Não existe proteção dedicada contra brute-force no login (só o throttler global
de 100 req/min por IP, partilhado com toda a API) nem bloqueio de conta.

## 2. Cenário de ataque (porquê importa)

**Reset de senha fantasma.** `forgotPassword` e `resetPassword`
(`auth.service.ts:110-118`) devolvem mensagens de sucesso mas não geram token,
não persistem nada e não enviam email. Se o frontend expuser o ecrã de "esqueci
a senha", o utilizador fica convencido de que recuperou o acesso e nunca o
recuperou — e, pior, se algum dia o `resetPassword` for ligado a uma UI sem
rever esta lógica, aceita qualquer `token` e responde "Senha redefinida com
sucesso" sem validar nada.

**Brute-force de credenciais.** Sem rate limiting específico no `POST
/auth/login` nem bloqueio de conta, um atacante distribui tentativas por IPs
(ou fica abaixo dos 100/min) e testa senhas de 6 caracteres — o mínimo aceite
(`LoginDto` `@MinLength(6)`) — contra os ~6000 emails corporativos, cuja
convenção é previsível.

**Share links: rainbow table.** As senhas dos links partilhados de documentos
são `sha256(password)` sem salt. Um atacante que obtenha a coluna
`passwordHash` (dump, backup, SQLi noutro ponto) reverte senhas fracas
instantaneamente com tabelas pré-computadas — e estes links dão acesso a
documentos que a própria lógica DLP classifica como sensíveis.

## 3. Achados

| # | Severidade | Achado | Evidência |
|---|---|---|---|
| A2-1 | 🔴 Crítico | `forgotPassword`/`resetPassword` são stubs que devolvem sucesso sem gerar/validar token, persistir ou enviar email. Fluxo de recuperação inexistente disfarçado de funcional | `src/auth/auth.service.ts:110-118` |
| A2-2 | 🟠 Alto | Refresh token emitido com `JWT_REFRESH_SECRET` mas **nunca verificado** em lado nenhum; o endpoint `POST /auth/refresh` usa `JwtAuthGuard` (valida o *access* token) e só re-emite enquanto o access ainda é válido — o refresh é inútil após expiração e o refresh token é peso morto | `src/auth/auth.controller.ts:56-62`, `auth.service.ts:86-88,138-157` |
| A2-3 | 🟠 Alto | Passwords de share links com `sha256` sem salt — hash rápido, vulnerável a rainbow tables/brute-force; protege documentos marcados como sensíveis | `src/document-repository/document-repository.service.ts:424,461` |
| A2-4 | 🟠 Alto | Sem proteção anti-brute-force no login: só o `ThrottlerModule` global (100 req/min/IP para toda a API), sem limite dedicado a `/auth/login`, sem bloqueio de conta nem backoff | `src/app.module.ts:126`; `src/auth/*` (sem `@Throttle`) |
| A2-5 | 🟡 Médio | Política de senha fraca: `@MinLength(6)` sem requisitos de complexidade, em login e registo/reset | `src/auth/auth.dto.ts:11,26,55,72` |
| A2-6 | 🟡 Médio | Revogação com atraso: `JwtStrategy` mantém cache em memória por utilizador (TTL 60s) — utilizador desativado ou com role/permissão alterada continua válido até 60s; cache sem limite de tamanho (cresce com nº de utilizadores ativos, entradas expiram por tempo mas não são despejadas) | `src/auth/jwt.strategy.ts:19-20,47-65` |
| A2-7 | 🟡 Médio | Access token de 15m emitido também via header Bearer para Swagger; o `cookieExtractor` tem prioridade mas o fallback Bearer mantém uma segunda via de aceitação de token — reduzir a superfície quando o cookie for o canal único | `src/auth/jwt.strategy.ts:35-44` |
| A2-8 | 🟢 Baixo | Seed de produção (`prisma/seed.ts`) cria admin/colaborador com senhas fixas conhecidas (`Admin@1234`, `Employee@1234`) em bcrypt cost 10 — aceitável para dev, mas garantir que o seed real de produção força troca no primeiro login | `prisma/seed.ts:45,52,60,67` |
| A2-9 | 🟢 Baixo | Audit log de login é fire-and-forget com `.catch(() => undefined)` — falha de auditoria de autenticação é silenciosamente engolida | `src/auth/auth.service.ts:48-50` |

### O que está bem (não alterar)

- **bcrypt cost 12** para senhas de utilizador — adequado; nenhuma migração de algoritmo necessária para o fluxo principal (o spec da skill pede Argon2 *ou* bcrypt com cost adequado — este cumpre).
- **Segredos JWT fail-fast**: `JWT_SECRET` (`jwt.strategy.ts:28-33`) e `JWT_REFRESH_SECRET` (`auth.service.ts:141-146`) lançam erro no arranque/uso se ausentes — sem fallback conhecido.
- **Senha nunca devolvida nem registada**: `const { password: _, ...safeUser }` em login/register/me; sem password em logs.
- **Cookie de sessão** `httpOnly` + `secure` (prod) + `sameSite: 'lax'` — feito na Faixa A-1.
- API keys e webhook secrets com `crypto.randomBytes` de entropia adequada (`api-integration.service.ts:38,396`); tokens de share link com `randomBytes(32)`.

## 4. Plano de remediação proposto (não aplicado)

> Cada bloco segue `brainstorming → writing-plans → TDD → code review` antes de
> tocar em código. Ordem = ordem de risco.

### 4.1 🔴 Implementar recuperação de senha real (fecha A2-1)

- `forgotPassword`: gerar token aleatório (`randomBytes`), guardar **apenas o
  hash** do token + expiração curta (ex. 30 min) numa tabela dedicada, enviar
  email com o token; resposta genérica e constante em tempo (não revelar se o
  email existe).
- `resetPassword`: validar hash do token + expiração + uso único, aplicar
  bcrypt cost 12 à nova senha, invalidar o token e sessões existentes.
- Testar explicitamente: token inválido, expirado, reutilizado, e o caminho
  feliz.

### 4.2 🟠 Corrigir o mecanismo de refresh (fecha A2-2)

- Decidir o desenho (brainstorm): refresh token em cookie `httpOnly` próprio +
  endpoint que o **verifica com `JWT_REFRESH_SECRET`** (guard/strategy de
  refresh dedicada), em vez de reutilizar o `JwtAuthGuard` do access.
- Considerar rotação de refresh token e lista de revogação (ligado a A2-6).
- Alinhar com a decisão da Faixa A-1 (cookies same-site) — o refresh cookie
  segue as mesmas flags.

### 4.3 🟠 Re-hash das senhas de share link (fecha A2-3)

- Migrar `passwordHash` de `sha256` para bcrypt (cost 12) com verificação
  em tempo constante; re-hash na próxima criação/validação ou migração
  dedicada. Mesmo padrão nas duas ocorrências (`:424` e `:461`).

### 4.4 🟠 Rate limiting dedicado ao login (fecha A2-4)

- `@Throttle` apertado em `/auth/login` e `/auth/forgot-password` (ex. 5–10
  tentativas/min/IP), independente do limite global.
- Avaliar bloqueio temporário de conta / backoff exponencial após N falhas
  consecutivas (guardar contador+timestamp por utilizador).

### 4.5 🟡 Política de senha e revogação (fecha A2-5, A2-6, A2-7)

- Reforçar o DTO: `@MinLength(10)` + `@Matches` de complexidade, aplicado a
  registo/reset/change (não ao login — aí só validar credenciais).
- Reduzir o TTL do cache do `JwtStrategy` ou invalidar a entrada em
  deativação/alteração de role; avaliar limite de tamanho (LRU) para o Map.
- Quando o cookie for o canal único e o Swagger estiver protegido de outra
  forma, remover o fallback Bearer do extractor.

### 4.6 🟢 Higiene (fecha A2-8, A2-9)

- Seed de produção força `mustChangePassword` no primeiro login para as contas
  semente.
- Falha do audit log de login passa a ser registada (warn estruturado), não
  engolida.

## 5. Critério de fecho

- [ ] `POST /auth/forgot-password` gera token hasheado com expiração; `reset-password` valida token único e recusa inválido/expirado/reutilizado (testes a cobrir os quatro casos).
- [ ] `POST /auth/refresh` recusa um access token válido como prova de refresh e exige um refresh token verificado com `JWT_REFRESH_SECRET`.
- [ ] `passwordHash` dos share links deixa de ser `sha256`; verificação em tempo constante.
- [ ] Tentativas de login acima do limite dedicado são bloqueadas com `429`.
- [ ] DTOs de registo/reset/change recusam senhas abaixo da nova política.
- [ ] Nenhuma senha em texto plano, MD5 ou SHA-1/SHA-256 sem salt em fluxos de autenticação (grep de `createHash` limpo nos caminhos de password).
