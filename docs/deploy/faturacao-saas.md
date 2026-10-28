# Faturação SaaS — planos, subscrições, faturas e métricas

Módulo `src/billing/`. Tudo em `/billing/*` é **só ADMIN**. A plataforma continua **single-tenant** (ver ADR em `multi-tenancy-e-escala.md`): há uma subscrição por cliente (o `TenantConfig` único). O modelo já tem `tenantId`, por isso não muda quando houver multi-tenancy.

## Planos e limites

- Catálogo em `billing_plans`: preço mensal/anual, `maxUsers`, `maxStorageGb`, módulos incluídos (`modulesJson`, `null` = todos), `trialDays`.
- Três planos de arranque são criados se a tabela estiver vazia: **Starter / Growth / Enterprise**. **Os preços são valores de exemplo** em AOA: ajustar com `PUT /billing/plans/:code`.
- Aplicado hoje:
  - **Utilizadores:** `UsersService.create` recusa com 403 quando se atinge `maxUsers` do plano (`BillingLimitsService.assertCanAddUser`).
  - **Estado da subscrição:** expirada, cancelada (após o período pago) ou com teste terminado → plataforma em **modo só de leitura** (`BillingReadOnlyGuard`; GET e `/auth`, `/billing`, `/health`, `/metrics` continuam a funcionar). Falha aberta: erro a ler o estado não bloqueia nada.
  - Sem subscrição, valem os limites de `TenantConfig` (comportamento anterior): instalações existentes não são afectadas.
- **Armazenamento:** o uso real vem de `ScalabilityStorageService.getStorageMetrics()` (soma dos bytes registados nas tabelas de ficheiros; medido de 5 em 5 min, em cache) e aparece em `GET /billing/subscription`. Com a quota esgotada, `BillingEntitlementsGuard` recusa (403) **escritas que trazem ficheiros** (multipart ou data-URL no corpo); consultas e escritas sem ficheiros continuam. Mede o que a aplicação regista, não o espaço físico do disco/bucket.
- **Módulos:** o plano (`modulesJson`) e os interruptores de Definições → Licença e Módulos (`moduleFlagsJson`, até aqui sem efeito) são aplicados pelo mesmo guard, por prefixo de rota (`billing-route-modules.ts`: payroll, LMS, avaliação, talento, biblioteca, avatar training, ROI, history, relatórios). O núcleo (auth, utilizadores, definições, dashboard, notificações) nunca é bloqueado. Por omissão todos os módulos estão incluídos e activos, por isso nada muda até alguém restringir um plano.
- Todos os guards **falham abertos**: se o estado de faturação não puder ser lido (ex.: migration por aplicar), a aplicação continua; o limite de utilizadores regista o erro e deixa criar.

## Ciclo de vida da subscrição

`TRIALING → PENDING/ACTIVE → PAST_DUE → EXPIRED`, ou `CANCELED`.

| Acção | Endpoint |
|---|---|
| Iniciar teste (1 vez por cliente, dias do plano) | `POST /billing/subscription/trial` |
| Contratar plano + emitir fatura do 1.º período | `POST /billing/subscription/subscribe` |
| Mudar de plano (limites já; preço na próxima fatura; sem proporcional) | `POST /billing/subscription/change-plan` |
| Cancelar (fim do período pago, ou imediato) | `POST /billing/subscription/cancel` |
| Estado, limites e consumo | `GET /billing/subscription` |

`TenantConfig` (plano, limites, datas) é mantido em sincronia para os módulos existentes (scalability, settings).

## Automação diária (06:00, `BillingSchedulerService`)

1. **Renovações:** 7 dias antes do fim do período emite a fatura do período seguinte.
2. **Fim de teste:** aviso aos 3 dias; sem contratação → `EXPIRED`.
3. **Cobranças falhadas / dunning:** fatura vencida → `OVERDUE`, subscrição `PAST_DUE`, e-mails ao contacto da organização aos 1, 7 e 12 dias de atraso; passados `BILLING_GRACE_DAYS` (14) → `EXPIRED` (só leitura).
4. **Cancelamento agendado** executado no fim do período.

Pagamento confirmado (`POST /billing/invoices/:id/payments`) reactiva a subscrição e levanta o modo só de leitura. Cobrança falhada reportada por um operador/gateway: `POST /billing/invoices/:id/payment-failed`.

Variáveis: `BILLING_VAT_RATE` (14), `BILLING_DUE_DAYS` (7), `BILLING_GRACE_DAYS` (14).

## Faturas e cumprimento fiscal (Angola)

- Numeração **sequencial sem buracos por série anual** (`FT 2026/1`), emitida sob lock transaccional; moeda AOA; **IVA 14 %**; dados do cliente (nome, NIF, morada, país) copiados do `TenantConfig` para a fatura (snapshot imutável).
- **Hash SHA-256 encadeado** entre faturas (`GET /billing/invoices/verify-chain` detecta alterações). Auditoria encadeada de cada acção.
- **Documento imprimível:** `GET /billing/invoices/:id/document` (HTML, ADMIN) com emitente (`BILLING_ISSUER_NAME/NIF/ADDRESS/EMAIL`), cliente, base, IVA, total e 4 caracteres do hash. Enquanto a fatura não estiver `CERTIFIED` leva o aviso «documento interno de cobrança — não constitui fatura para efeitos fiscais». O NIF do cliente é verificado só na forma (`isValidAngolaNif`: 10 dígitos, ou 9 dígitos + 2 letras + 3 dígitos); formato inválido aparece como aviso no documento e não bloqueia renovações.
- Faturas pagas ou submetidas não se apagam nem anulam: exigem nota de crédito.

> **Importante — não substitui o software certificado.** Em Angola a emissão de faturas tem de ser feita por **software de facturação certificado pela AGT** (assinatura RSA, SAF-T AO, ATCUD/QR). Esta plataforma gera o documento de cobrança interno, com numeração e hash próprios, mas **não é um programa certificado**. Fluxo recomendado: emitir/certificar a fatura no software certificado e registar a referência aqui com `PATCH /billing/invoices/:id/fiscal` (`fiscalStatus` `NOT_SUBMITTED → SUBMITTED → CERTIFIED`, `fiscalRef`). Validar o enquadramento final com o contabilista/AGT antes de cobrar a terceiros.

## Cobrança

Sem gateway: pagamento por transferência/referência, confirmado manualmente pelo financeiro. A tabela `billing_payments` (estados `PENDING/CONFIRMED/FAILED`, método `GATEWAY` previsto) já suporta ligar um gateway mais tarde sem alterar o modelo.

## Métricas de negócio (`GET /billing/metrics?days=30`)

| Métrica | Definição |
|---|---|
| MRR / ARR | soma do equivalente mensal das subscrições pagas (`ACTIVE` + `PAST_DUE`); ARR = 12 × MRR |
| ARPA | MRR ÷ clientes pagos |
| Churn | cancelamentos/expirações de clientes pagos na janela ÷ clientes pagos no início |
| LTV | ARPA ÷ churn mensal (indefinido sem churn) |
| CAC | gasto de aquisição dos meses da janela (`POST /billing/acquisition-spend`) ÷ novos clientes pagos |
| Conversão de teste | testes terminados que passaram a pagos ÷ testes terminados |
| Receita cobrada / em aberto | faturas `PAID` na janela / `ISSUED`+`OVERDUE` |

**Fiabilidade:** a resposta traz `reliable` e `reliabilityNote`. Com menos de 10 clientes pagos (`MIN_CUSTOMERS_FOR_RATES`) churn, LTV, CAC e conversão são indicativos e o painel deve mostrá-los com esse aviso; MRR, ARPA e cobrança são sempre exactos. Com um só cliente, o que interessa é o bloco `collections`: taxa de cobrança (faturas vencidas na janela que foram pagas), prazo médio de pagamento, valor e % em atraso.

**Histórico:** as subscrições só guardam o estado actual, por isso um cron diário (06:30) grava a foto do mês em `billing_metric_snapshots` (MRR, ARR, clientes, receita, em aberto). `GET /billing/metrics/history?months=12` devolve a série; o último dia de cada mês fica como valor final.

## Estado de verificação

Migrations `20261201000000_billing_saas` e `20261202000000_billing_metric_snapshots`: aplicadas à BD de testes (`NODE_ENV=test prisma migrate deploy`). A BD de desenvolvimento e a de produção recebem-nas pelo fluxo normal (`migrate deploy`; em produção, pelo job `migrate` do deploy). Compila (`tsc`), lint e prettier limpos; unitários (matemática, guard de direitos) e o spec de integração `test/integration/billing` cobrem trial único, numeração e IVA, hash encadeado, cobrança falhada, pagamento, métricas, módulo fora do plano, limite de utilizadores e modo só de leitura. **Não coberto por testes:** os crons (renovação, dunning, fim de trial) e a quota de armazenamento contra uma BD real.
