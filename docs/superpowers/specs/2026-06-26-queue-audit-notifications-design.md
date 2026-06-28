# Spec — Fila de background (Redis/BullMQ) para auditoria e notificações (item 3a)

> Data: 2026-06-26
> Branch: `chore/code-review-improvements`
> Origem: item 3 do code review (escalabilidade). Fatia **3a** (offload de
> auditoria/notificações). O **3b** (cache de dashboards) é um ciclo separado.

## Contexto e problema

Com ~6000 funcionários, escrever auditoria e notificações **no caminho do
pedido** (de forma síncrona) soma latência desnecessária: o utilizador espera
por trabalho que não precisa de ver concluído. Mover esse trabalho para uma
**fila de background (Redis/BullMQ)** liberta o pedido e distribui carga entre
instâncias.

Infra confirmada nesta máquina:
- Redis-compatível **Memurai** a correr como serviço Windows em `127.0.0.1:6379`
  (`PING → PONG`).
- Dependências já instaladas: `@nestjs/bull@11`, `bull@4.16`, `ioredis@5.10`.
- Já existe um `AuditService` central (`src/common/services/audit.service.ts`,
  de `fa81b11`) — ponto de alavancagem ideal.
- `EventEmitter2` já é usado no módulo `scalability` (eventos em memória); a fila
  BullMQ acrescenta durabilidade (sobrevive a reinícios, distribui, repete).

## Objetivo

Tirar a escrita de auditoria e o envio fire-and-forget de notificações do
caminho do pedido, com **fallback síncrono** que garante que nada se perde
quando o Redis está em baixo ou desligado. Sem quebrar endpoints que dependem
do retorno/validação imediata das notificações.

## Design

### 1. Infraestrutura Redis/fila

- `src/queue/queue.module.ts` (global): `BullModule.forRootAsync` lendo a
  ligação Redis do `ConfigService`. Defaults `127.0.0.1:6379`.
- Env (`.env` e `.env.example`):
  ```
  REDIS_HOST=127.0.0.1
  REDIS_PORT=6379
  # REDIS_PASSWORD=        (opcional)
  QUEUE_ENABLED=true       # false → tudo síncrono (testes/CI sem Redis)
  ```
- `docker-compose.yml` na raiz com serviço `redis:7-alpine` (portabilidade/
  equipa). Corremos Memurai localmente; o compose documenta a dependência.
- **Resiliência:** `QUEUE_ENABLED=false` ou Redis inacessível → produtores caem
  para o comportamento síncrono. Auditoria é compliance → nunca se perde.

### 2. Offload da auditoria

- Fila `audit` (`BullModule.registerQueue({ name: 'audit' })`).
- `src/queue/processors/audit.processor.ts` — `@Processor('audit')` cujo handler
  `@Process('write')` faz `prisma.auditLog.create({ data: job.data })`.
- `AuditService.log()`/`logEntity()` passam a enfileirar:
  ```ts
  async log(input: AuditLogInput): Promise<void> {
    const data = this.toAuditData(input);          // mapeamento extraído
    if (!this.queueEnabled) { await this.prisma.auditLog.create({ data }); return; }
    try {
      await this.auditQueue.add('write', data, { removeOnComplete: true, attempts: 3, backoff: 5000 });
    } catch {
      await this.prisma.auditLog.create({ data }); // Redis em baixo → não perder
    }
  }
  ```
- **Mudança de contrato:** `log()`/`logEntity()` passam a devolver `Promise<void>`
  (eram `Promise<AuditLog>`). Nenhum chamador usa o valor de retorno (auditoria é
  fire-and-forget).
- **Fora de âmbito:** os ~35 ficheiros que chamam `prisma.auditLog.create`
  diretamente ficam síncronos (migração futura). Este slice foca o `AuditService`
  central.

### 3. Notificações (offload só do fire-and-forget)

`send()` valida o destinatário (404) e devolve a notificação — não pode ser
sempre fire-and-forget. Dois caminhos:

- **Síncrono (mantém-se):** `send()` inalterado, para quem precisa do resultado
  ou do 404 imediato.
- **Fila (novo):** `enqueueSend(dto)` para efeitos secundários fire-and-forget.
  ```ts
  async enqueueSend(dto: CreateNotificationDto): Promise<void> {
    if (!this.queueEnabled) { await this.send(dto).catch(e => this.logger.warn(e?.message)); return; }
    try {
      await this.notificationsQueue.add('send', dto, { removeOnComplete: true, attempts: 3, backoff: 5000 });
    } catch {
      await this.send(dto).catch(e => this.logger.warn(e?.message));
    }
  }
  ```
- `src/queue/processors/notifications.processor.ts` — `@Process('send')` chama o
  `send()` existente (reutiliza validação + preferências + create). Um 404 no
  worker falha só o job (retry), não o pedido do utilizador.
- **Migração de chamadores:** trocar criação fire-and-forget por `enqueueSend`
  **apenas** em pontos seguros, começando por `crm-funders` `notifyGrantCreated`
  (já isolado num método próprio desde `646217f`). Endpoints que devolvem a
  notificação ao cliente **não mudam**.

### 4. Config, fallback e testes

- `queueEnabled` lido de `QUEUE_ENABLED` via `ConfigService` (default `true`).
- Fallbacks: ver secção 1 (flag off / Redis em baixo). Worker repete em erro
  transitório da BD (`attempts: 3`, `backoff`).
- **Testes (TDD, comportamento):**
  - `AuditService`: com `QUEUE_ENABLED=false` → assere `prisma.auditLog.create`.
    Com fila (mock via `getQueueToken('audit')`) → assere `queue.add('write', …)`;
    se `queue.add` rejeita → fallback a `create`.
  - `AuditProcessor`: dado um job → `prisma.auditLog.create` com `job.data`.
  - `NotificationsService.enqueueSend`: mock da fila → `queue.add('send', dto)`;
    com flag off → chama `send`.
  - `NotificationsProcessor`: dado um job → chama `notifications.send(job.data)`.
  - Mocks de `Queue` (sem Redis real) → suite corre sem infra. Verificação final:
    specs verdes + `tsc --noEmit`.

## Critério de sucesso

1. `AuditService` e o caminho fire-and-forget de notificações enfileiram quando
   `QUEUE_ENABLED=true`, e caem para síncrono quando off ou Redis em baixo.
2. Processors escrevem na BD a partir dos jobs.
3. Nenhum endpoint que dependa do retorno/validação imediata de notificações é
   alterado.
4. Specs verdes + `tsc --noEmit` limpo. Integração opcional contra o Memurai.

## Fora de âmbito

- Cache de dashboards (item **3b**, próximo ciclo).
- Migrar os ~35 `prisma.auditLog.create` diretos.
- Dashboard/observabilidade da fila (Bull Board).
- Reforço de cifra das credenciais no `scalability` (item à parte).
