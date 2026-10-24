# Decisões de menor privilégio (T9 e seguimento)

## Escalada de privilégios fechada
- `UsersService.assertCanAssignRole`: só ADMIN atribui o papel ADMIN; ninguém não-ADMIN altera o próprio papel
  (`POST /users`, `PUT /users/:id`).
- **Correção:** a primeira versão desta nota dizia que `roles-permissions` e `acl` eram só ADMIN. Era falso:
  ambos usam `ADMIN = ['ADMIN', 'RH']`, logo RH podia atribuir-se ADMIN ou editar as permissões do próprio papel
  por aí. Agora `RoleGovernanceGuard` (nos dois controllers) impede quem não é ADMIN de: tocar no papel ADMIN,
  alterar o próprio papel/permissões e atribuir-se um papel. RH continua a gerir papéis comuns.

## RH — o que ficou restrito a ADMIN
`api-integration`: criar/rodar/revogar chaves de API e criar/alternar/apagar/disparar webhooks
(credenciais de longa duração e canais de saída de dados). Leituras e o resto do módulo ficam abertos a RH.
O frontend mostra estes separadores ao RH (`ADMIN_ROLES`): vão devolver 403 até serem escondidos para RH.

## RH — o que continua amplo (decisão de produto)
RH tem 1538 dos 1790 handlers com `@Roles` (processos, CRM, formações, payroll, avaliações, automação…).
Reduzir mais exige decidir módulo a módulo; `test/authz/rh-least-privilege.spec.ts` é onde fixar cada decisão.

## Monitorização (GESTOR)
O frontend dá a GESTOR o menu e todos os separadores, e o serviço não tem âmbito por papel. Os separadores
técnicos (`health`, `jobs`, `performance`, `integrations`) mostram infraestrutura a gestores sem necessidade.
Recomendação: restringir esses 4 endpoints a ADMIN/AUDITOR/DIRECTOR/RH **e** esconder os separadores a GESTOR em
`frontend/app/(platform)/monitoring/page.tsx` (repositório separado; não alterado aqui).

## Limites
Chamadas internas a `UsersService.create/update` sem `actorRole` (importações, seeds) não são verificadas — só a rota HTTP passa o papel.
