# Staging e ensaio de rollback — passo a passo

> O CI já faz deploy no staging quando existem os secrets `STAGING_*` (job `staging` do
> `deploy.yml`) e a produção só avança se o staging passar o health gate e o smoke.
> Este guia leva um VPS novo até esse ponto e prova que o rollback funciona.

## 1. Dimensionamento do staging

Mesmo software, menos folga: **2 vCPU / 4 GB** chega para o ciclo deploy → smoke (sem observabilidade
opt-in, 1 réplica de cada serviço se necessário). Tem de ter **o mesmo SO, Docker e compose** da
produção e uma BD **própria** (nunca a de produção). Um Postgres gerido pequeno ou o container
descartável do compose de ensaio servem. Dados: seed de smoke, nunca cópias de produção sem anonimizar.

## 2. Preparar o VPS (uma vez)

```bash
# no teu PC: par de chaves só para o CI
ssh-keygen -t ed25519 -f staging_deploy -C "innova-ci-staging" -N ""

# no VPS, como root
sudo DEPLOY_PUBKEY="$(cat staging_deploy.pub)" bash bootstrap-vps.sh   # ops/deploy/bootstrap-vps.sh
```

O script instala Docker, cria o utilizador `deploy` (só chave), `/opt/innova`, firewall (SSH),
fail2ban, actualizações automáticas e swap. É idempotente.

Depois, no VPS como `deploy`:

1. Copiar `ops/.env.production.example` para `/opt/innova/.env.production`, preencher **valores de
   staging** (BD própria, segredos próprios, `APP_URL`/`FRONTEND_URL` do staging) e `chmod 600`.
2. Pôr o Origin CA do staging em `/opt/innova/caddy/origin/`.
3. DNS do staging (`staging.<dominio>`, proxied) — `ops/dns/render-records.sh`.

## 3. Secrets do GitHub (Settings → Secrets → Actions)

| Secret | Valor |
|---|---|
| `STAGING_HOST` | IP/hostname do VPS de staging |
| `STAGING_USER` | `deploy` |
| `STAGING_SSH_KEY` | conteúdo de `staging_deploy` (chave **privada**) |
| `STAGING_SMOKE_BASE_URL` | `https://staging.<dominio>` |
| `STAGING_SMOKE_EMPLOYEE_EMAIL/PASSWORD`, `STAGING_SMOKE_RH_EMAIL/PASSWORD`, `STAGING_SMOKE_COURSE_ID` | utilizadores e curso de smoke criados no seed do staging |

Sem `STAGING_HOST` o job é ignorado (comportamento actual). Com ele, o primeiro merge em `main`
faz o deploy no staging e só depois na produção.

## 4. Ensaio de rollback (obrigatório antes do go-live)

Precisa de **dois deploys** no staging (para existir `previous_tag`). No VPS, como `deploy`:

```bash
/opt/innova/deploy/rollback-drill.sh
```

Faz o rollback para a tag anterior (com health gate), mede o tempo, confirma a tag em execução e
**volta à versão original**. Falha se passar de 300 s (`ROLLBACK_TARGET_SECONDS`). O resultado fica em
`/opt/innova/rollback-drill.log`. Repetir após qualquer alteração ao `deploy.sh`/`rollback.sh` e
sempre que a stack mudar de forma relevante (ex.: nova BD, novo registo de imagens).

Lembrete: o rollback repõe a **imagem**, não desfaz migrations (regra expand/contract em
`arquitetura-producao.md`). Uma migration destrutiva exige o restauro descrito em `disaster-recovery.md`.

## 5. Checklist

- [ ] `bootstrap-vps.sh` executado; login SSH por password recusado
- [ ] `.env.production` de staging (chmod 600) e Origin CA colocados
- [ ] Secrets `STAGING_*` criados; um merge em `main` passa por `staging` → produção
- [ ] `rollback-drill.sh` com ✅ e tempo < 300 s registado em `rollback-drill.log`
- [ ] `origin-firewall.sh` aplicado depois do primeiro deploy
