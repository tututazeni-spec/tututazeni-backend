## O quê e porquê
<!-- O problema e a solução em 2-3 frases. -->

## Tipo
- [ ] feat
- [ ] fix
- [ ] refactor
- [ ] chore/ops
- [ ] docs

## Checklist
- [ ] `npm run lint:check`, `format:check` e `build` passam localmente
- [ ] Testes adicionados/ajustados (unitário / integração / regressão)
- [ ] Alterou `schema.prisma`? Migration incluída, aditiva (expand/contract), sem edição de migrations antigas
- [ ] Endpoints novos/alterados têm `@Roles`/política e verificação de ownership
- [ ] Sem segredos, sem `console.log`, sem `any` novo
- [ ] Documentação actualizada (API/Swagger, `docs/`, runbook) se aplicável
- [ ] Plano de rollback descrito se o deploy for arriscado (migration destrutiva, mudança de infra)

## Como testar
<!-- Passos ou comandos. -->
