# Spec: Faixa A-Authz — Hardening de Autorização ao Nível do Dado

**Data:** 2026-07-24
**Área:** Segurança / Autorização
**Faixa de auditoria:** A-3
**Estado:** Aprovado — pronto para implementação

---

## Contexto

A auditoria A-3 identificou três lacunas na camada de autorização do INNOVA:

| ID | Severidade | Achado |
|---|---|---|
| A-3-1 | 🔴 Crítico | `MobileController` aceita `userId` do body/path sem validar que corresponde ao utilizador autenticado — qualquer utilizador pode ler o dashboard ou registar sessão de outro |
| A-3-2 | 🟠 Alto | ~14 endpoints sem `@Roles()` — o `RolesGuard` global retorna `true` quando não há decorator, tornando o acesso implicitamente aberto a qualquer autenticado (comportamento fail-open não documentado) |
| A-3-3 | 🟠 Alto | `POST /certification/certificates/:id/download` e `GET /certification/certificates/:id` sem verificação de ownership — utilizador A pode descarregar o certificado de B |

---

## Objectivo

Fechar as 3 lacunas com edições cirúrgicas em 5 ficheiros. Sem refactoring de arquitectura — os guards e utilitários existentes (`RolesGuard`, `assertCanAccess`, `ownershipWhere`) são suficientes.

---

## Decisões de design

### MobileController — substituir `userId` body/path por `@CurrentUser()`

O `JwtAuthGuard` global já garante que o utilizador está autenticado. O problema é que `userId` vem do cliente sem validação. A correcção é usar o `@CurrentUser()` decorator existente para obter o `userId` do JWT token — o cliente deixa de poder enviar um id arbitrário.

**Mudanças de contrato da API** (aceitáveis — mobile app deve autenticar e usar o token):

| Endpoint | Antes | Depois |
|---|---|---|
| `POST /mobile/session` | `@Body('userId') userId` | `@CurrentUser() user` → `user.id` |
| `PATCH /mobile/session/:id/push-token` | sem contexto de utilizador | `@CurrentUser() user` (para validar que a sessão pertence ao utilizador autenticado) |
| `POST /mobile/sync-log` | `@Body('userId') userId` | `@CurrentUser() user` → `user.id` |
| `GET /mobile/dashboard/:userId` | `@Param('userId') userId` | `@CurrentUser() user` → `user.id` (path param removido, rota torna-se `GET /mobile/dashboard`) |

### Constante `AUTHENTICATED_ROLES`

Para endpoints acessíveis a todos os papéis, exportar uma constante do ficheiro de enum existente em vez de listar 8 valores em cada endpoint. O decorator `@Roles()` continua explícito em cada rota — a constante só elimina a repetição:

```typescript
// src/auth/enums/role.enum.ts — adição no fim do ficheiro
export const AUTHENTICATED_ROLES = [
  Role.COLABORADOR, Role.LIDER, Role.GESTOR,
  Role.RH, Role.ADMIN, Role.INSTRUCTOR,
  Role.DIRECTOR, Role.AUDITOR,
] as const;
```

### Mapeamento de roles por endpoint

**Grupo A — qualquer autenticado** (`@Roles(...AUTHENTICATED_ROLES)`):

| Endpoint | Controller |
|---|---|
| `GET /courses` | courses.controller.ts |
| `GET /courses/categories` | courses.controller.ts |
| `GET /courses/:id` | courses.controller.ts |
| `GET /assessments` | assessments.controller.ts |
| `GET /assessments/:id` | assessments.controller.ts |
| `GET /assessments/attempts/:attemptId` | assessments.controller.ts |
| `GET /certification/templates` | certification.controller.ts |
| `GET /certification/certificates/:id` | certification.controller.ts |
| `POST /certification/certificates/:id/download` | certification.controller.ts |
| `GET /departments` | departments.controller.ts |
| `GET /departments/tree` | departments.controller.ts |

**Grupo B — gestão** (`@Roles(Role.GESTOR, Role.RH, Role.ADMIN, Role.DIRECTOR)`):

| Endpoint | Controller |
|---|---|
| `GET /departments/:id` | departments.controller.ts |
| `GET /departments/:id/metrics` | departments.controller.ts |

### Ownership no download de certificados

`assertCanAccess` do utilitário existente `src/common/authz/ownership.ts`:

```typescript
// certification.service.ts
async downloadCertificate(id: string, userId: number) {
  const cert = await this.prisma.certificate.findUnique({ where: { id } });
  assertCanAccess(cert, cert?.userId, { id: userId }, [Role.ADMIN, Role.RH]);
  // gerar e retornar PDF
}
```

Comportamento:
- Utilizador é dono → acesso permitido
- ADMIN ou RH → acesso permitido (gestão pode descarregar para arquivo)
- Qualquer outro → `NotFoundException` (não revela que o certificado existe)

Aplicar o mesmo check a `getCertificate(id, userId)` se ainda não existir.

---

## Ficheiros modificados

### 1. `src/auth/enums/role.enum.ts`
Adicionar constante `AUTHENTICATED_ROLES` no fim do ficheiro.

### 2. `src/mobile/mobile.controller.ts`
- Substituir todos os `@Body('userId')` e `@Param('userId')` por `@CurrentUser() user: CurrentUserData`
- Passar `user.id` ao serviço
- Remover path param `/:userId` de `GET /mobile/dashboard`

### 3. `src/mobile/mobile.service.ts`
Verificar que as assinaturas dos métodos continuam compatíveis após a mudança no controller (o `userId` que o serviço recebe passa a ser sempre o do JWT).

### 4. `src/courses/courses.controller.ts` + `src/assessments/assessments.controller.ts` + `src/certification/certification.controller.ts` + `src/departments/departments.controller.ts`
Adicionar `@Roles(...AUTHENTICATED_ROLES)` ou `@Roles(Role.GESTOR, Role.RH, Role.ADMIN, Role.DIRECTOR)` nos endpoints listados na secção de mapeamento.

### 5. `src/certification/certification.service.ts`
Adicionar `assertCanAccess` nos métodos `downloadCertificate` e `getCertificate`.

---

## Fora de âmbito

- Refactoring do `RolesGuard` para fail-closed global (décision de arquitectura separada)
- `SearchController` (omissão de `RolesGuard` provavelmente intencional — filtragem interna no serviço)
- Adição de `@Roles()` a endpoints que já têm o decorator correcto
- Alterações ao schema Prisma ou ao módulo ACL

---

## Testes

### MobileController
- `POST /mobile/session` com token válido → cria sessão para o utilizador autenticado (não para userId arbitrário)
- `GET /mobile/dashboard` com token válido → retorna dados do utilizador autenticado
- `GET /mobile/dashboard` sem token → 401

### @Roles nos controllers
- `GET /courses` com token de COLABORADOR → 200
- `GET /departments/:id` com token de COLABORADOR → 403
- `GET /departments/:id` com token de GESTOR → 200

### Ownership de certificados
- `POST /certification/certificates/:id/download` pelo dono → 200
- `POST /certification/certificates/:id/download` por outro utilizador → 404
- `POST /certification/certificates/:id/download` por ADMIN → 200
