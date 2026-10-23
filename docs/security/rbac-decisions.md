# Decisões de menor privilégio (T9)

- Só ADMIN atribui o papel ADMIN (`UsersService.assertCanAssignRole`); ninguém não-ADMIN altera o próprio papel.
  Antes: `POST /users` e `PUT /users/:id` (ADMIN, RH) aceitavam `roleId` livre → RH podia fazer-se ADMIN.
- Atribuição via `roles-permissions` e gestão de ACL já eram só ADMIN.
- NÃO feito (decisão de produto): reduzir RH a permissões finas; reavaliar GESTOR em `monitoring` (BROADER_ROLES_REVIEWED em
  `test/authz/admin-surface.spec.ts`); rever os handlers de `docs/security/authz-review-needed.md`.
- Chamadas internas a `UsersService.create/update` sem `actorRole` (importações, seeds) não são verificadas — só a rota HTTP passa o papel.
