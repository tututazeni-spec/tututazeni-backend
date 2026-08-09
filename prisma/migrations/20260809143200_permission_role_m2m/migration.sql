-- Ver memory project-innova-acl-permission-ownership: Permission.roleId era
-- uma FK obrigatória de dono único (1:N), mas o código em 3 módulos (acl,
-- roles-permissions, departments) tratava Role<->Permission como M2M via
-- connect/disconnect/set — revoke sempre rebentava ("would violate the
-- required relation"), clone roubava a permissão em vez de a duplicar, e
-- remover um role com ON DELETE CASCADE apagava permanentemente as
-- permissões que possuía. RolePermission já existia como join table mas
-- nunca era a única fonte de verdade. Esta migração torna-a a única.

-- 1. Backfill: preservar as associações actuais antes de remover roleId.
--    Cada Permission tem exactamente um roleId hoje (coluna NOT NULL), por
--    isso não há risco de duplicados nesta inserção.
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT "roleId", "id" FROM "Permission";

-- 2. Impedir duplicados futuros (e permitir upsert por chave composta).
CREATE UNIQUE INDEX "RolePermission_roleId_permissionId_key" ON "RolePermission"("roleId", "permissionId");

-- 3. Permission deixa de ter dono único — só existe via RolePermission.
--    DROP COLUMN remove também a FK e a constraint NOT NULL associadas.
ALTER TABLE "Permission" DROP COLUMN "roleId";
