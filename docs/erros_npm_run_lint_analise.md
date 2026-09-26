# Análise de erros — `npm run lint` / testes (frontend/backend INNOVA)

Log analisado: `erros_npm_run_lint_no_frontend.pdf` (26/09/2026)

A maior parte dos `ERROR` no log são **esperados** — testes que simulam falhas de BD, SMTP, Twilio, Redis, etc., para verificar o tratamento de erros (por isso os respetivos ficheiros aparecem como `PASS`). Os problemas reais são dois, ambos em `users`.

---

## 1. `users.service.spec.ts` — 4 testes a falhar

**Testes afetados:**
- `UsersService › create › deve criar utilizador com userPoints e notificationLog`
- `UsersService › invite() › gera tempPassword com 24 chars hexadecimais (CSPRNG) e passa-o no job de email`
- `UsersService › invite() › enfileira o job "userInvite" com email/fullName correctos e retry configurado`
- `UsersService › invite() › cria o utilizador ANTES de enfileirar o email (a criação não depende do envio)`

**Erro:**
```
TypeError: function is not iterable (cannot read property Symbol(Symbol.iterator))
at Function.all (<anonymous>)
at UsersService.create (users/users.service.ts:241:32)
```

**Causa raiz:**
O mock do Prisma no teste (linha ~45) está escrito para transações no estilo **array de promises**:

```ts
$transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
```

Mas `UsersService.create` (linha 241) chama `$transaction` no estilo **interativo** (callback com `tx`):

```ts
await this.prisma.$transaction(async (tx) => { ... });
```

Como o mock recebe uma função em vez de um array e tenta `Promise.all(funcao)`, rebenta porque a função não é iterável.

**Correção sugerida** — tornar o mock capaz de suportar os dois estilos:

```ts
$transaction: jest.fn((arg) => {
  if (typeof arg === 'function') {
    return arg(mockPrisma); // estilo interativo: chama o callback com o "tx" mockado
  }
  return Promise.all(arg); // estilo array: mantém o comportamento atual
}),
```

Isto deve resolver os 4 testes de uma vez, já que os 3 de `invite()` dependem internamente de `create()`.

**Ficheiro a alterar:** `users/users.service.spec.ts` (linha ~45, definição de `mockPrismaBase`)

---

## 2. `users.controller.spec.ts` — 1 teste a falhar

**Teste afetado:**
- `UsersController › create → create(dto)`

**Erro:**
```
expect(jest.fn()).toHaveBeenCalledWith(...expected)
- Expected: {}
+ Received: 1
Number of calls: 1
```

**Causa provável:**
O teste espera que `usersService.create` seja chamado com o `dto`, mas foi chamado com `1` (provavelmente `mockUser.id`). Isto sugere que a assinatura de `UsersController.create` mudou, por exemplo:

```ts
create(@CurrentUser() user, @Body() dto) {
  return this.usersService.create(user.id, dto); // ou ordem trocada
}
```

sem que o teste tenha sido atualizado para o novo contrato.

**Ação necessária:**
1. Confirmar a assinatura atual de `UsersService.create(...)`.
2. Se de facto agora recebe `(creatorId, dto)`:
   - Corrigir o teste para `expect(mockSvc.create).toHaveBeenCalledWith(1, dto)` (ou o valor real de `mockUser.id`).
3. Se a assinatura **não** devia ter mudado:
   - Reverter o controller para chamar `this.usersService.create(dto)`.

**Ficheiros a verificar:**
- `users/users.controller.ts` (método `create`)
- `users/users.controller.spec.ts` (linha ~145-148)
- `users/users.service.ts` (assinatura de `create`)

---

## Ruído a ignorar (não são erros a corrigir)

- `Evaluation360EventListeners`, `ScalabilityEventListeners`, `AuditService`, `MailService`, `SmsService` — logs de "DB error" / "SMTP connection refused" / "invalid number": são testes de caminho de erro, todos com `PASS`.
- Avisos de bootstrap: `APP_URL`, `METRICS_TOKEN`, `STORAGE_BASE_URL`, `SMTP_HOST`, `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN` não definidos, health checks Redis/Postgres a falhar — apenas indicam variáveis de ambiente não definidas no ambiente de teste, não afetam o resultado dos testes.
