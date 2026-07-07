#!/bin/sh
# Entrypoint de produção: aplica migrations e arranca a app.
# REGRA (runbook): migrations têm de ser compatíveis com a versão anterior do
# código (expand-contract) para o rollback de imagem ser seguro.
set -e

echo "A aplicar migrations (prisma migrate deploy)..."
npx prisma migrate deploy

exec node dist/main.js
