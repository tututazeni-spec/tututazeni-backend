# Contribuir para o INNOVA

Fluxo de trabalho de código. O deploy e a operação estão em `docs/deploy/`; ambientes e migrações em `docs/engenharia/ambientes-e-migracoes.md`.

## Branches

- `main` está protegida (check `quality` obrigatório, `strict`, `enforce_admins`). Não há push directo, nem para administradores.
- Trabalho sempre num ramo curto a partir de `main`, com prefixo: `feat/`, `fix/`, `chore/`, `docs/`, `refactor/`, `hotfix/`.
- Um ramo = uma alteração coerente. Evitar ramos que vivem semanas; integrar `main` com frequência.

## Commits

Conventional Commits, tempo presente: `feat(payroll): ...`, `fix(auth): ...`, `docs(deploy): ...`.
O corpo do commit explica o **porquê**, não repete o diff.

## Pull requests

1. Abrir PR para `main` com o template (`.github/pull_request_template.md`).
2. O check `quality` tem de estar verde (lint, formatação, build, migrations, authz, cobertura, integração, regressão, Sonar, `npm audit`, gitleaks).
3. Pelo menos uma revisão; as áreas sensíveis (auth, prisma, audit, ops, workflows) estão em `.github/CODEOWNERS`.
4. Merge por *squash*. Nunca contornar a protecção do branch nem desligar o required check; se o CI estiver em baixo, esperar.
5. O merge em `main` dispara `deploy.yml` (build → Trivy → staging, se configurado → produção → health gate → smoke → rollback automático se falhar).

## Revisão de código — o que se verifica

- Alterações a `prisma/schema.prisma` trazem a migration correspondente no mesmo PR.
- Endpoints novos têm política de autorização (o check `test:authz` falha se faltar) e verificação de ownership em recursos de outro utilizador.
- Campos/modelos Prisma confirmados no schema (os mocks dos testes unitários não os validam).
- DTOs com `class-validator`; sem `any` novo; sem segredos no código.
- Testes: unitário para lógica, integração para tudo o que toca na BD, regressão/E2E para fluxos críticos.

## Antes de abrir o PR

```bash
npm run lint:check && npm run format:check && npm run build
npm run test              # unitários
npm run test:integration  # se tocou em BD/serviços Prisma
```
