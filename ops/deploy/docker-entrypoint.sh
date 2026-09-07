#!/bin/sh
# Entrypoint de produção: arranca a app.
#
# As migrations NÃO correm aqui. São um job dedicado `migrate` no compose
# (ops/docker-compose.prod.yml) que corre `prisma migrate deploy` até terminar
# ANTES de qualquer réplica da app arrancar (depends_on: service_completed_successfully).
# Motivo: com 2+ réplicas, todas correriam a migração em paralelo no arranque —
# o advisory lock do Prisma serializa-as, mas é frágil e atrasa o boot.
#
# REGRA (runbook secção 6): as migrations têm de ser compatíveis com a versão
# anterior do código (expand-contract) para o rollback de imagem ser seguro —
# o rollback repõe a imagem mas NÃO desfaz migrations.
set -e

exec node dist/main.js
