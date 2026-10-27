# Faturação SaaS — planos, subscrições, faturas e métricas

Módulo `src/billing/`. Tudo em `/billing/*` é **só ADMIN**. A plataforma continua **single-tenant** (ver ADR em `multi-tenancy-e-escala.md`): há uma subscrição por cliente (o `TenantConfig` único). O modelo já tem `tenantId`, por isso não muda quando houver multi-tenancy.

## Planos e limites

- Catálogo em `billing_plans`: preço mensal/anual, `maxUsers`, `maxStorageGb`, módulos incluídos (`modulesJson`, `null` = todos), `trialDays`.
- Três planos de arranque são criados se a tabela estiver vazia: **Starter / Growth / Enterprise**. **Os preços são valores de exemplo** em AOA: ajustar com `PUT /billing/plans/:code`.
- Aplicado hoje:
  - **Utilizadores:** `UsersService.create` recusa com 403 quando se atinge `maxUsers` do plano (`BillingLimitsService.assertCanAddUser`).
  - **Estado da subscrição:** expirada, cancelada (após o período pago) ou com teste terminado → plataforma em **modo só de leitura** (`BillingReadOnlyGuard`; GET e `/auth`, `/billing`, `/health`, `/metrics` continuam a funcionar). Falha aberta: erro a ler o estado não bloqueia nada.
  - Sem subscrição, valem os limites de `TenantConfig` (comportamento anterior): instalações existentes não são afectadas.
- **Ainda não aplicado:** limite de armazenamento (o uso real de disco não é medido; só o máximo é exposto) e exclusão de módulos por plano (existe `assertModuleIncluded(subject)` mas nenhuma rota o chama; usar nos controllers dos módulos que se queiram restringir).

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

Com um único cliente, MRR/ARPA/receita são exactos mas churn, LTV e CAC só fazem sentido quando houver vários clientes (a fórmula é a mesma).

## Estado de verificação

Migration `20261201000000_billing_saas`: gerada com `prisma migrate diff`, **ainda não aplicada** a nenhuma BD. Compila (`tsc`), lint e prettier limpos; unitários da matemática (IVA, períodos, hash, métricas) passam. **Por correr:** migration, integração (fluxo trial → subscribe → pagamento → renovação → dunning) e `test:authz`.
