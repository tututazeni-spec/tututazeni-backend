-- Único super administrador: gere plano, utilizadores e validade da licença.
ALTER TABLE "User" ADD COLUMN "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false;

-- Índice único parcial: no máximo uma linha com isSuperAdmin = true.
CREATE UNIQUE INDEX "users_single_super_admin" ON "User" ("isSuperAdmin") WHERE "isSuperAdmin" = true;
