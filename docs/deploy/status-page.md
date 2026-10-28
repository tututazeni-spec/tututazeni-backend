# Página de estado e comunicação de incidentes

## Princípio

A página de estado tem de ficar **fora da infraestrutura que monitoriza**. Se estiver no mesmo VPS, cai com ele. Por isso usa-se um serviço externo (ou um site estático noutro fornecedor), não código desta app.

## Configuração recomendada

1. Criar a página num serviço externo gratuito/barato (Better Stack, Instatus, UptimeRobot ou Upptime sobre GitHub Pages) em `status.<dominio>`, com CNAME na Cloudflare (DNS **sem** proxy para este registo, para não depender do mesmo caminho).
2. Componentes a expor: **Aplicação web**, **API**, **Autenticação/Login**, **E-mails/Notificações**.
3. Monitores externos (de fora da rede, intervalo 1 min):
   - `GET https://<dominio>/api/health/ready` — esperar 200 (a API devolve 503 se o Postgres estiver em baixo).
   - `GET https://<dominio>/` — esperar 200 (frontend).
4. Ligar os monitores aos componentes (incidente automático) e ao canal de alerta (e-mail + Telegram, já usados no Alertmanager).
5. Link para a página de estado no rodapé do frontend e na assinatura dos e-mails de suporte.
6. Subscrição por e-mail activada para quem quiser ser avisado.

O dead-man switch (`healthchecks.io`, ver `alerting.md`) continua a ser a prova de que o próprio monitoring está vivo.

## Quando publicar um incidente

| Situação | Acção | Prazo |
|---|---|---|
| Alerta `AppAllReplicasDown`, `SloBurnRateFast`, ou login a falhar | Abrir incidente "Investigating" | ≤ 10 min |
| Causa identificada | "Identified" com impacto e contorno | ao identificar |
| Correcção em curso / aplicada | "Monitoring" | ao aplicar |
| Estável 30 min | "Resolved" + resumo | ≤ 30 min depois |
| Manutenção planeada | Agendar com ≥ 48 h de antecedência | — |

## Modelo de mensagem

> **[A investigar] <componente> com lentidão/indisponibilidade** — Desde HH:MM estamos a ver <sintoma>. Equipa a investigar. Próxima actualização às HH:MM.
>
> **[Resolvido]** — O serviço foi restabelecido às HH:MM. Causa: <uma frase>. Impacto: <quem/o quê>. Vamos <acção preventiva>.

Regras: factos e hora, sem culpar terceiros, sem prometer o que não se controla, actualizar pelo menos de 30 em 30 min enquanto o incidente durar.

## Pós-incidente

Registar duração e consumo do orçamento de erro (`sla-slo.md`); post-mortem curto se > 10 % do orçamento.

## Implementação neste repositório (activa depois de 3 passos manuais)

A página é estática e vive em `ops/status-page/`; a sonda é o workflow `.github/workflows/status-page.yml` (GitHub Actions, **fora do VPS**), que de 5 em 5 min faz GET aos alvos, guarda agregados diários de 90 dias em `status.json` e publica tudo no branch `gh-pages` (GitHub Pages).

Passos únicos (só o dono do repositório consegue fazer):

1. **Variável** `STATUS_TARGETS` (Settings → Secrets and variables → Actions → Variables):
   `[{"id":"web","name":"Aplicação web","url":"https://<dominio>/"},{"id":"api","name":"API","url":"https://<dominio>/api/health/ready"}]`
2. Correr uma vez o workflow *Status Page* (Actions → Run workflow) para criar o branch `gh-pages`, e depois **Settings → Pages → Source: `gh-pages` / root**.
3. (Opcional) domínio próprio: `status.<dominio>` como CNAME para `<owner>.github.io` na Cloudflare **sem proxy**, e indicá-lo em Settings → Pages.

Incidentes: acrescentar uma entrada a `ops/status-page/incidents.json` (PR → merge republica a página):

```json
{ "title": "Lentidão no login", "status": "investigating", "impact": "minor",
  "startedAt": "2026-10-27 10:05 UTC",
  "updates": [{ "at": "10:05", "text": "A investigar." }] }
```

`status`: `investigating` | `identified` | `monitoring` | `resolved` (acrescentar `resolvedAt`); `impact: "major"` mostra o banner vermelho.

Limites: o cron do GitHub Actions pode atrasar alguns minutos em horas de pico; o histórico guarda só agregados diários. Se for preciso resolução de 1 min e alertas por SMS, migrar para um serviço dedicado (Better Stack/Instatus) mantendo esta página como alternativa.
