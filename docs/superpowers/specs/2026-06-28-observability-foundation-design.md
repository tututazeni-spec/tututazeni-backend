# Spec — Fundação de observabilidade: request-id + logging JSON + erros (regras 1,2,3)

> Data: 2026-06-28
> Repo: backend innova (NestJS 11 + Prisma)
> Branch: `feat/observability-foundation`
> Origem: requisitos DevOps de monitorização/debugging — primeiro de ~8 sub-projetos.

## Contexto

O backend não tem logging estruturado, request-id nem exception filter global
(verificado: sem pino/winston/terminus/prom-client; `main.ts` usa o logger default
em texto; há um `/health` básico). Esta fundação é o substrato dos sub-projetos
seguintes (query logging, cache hit/miss, alertas — todos logam/medem através
dela).

Cobre 3 das 10 regras:
1. Todo endpoint tem um Request ID único para rastreabilidade.
2. Todo erro tem stack trace completo (em texto) — nos logs.
3. Todo log é JSON estruturado, não texto livre.

## Decisões (brainstorming)

- Stack: **`nestjs-pino`** (pino) — logger JSON mais rápido, integra logging
  por-pedido com reqId via AsyncLocalStorage, substitui o logger do Nest (logs
  existentes passam a JSON sem mudar código).

## Objetivo

Todos os pedidos produzem log JSON com `reqId`, método, rota, status e tempo; os
erros são logados com stack trace completo e devolvem JSON com `requestId` (sem
expor o stack ao cliente); o header `x-request-id` é honrado/gerado e devolvido.

## Design

### 1. Request-id + logging JSON (`nestjs-pino`)

- Instalar `nestjs-pino`, `pino-http`; `pino-pretty` (devDependency, p/ dev).
- `LoggerModule.forRoot` no `AppModule`:
  - `transport` pretty quando `NODE_ENV !== 'production'`; JSON puro caso contrário.
  - `genReqId`: usa o header `x-request-id` recebido se existir, senão gera um UUID;
    escreve o `x-request-id` no header da resposta.
  - `redact`: `req.headers.authorization`, `req.headers.cookie`, `*.password`,
    `*.token` (não logar segredos).
  - `autoLogging` ligado → 1 linha por pedido com método/rota/status/tempo.
- `main.ts`: `app.useLogger(app.get(Logger))` (o `Logger` de `nestjs-pino`), e
  `bufferLogs: true` no `NestFactory.create`.

### 2. Exception filter global (stack trace + erros JSON)

- `src/common/filters/all-exceptions.filter.ts` — `@Catch()` global:
  - Loga via o `PinoLogger` com **stack completo** (`error.stack`); nível `error`
    para 5xx, `warn` para 4xx; inclui `statusCode`, método, rota, mensagem.
  - Resposta JSON: `{ statusCode, message, requestId, path, timestamp }`. O
    `requestId` vem do reqId do pino. **O stack NUNCA vai na resposta.**
  - Preserva `statusCode`/mensagens das `HttpException` existentes.
- Registado em `main.ts` via `app.useGlobalFilters(new AllExceptionsFilter(...))`.

### 3. Testes e verificação

- Spec do `AllExceptionsFilter` (Jest): dado um `HttpException` e um erro genérico,
  assere que loga com stack (mock do logger) e que a resposta JSON tem
  `statusCode`/`message`/`requestId`/`path`/`timestamp` corretos, sem `stack`.
- Verificação: arrancar a app → pedido normal = 1 linha JSON com reqId+tempo; erro
  = log `error` com stack + resposta JSON com `requestId`; header `x-request-id`
  devolvido. `tsc --noEmit` limpo; suite existente verde (CI corre tudo).

## Critério de sucesso

1. Logs em JSON com `reqId` em todos os pedidos (autoLogging).
2. Erros com stack completo nos logs; resposta JSON com `requestId`, sem stack.
3. Header `x-request-id` honrado/gerado e devolvido.
4. `tsc` limpo; suite/CI verdes; logs existentes continuam a funcionar (agora JSON).

## Fora de âmbito (sub-projetos seguintes)

Health detalhado (#2/regra 4), query logging com tempo (#3/regra 5), cache hit/miss
(#4/regra 6), métricas perf (#5/regra 7), alertas (#6/regra 9), regressão de fluxos
críticos (#7/regra 8), deploy+rollback (#8/regra 10).
