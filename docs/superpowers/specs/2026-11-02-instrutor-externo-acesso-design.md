# Instrutor Externo — convite temporário, 2FA por e-mail e acesso limitado (design)

Data: 2026-11-02 · Estado: rascunho para aprovação

## 1. Intenção
Uma pessoa de fora da empresa é contratada para dar uma formação. Precisa de um acesso seguro, **de 30 dias**, que só lhe mostre o que ela própria criou e que ninguém consiga reutilizar ou partilhar. Hoje o perfil `INSTRUCTOR_EXTERNO` existe mas só cobre turmas (commit 531f3cc1); não há convite com validade, 2FA por e-mail, registo de dispositivo, desativação automática, nem acesso aos restantes módulos.

## 2. Objetivos / não-objetivos / anti-objetivos
**Objetivos**
- Convite por link único, temporário e de uso único, ligado ao e-mail do instrutor.
- Conta com validade de 30 dias (configurável no convite), desativada automaticamente.
- 2FA por código enviado por e-mail em cada login (decisão do utilizador).
- Registo do dispositivo no primeiro acesso; dispositivo novo é bloqueado até nova verificação.
- Acesso por módulo conforme a secção 5, sempre restrito ao que o instrutor criou.

**Não-objetivos**
- Bloqueio de hardware real (a web não o permite), SMS, TOTP para este perfil (pode vir depois).
- Mudar o comportamento de `INSTRUCTOR` interno.

**Anti-objetivos (seria falha mesmo que "funcione")**
- O externo ver ou editar dados de outros instrutores, da empresa, ou de turmas/aulas que não criou.
- Link de convite reutilizável, ou conta que continua ativa depois de expirar.
- Mensagens de erro que revelem se um e-mail existe.

## 3. Decisões do utilizador
- 2FA: **código por e-mail**.
- Acesso: 30 dias.
- Permissões: ver secção 5 (lista do utilizador, inalterada).

## 4. Desenho

### 4.1 Modelo de dados (novas migrations; no TTY usar `migrate diff` + migration manual)
- `User.accessExpiresAt DateTime?` — fim de validade; só preenchido para externos.
- `InstructorInvite`: `id`, `userId`, `email`, `tokenHash @unique`, `expiresAt` (validade do link, ex. 72 h), `usedAt`, `createdById`, `createdAt`, `revokedAt`. Reutiliza o padrão `PasswordResetToken` (token aleatório 32 bytes, guardado só o hash SHA-256).
- `LoginChallenge`: `id`, `userId`, `codeHash`, `expiresAt` (10 min), `attempts`, `consumedAt`, `purpose` (`LOGIN` | `NEW_DEVICE`).
- `TrustedDevice`: `id`, `userId`, `deviceIdHash` (hash do identificador aleatório guardado no browser), `userAgent`, `ip`, `firstSeenAt`, `lastSeenAt`, `revokedAt`.

### 4.2 Convite
1. ADMIN/RH: `POST /instructor-invites` `{ email, fullName, accessDays = 30 }`. Cria o `User` (role `INSTRUCTOR_EXTERNO`, `accountStatus = PENDING`, `accessExpiresAt = now + accessDays`) e o convite; envia e-mail com `…/auth/instructor-invite?token=…` (reutiliza `MailService` e fila `email`).
2. Instrutor abre o link → `POST /auth/instructor-invite/accept` `{ token, password }` (`@Public`, com throttle). Numa transação: valida token (não usado, não expirado, não revogado), define palavra-passe, `accountStatus = ACTIVE`, marca `usedAt`. A partir daqui o link é inútil. O dispositivo atual fica registado como confiável (o link já provou posse do e-mail).
3. ADMIN/RH podem listar, revogar e reenviar convites (reenviar revoga o anterior e gera novo token).
4. Respostas de erro do token são genéricas ("Convite inválido ou expirado").

### 4.3 Login com 2FA por e-mail e dispositivo
O ecrã de login envia também um `deviceId` (UUID aleatório criado e guardado em localStorage + cookie `httpOnly` pelo backend). Para `INSTRUCTOR_EXTERNO`, após validar e-mail/palavra-passe:
- **Sempre** é emitido um `LoginChallenge` e enviado código de 6 dígitos por e-mail; a resposta é `401 { code: 'EMAIL_CODE_REQUIRED' }`, e o login conclui com `POST /auth/login` repetido com `emailCode`.
- Se o `deviceId` não estiver em `TrustedDevice` ativo: o desafio tem `purpose = NEW_DEVICE`; o dispositivo só passa a confiável após código correto. Dispositivo novo gera aviso por e-mail ao instrutor e entrada em auditoria. Limite: **1 dispositivo confiável ativo** por defeito (admin pode repor/revogar).
- Código: uso único, 10 min, máx. 5 tentativas, reenvio com intervalo mínimo; lockout existente (`registerFailedAttempt`) aplica-se.
- Extensão do fluxo existente em `auth.service.ts` (que já trata `TWO_FACTOR_REQUIRED`/`totpCode`); o TOTP atual não é alterado.
- Refresh tokens ficam ligados ao `deviceId`; refresh de outro dispositivo é recusado.

### 4.4 Expiração automática
- Verificação **em tempo de pedido**: no login, no refresh e no `JwtAuthGuard`, se `accessExpiresAt < now` → 401 e conta tratada como inativa. Garante bloqueio imediato mesmo que a tarefa agendada falhe.
- `@Cron` horário (padrão `certificate-expiry.service.ts`, com `ClusterCronLockService`): põe `accountStatus = INACTIVE`, revoga refresh tokens (`SessionRevocationService`) e dispositivos, regista em auditoria. **Os dados que criou mantêm-se** (cursos, aulas, gravações).
- ADMIN/RH podem prolongar (`PATCH` com nova data) ou desativar antes do prazo.

### 4.5 Permissões
`RolesGuard` compara `user.role.name` com `@Roles(...)`; por isso cada endpoint abaixo tem de listar `INSTRUCTOR_EXTERNO` explicitamente **e** aplicar filtro de posse no serviço (não apenas no guard — ver regra 14 do CLAUDE.md: confirmar por método). Posse = `createdById`/`instructorId`/`CourseInstructor` conforme o modelo.

### 4.6 Frontend (repo separado `frontend/`)
- Página `auth/instructor-invite` (definir palavra-passe).
- Passo de código por e-mail no login, só quando a API devolve `EMAIL_CODE_REQUIRED`.
- Gestão de convites (criar, listar, reenviar, revogar, prolongar, repor dispositivo) na área de utilizadores, para ADMIN/RH.
- Menu do instrutor externo filtrado pelas permissões da secção 5; avisos com `AlertCard`, seletores com `PeriodPills` (regras 16/17).

## 5. Matriz de acesso (do utilizador)
| Área | Pode | Restrição |
|---|---|---|
| Cursos | Ver; **não** criar | Cursos onde é instrutor (`CourseInstructor`) |
| Módulos / lições / conteúdo | Criar, editar, carregar conteúdo | Só em cursos onde é instrutor |
| Inscritos | Ver | Dos seus cursos/turmas |
| Turmas | Ver abertas; **não** criar | Já implementado (`instructorId`) |
| Aulas ao vivo / sessões | Criar, adicionar participantes, material de apoio | Só as suas |
| Calendário | Ver | Só as suas aulas |
| Gravações | Ver | Só das suas aulas |
| Avaliações / feedback | Ver | Só das suas formações/aulas |
| Relatórios | Ver | Só das suas aulas |

## 6. Constatações do código (para o construtor)
- Aulas ao vivo (`live-classes.service.ts:199`), enrollments, assessments, calendário, gravações, material e relatórios **não referenciam** `INSTRUCTOR_EXTERNO`; é o grosso do trabalho.
- RLS: `INSTRUCTOR_EXTERNO` **não** está nos papéis privilegiados (`rls-context.ts:17`) — manter assim, validar que os filtros por posse funcionam sob RLS.
- Convite atual (`UsersService.invite`) enfileira `userInvite` sem token; existe `PasswordResetService.issueSetupToken` e o processador espera `token` — **verificar se o fluxo atual está partido** antes de reutilizar; o novo fluxo é independente.
- Dois `AuditService` paralelos: usar o de `src/common/services/audit.service.ts` (cadeia partilhada) para eventos de convite/dispositivo/expiração.
- Campos/modelos: confirmar em `prisma/schema.prisma` (regra 1/11); testes de integração reais obrigatórios para escrita nova.

## 7. Entrega faseada (cada fase com PR/commits locais próprios)
1. Convite + validade + expiração automática (BE) e ecrãs de convite (FE).
2. 2FA por e-mail + dispositivo confiável (BE+FE).
3. Permissões por módulo: cursos/módulos/lições → aulas ao vivo/sessões/material/gravações/calendário → enrollments/avaliações/relatórios (um módulo por commit, com teste de "não vê o que não é seu").

## 8. Testes mínimos
Integração contra Postgres real: token usado/expirado/revogado; expiração em pedido e via cron; 2FA código errado/expirado/reuso; dispositivo novo bloqueado; para cada módulo, instrutor A não acede a recursos do instrutor B nem da empresa (IDOR).

## 9. Decisões minhas (a confirmar)
- Validade do link de convite: 72 h. Código: 6 dígitos, 10 min, 5 tentativas.
- 1 dispositivo confiável ativo por instrutor.
- Identificador de dispositivo = UUID em localStorage/cookie + user-agent (não é hardware real).
- Dados criados mantêm-se após expiração.
- Prazo por defeito 30 dias, ajustável por convite.
