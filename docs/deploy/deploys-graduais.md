# Deploys graduais, feature flags e rollback

## Camadas de redução de risco

| Camada | Mecanismo | Onde |
|---|---|---|
| Imagem nova | Build + scan Trivy; só `sha-<commit>` imutáveis | `deploy.yml` |
| Pré-produção | Job `staging` (health gate + smoke) antes de produção | `deploy.yml` |
| Substituição rolling | `deploy.sh` recria uma réplica de cada vez, com health gate por réplica | `ops/deploy/deploy.sh` |
| Gate pós-deploy | `/health/ready` com a versão esperada + smoke `test:regression` | `deploy.yml` (`verify`) |
| Rollback automático | Se o gate falhar, repõe a tag anterior (app + frontend) | `deploy.yml` (`rollback`), `ops/deploy/rollback.sh` |
| Rollback manual | `/opt/innova/deploy/rollback.sh` ou Actions → Deploy → `tag` antiga | `runbook.md` |
| Funcionalidade nova | **Feature flag** com percentagem progressiva | este documento |

Migrations seguem o padrão expand/contract para o rollback da imagem ser sempre seguro (`runbook.md` §7).

## Feature flags

Implementação: `src/common/feature-flags/` (módulo global `FeatureFlagsModule`).

Configuração por ambiente em `.env.production`:

```
FEATURE_FLAGS=nova-folha:10,relatorios-v2:on,experimento-x:off
```

- `nome:on` → 100 %; `nome:off` → 0 %; `nome:25` → 25 % dos utilizadores.
- Flag não listada = **desligada**.
- A percentagem é estável por (flag, utilizador): o mesmo utilizador vê sempre o mesmo comportamento enquanto a percentagem só subir.
- Sem utilizador autenticado só `on` (100 %) activa a flag.

### Usar numa rota

```ts
@RequireFeature('nova-folha')
@UseGuards(FeatureFlagGuard)
@Get('nova')
nova() { ... }
```

Com a flag desligada para o utilizador a rota responde 404. Mantém-se a política de autorização (`@Roles`/ownership) do handler: a flag **não** substitui autorização.

### Usar em código

```ts
constructor(private readonly flags: FeatureFlagsService) {}
if (this.flags.isEnabled('nova-folha', user.id)) { /* caminho novo */ } else { /* caminho antigo */ }
```

### Ciclo de vida de um lançamento

1. Deploy com a funcionalidade **desligada** (flag ausente ou `:off`). O código novo está em produção mas inactivo.
2. Subir gradualmente: `:5` → `:25` → `:50` → `:100`, vigiando erros e latência (Grafana, `HighErrorRate`, `SloBurnRateFast`) entre passos (≥ 30 min cada).
3. Algo corre mal: pôr `:off` e reiniciar em rolling (`deploy.sh` ou `docker compose up -d app`) — segundos, sem novo deploy nem rollback de imagem.
4. Estável 1–2 semanas a 100 %: apagar a flag e o ramo de código antigo (dívida técnica de flags não se acumula).

> Alterar a flag exige reiniciar as réplicas (a leitura é no arranque). Para troca sem reinício seria preciso guardar as flags na BD/Redis; só vale a pena se o ritmo de lançamentos o justificar.

### Quando o orçamento de erro está baixo

Ver `sla-slo.md`: abaixo de 50 % de orçamento restante, funcionalidades novas só com flag e percentagem baixa.
