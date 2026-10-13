-- "Nunca preenchido" (NULL) tem de ser distinguível de "preenchido a 0": com
-- DEFAULT 0 todos os utilizadores pareciam ter declarado 0 anos de experiência
-- anterior, e o simulador dava "Não cumpre" em vez de "Sem dados".
-- O UPDATE só limpa o valor que a migration 20261113000000 deu por omissão.
ALTER TABLE "User" ALTER COLUMN "priorExperienceYears" DROP DEFAULT;
UPDATE "User" SET "priorExperienceYears" = NULL WHERE "priorExperienceYears" = 0;
