# Fila de Auditoria/Notificações (Redis/BullMQ) — Plano de Implementação (item 3a)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tirar a escrita de auditoria e o envio fire-and-forget de notificações do caminho do pedido, movendo-as para uma fila Bull (Redis), com fallback síncrono que nunca perde dados.

**Architecture:** Um `QueueModule` global configura a ligação Bull→Redis a partir de env. O `AuditService` central e um novo `NotificationsService.enqueueSend` passam a enfileirar jobs; processors dedicados consomem e escrevem na BD. Se `QUEUE_ENABLED=false` ou o Redis falhar ao enfileirar, cai-se para o comportamento síncrono.

**Tech Stack:** NestJS, `@nestjs/bull@11` + `bull@4.16` + `ioredis@5.10` (já instalados), `@nestjs/config` (global), Prisma, Jest 30.

## Global Constraints

- Fila: usar **`@nestjs/bull`** (Bull clássico) — decoradores `@Processor`/`@Process`/`@InjectQueue` de `'@nestjs/bull'`; tipos `Queue`/`Job` de `'bull'`. NÃO usar `bullmq`.
- Redis por env: `REDIS_HOST` (default `127.0.0.1`), `REDIS_PORT` (default `6379`), `REDIS_PASSWORD` opcional. O Memurai já corre em `127.0.0.1:6379`.
- `QUEUE_ENABLED` (default `true`). `'false'` → tudo síncrono (testes/CI sem Redis). Ler com `config.get<string>('QUEUE_ENABLED', 'true') !== 'false'`.
- Auditoria é compliance: em `QUEUE_ENABLED=false` OU falha a enfileirar → escrita síncrona direta. Nunca perder.
- `AuditService.log()` e `logEntity()` passam a devolver `Promise<void>` (verificado: nenhum chamador usa o retorno).
- `NotificationLog.metadata` é `String?` → `enqueueSend` recebe `metadata` como objeto; o `send()` existente faz `JSON.stringify`.
- Jest 30: `--forceExit`; filtro `--testPathPatterns`. Na máquina sob carga, correr `--runInBand` apontando ao ficheiro. Shell é PowerShell: correr `npx` sem pipe (ou via `cmd /c "npx ... > log 2>&1"`).
- Commits terminam com: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

### Task 1: Infraestrutura da fila (QueueModule + env + docker-compose)

**Files:**
- Create: `src/queue/queue.module.ts`
- Modify: `src/app.module.ts` (adicionar `QueueModule` aos imports)
- Create: `docker-compose.yml` (raiz)
- Modify: `.env`, `.env.example` (adicionar vars Redis/fila)

**Interfaces:**
- Produces: `QueueModule` global que configura `BullModule.forRoot` (ligação Redis). Habilita `BullModule.registerQueue({ name })` em qualquer módulo.

- [ ] **Step 1: Criar `src/queue/queue.module.ts`**

```ts
import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        redis: {
          host: config.get<string>('REDIS_HOST', '127.0.0.1'),
          port: Number(config.get<string>('REDIS_PORT', '6379')),
          password: config.get<string>('REDIS_PASSWORD') || undefined,
        },
      }),
    }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
```

- [ ] **Step 2: Registar o `QueueModule` no `app.module.ts`**

No array `imports` do `AppModule`, logo a seguir a `ConfigModule.forRoot({ isGlobal: true }),`, adicionar:
```ts
    QueueModule,
```
E adicionar o import no topo do ficheiro:
```ts
import { QueueModule } from './queue/queue.module';
```

- [ ] **Step 3: Criar `docker-compose.yml` na raiz**

```yaml
# Serviços de desenvolvimento. Redis para as filas Bull (item 3a).
# Localmente pode usar-se o Memurai (Windows) em vez deste serviço.
services:
  redis:
    image: redis:7-alpine
    container_name: innova-redis
    ports:
      - "6379:6379"
    restart: unless-stopped
    command: ["redis-server", "--appendonly", "yes"]
    volumes:
      - redis-data:/data

volumes:
  redis-data:
```

- [ ] **Step 4: Adicionar vars ao `.env` e `.env.example`**

Acrescentar a ambos os ficheiros:
```
# Fila / Redis (item 3a)
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
# REDIS_PASSWORD=
QUEUE_ENABLED=true
```

- [ ] **Step 5: Verificar compilação**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 6: Commit**

```
git add src/queue/queue.module.ts src/app.module.ts docker-compose.yml .env.example
git commit -m "feat(queue): infraestrutura Bull/Redis (QueueModule + env + compose)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
(Nota: `.env` pode estar em `.gitignore`; se estiver, não o adiciones — só `.env.example`.)

---

### Task 2: Offload da auditoria

**Files:**
- Create: `src/queue/processors/audit.processor.ts`
- Create: `src/queue/processors/audit.processor.spec.ts`
- Modify: `src/common/services/audit.service.ts`
- Modify: `src/common/modules/audit.module.ts`
- Test: `src/common/services/audit.service.spec.ts`

**Interfaces:**
- Consumes: fila `audit` (de Task 1 via `BullModule.registerQueue`).
- Produces: `AuditService.log(input): Promise<void>` e `logEntity(...): Promise<void>` que enfileiram (ou escrevem síncrono em fallback). `AuditProcessor` que escreve `prisma.auditLog.create` a partir do job.

- [ ] **Step 1: Escrever os testes que falham — `audit.service.spec.ts`**

Substituir TODO o conteúdo de `src/common/services/audit.service.spec.ts` por:
```ts
import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import { ConfigService } from '@nestjs/config';
import { AuditService } from './audit.service';
import { PrismaService } from '../../prisma/prisma.service';

const mockPrisma = { auditLog: { create: jest.fn().mockResolvedValue({ id: 1 }) } };
const mockQueue = { add: jest.fn().mockResolvedValue(undefined) };
let queueEnabledValue = 'true';
const mockConfig = { get: jest.fn((key: string, def?: any) => (key === 'QUEUE_ENABLED' ? queueEnabledValue : def)) };

describe('AuditService (common)', () => {
  let service: AuditService;

  beforeEach(async () => {
    jest.clearAllMocks();
    queueEnabledValue = 'true';
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: getQueueToken('audit'), useValue: mockQueue },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();
    service = module.get<AuditService>(AuditService);
  });

  it('enfileira o log quando a fila está activa', async () => {
    await service.log({ entity: 'User', entityId: 1, action: 'CREATE', userId: 1 });
    expect(mockQueue.add).toHaveBeenCalledWith('write', expect.objectContaining({ entity: 'User', action: 'CREATE', userId: 1 }), expect.any(Object));
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('cai para escrita síncrona se enfileirar falhar (Redis em baixo)', async () => {
    mockQueue.add.mockRejectedValueOnce(new Error('redis down'));
    await service.log({ entity: 'User', entityId: 1, action: 'CREATE', userId: 1 });
    expect(mockPrisma.auditLog.create).toHaveBeenCalled();
  });

  it('escreve síncrono quando QUEUE_ENABLED=false', async () => {
    queueEnabledValue = 'false';
    await service.log({ entity: 'User', entityId: 1, action: 'CREATE', userId: 1 });
    expect(mockQueue.add).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).toHaveBeenCalled();
  });

  it('logEntity enfileira com metadata stringificada', async () => {
    await service.logEntity(7, 'CREATE', 'FundingGrant', 'cuid123', { funderId: 'f1' });
    expect(mockQueue.add).toHaveBeenCalledWith('write', expect.objectContaining({
      userId: 7, action: 'CREATE', entity: 'FundingGrant',
      metadata: JSON.stringify({ funderId: 'f1', entityId: 'cuid123' }),
    }), expect.any(Object));
  });
});
```

- [ ] **Step 2: Correr os testes — devem falhar**

Run: `npx jest src/common/services/audit.service.spec.ts --runInBand --forceExit`
Expected: FAIL (o `AuditService` ainda não injeta a fila/config nem enfileira).

- [ ] **Step 3: Reescrever `src/common/services/audit.service.ts`**

```ts
// src/common/services/audit.service.ts
import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

interface AuditLogInput {
  action: string;
  entity?: string;
  entityType?: string;
  entityId?: number | string;
  userId: number | string;
  metadata?: Record<string, any>;
  details?: Record<string, any>;
}

@Injectable()
export class AuditService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('audit') private readonly auditQueue: Queue,
    private readonly config: ConfigService,
  ) {}

  private get queueEnabled(): boolean {
    return this.config.get<string>('QUEUE_ENABLED', 'true') !== 'false';
  }

  async log(input: AuditLogInput): Promise<void> {
    await this.enqueueOrWrite({
      action: input.action,
      entity: input.entity ?? input.entityType ?? 'Unknown',
      entityId: input.entityId !== undefined ? Number(input.entityId) : undefined,
      userId: Number(input.userId),
      metadata: (input.metadata ?? input.details) as any,
    });
  }

  /**
   * Variante para módulos cujos IDs são cuid (String): como AuditLog.entityId é
   * Int?, o id real vai dentro de metadata (sempre JSON.stringify).
   */
  async logEntity(
    userId: number,
    action: string,
    entity: string,
    entityId: string,
    meta: Record<string, any> = {},
  ): Promise<void> {
    await this.enqueueOrWrite({
      userId,
      action,
      entity,
      metadata: JSON.stringify({ ...meta, entityId }),
    });
  }

  /** Enfileira o write de auditoria; cai para escrita síncrona se a fila estiver
   *  desligada (QUEUE_ENABLED=false) ou se falhar a enfileirar (Redis em baixo). */
  private async enqueueOrWrite(data: any): Promise<void> {
    if (!this.queueEnabled) {
      await this.prisma.auditLog.create({ data });
      return;
    }
    try {
      await this.auditQueue.add('write', data, { removeOnComplete: true, attempts: 3, backoff: 5000 });
    } catch {
      await this.prisma.auditLog.create({ data }); // não perder compliance
    }
  }
}
```

- [ ] **Step 4: Criar `src/queue/processors/audit.processor.ts`**

```ts
import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';

@Processor('audit')
export class AuditProcessor {
  constructor(private readonly prisma: PrismaService) {}

  @Process('write')
  async handleWrite(job: Job): Promise<void> {
    await this.prisma.auditLog.create({ data: job.data });
  }
}
```

- [ ] **Step 5: Criar `src/queue/processors/audit.processor.spec.ts`**

```ts
import { AuditProcessor } from './audit.processor';

describe('AuditProcessor', () => {
  it('escreve o log de auditoria a partir do job', async () => {
    const prisma = { auditLog: { create: jest.fn().mockResolvedValue({ id: 1 }) } } as any;
    const processor = new AuditProcessor(prisma);
    await processor.handleWrite({ data: { action: 'CREATE', entity: 'User', userId: 1 } } as any);
    expect(prisma.auditLog.create).toHaveBeenCalledWith({ data: { action: 'CREATE', entity: 'User', userId: 1 } });
  });
});
```

- [ ] **Step 6: Ligar a fila e o processor no `audit.module.ts`**

Substituir `src/common/modules/audit.module.ts` por:
```ts
// src/common/modules/audit.module.ts
import { Module, Global } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { AuditService } from '../services/audit.service';
import { AuditProcessor } from '../../queue/processors/audit.processor';
import { PrismaModule } from '../../prisma/prisma.module';

@Global()
@Module({
  imports: [PrismaModule, BullModule.registerQueue({ name: 'audit' })],
  providers: [AuditService, AuditProcessor],
  exports: [AuditService],
})
export class AuditModule {}
```

- [ ] **Step 7: Correr os testes — devem passar**

Run (um de cada vez):
`npx jest src/common/services/audit.service.spec.ts --runInBand --forceExit`
`npx jest src/queue/processors/audit.processor.spec.ts --runInBand --forceExit`
Expected: PASS em ambos.

- [ ] **Step 8: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 9: Commit**

```
git add src/common/services/audit.service.ts src/common/services/audit.service.spec.ts src/common/modules/audit.module.ts src/queue/processors/audit.processor.ts src/queue/processors/audit.processor.spec.ts
git commit -m "feat(queue): offload da auditoria para a fila Bull com fallback sincrono

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Capacidade de enfileirar notificações

**Files:**
- Create: `src/queue/processors/notifications.processor.ts`
- Create: `src/queue/processors/notifications.processor.spec.ts`
- Modify: `src/notifications/notifications.service.ts` (injeções + `enqueueSend`)
- Modify: `src/notifications/notifications.module.ts` (registar fila + processor)
- Test: `src/notifications/notifications.service.spec.ts` (adicionar describe `enqueueSend`)

**Interfaces:**
- Consumes: fila `notifications`; o `send(dto)` existente.
- Produces: `NotificationsService.enqueueSend(dto: CreateNotificationDto): Promise<void>`.

- [ ] **Step 1: Escrever os testes que falham — adicionar a `notifications.service.spec.ts`**

Primeiro, garantir que o módulo de teste fornece a fila e o config. No `Test.createTestingModule` desse spec, adicionar aos `providers` (a par do `PrismaService`):
```ts
import { getQueueToken } from '@nestjs/bull';
import { ConfigService } from '@nestjs/config';
// ...
{ provide: getQueueToken('notifications'), useValue: { add: jest.fn().mockResolvedValue(undefined) } },
{ provide: ConfigService, useValue: { get: jest.fn((k: string, d?: any) => (k === 'QUEUE_ENABLED' ? 'true' : d)) } },
```
Depois adicionar este describe (antes do fecho do describe principal):
```ts
describe('enqueueSend', () => {
  it('enfileira o envio quando a fila está activa', async () => {
    const queue = (service as any).notificationsQueue;
    await service.enqueueSend({ userId: 1, type: 'X', title: 't', message: 'm' } as any);
    expect(queue.add).toHaveBeenCalledWith('send', expect.objectContaining({ userId: 1, type: 'X' }), expect.any(Object));
  });
});
```

- [ ] **Step 2: Correr — deve falhar**

Run: `npx jest src/notifications/notifications.service.spec.ts --runInBand --forceExit`
Expected: FAIL (`enqueueSend` não existe; injeções em falta).

- [ ] **Step 3: Alterar `notifications.service.ts` — construtor e `enqueueSend`**

Mudar o construtor (atual `constructor(private prisma: PrismaService) {}`) e os imports no topo:
```ts
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
```
```ts
  constructor(
    private prisma: PrismaService,
    @InjectQueue('notifications') private readonly notificationsQueue: Queue,
    private readonly config: ConfigService,
  ) {}

  private get queueEnabled(): boolean {
    return this.config.get<string>('QUEUE_ENABLED', 'true') !== 'false';
  }

  /** Fire-and-forget: enfileira o envio. A validação (404) e a criação acontecem
   *  no worker. Para quem precisa do resultado/404 imediato, usar send(). */
  async enqueueSend(dto: CreateNotificationDto): Promise<void> {
    if (!this.queueEnabled) {
      await this.send(dto).catch(e => this.logger.warn(e?.message));
      return;
    }
    try {
      await this.notificationsQueue.add('send', dto, { removeOnComplete: true, attempts: 3, backoff: 5000 });
    } catch {
      await this.send(dto).catch(e => this.logger.warn(e?.message));
    }
  }
```
(O `CreateNotificationDto` já está importado no topo do ficheiro.)

- [ ] **Step 4: Criar `src/queue/processors/notifications.processor.ts`**

```ts
import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { NotificationsService } from '../../notifications/notifications.service';
import { CreateNotificationDto } from '../../notifications/notifications.dto';

@Processor('notifications')
export class NotificationsProcessor {
  constructor(private readonly notifications: NotificationsService) {}

  @Process('send')
  async handleSend(job: Job<CreateNotificationDto>): Promise<void> {
    await this.notifications.send(job.data);
  }
}
```

- [ ] **Step 5: Criar `src/queue/processors/notifications.processor.spec.ts`**

```ts
import { NotificationsProcessor } from './notifications.processor';

describe('NotificationsProcessor', () => {
  it('chama notifications.send com os dados do job', async () => {
    const notifications = { send: jest.fn().mockResolvedValue({ id: 1 }) } as any;
    const processor = new NotificationsProcessor(notifications);
    const dto = { userId: 1, type: 'X', title: 't', message: 'm' };
    await processor.handleSend({ data: dto } as any);
    expect(notifications.send).toHaveBeenCalledWith(dto);
  });
});
```

- [ ] **Step 6: Ligar a fila + processor no `notifications.module.ts`**

No `notifications.module.ts`: adicionar `BullModule.registerQueue({ name: 'notifications' })` aos `imports`, `NotificationsProcessor` aos `providers`, e garantir que `NotificationsService` continua em `exports`. Adicionar os imports:
```ts
import { BullModule } from '@nestjs/bull';
import { NotificationsProcessor } from '../queue/processors/notifications.processor';
```
Exemplo do decorator resultante (ajustar à lista existente, sem remover o que já lá está):
```ts
@Module({
  imports: [/* ...existentes..., */ BullModule.registerQueue({ name: 'notifications' })],
  providers: [/* ...existentes..., */ NotificationsProcessor],
  exports: [NotificationsService /*, ...existentes */],
})
```

- [ ] **Step 7: Correr os testes — devem passar**

Run (um de cada vez):
`npx jest src/notifications/notifications.service.spec.ts --runInBand --forceExit`
`npx jest src/queue/processors/notifications.processor.spec.ts --runInBand --forceExit`
Expected: PASS.

- [ ] **Step 8: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 9: Commit**

```
git add src/notifications/notifications.service.ts src/notifications/notifications.service.spec.ts src/notifications/notifications.module.ts src/queue/processors/notifications.processor.ts src/queue/processors/notifications.processor.spec.ts
git commit -m "feat(queue): enqueueSend de notificacoes fire-and-forget via fila Bull

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Migrar `crm-funders` notifyGrantCreated para a fila

**Files:**
- Modify: `src/crm-funders/crm-funders.service.ts` (injetar `NotificationsService`; usar `enqueueSend`)
- Modify: `src/crm-funders/crm-funders.module.ts` (importar `NotificationsModule`)
- Test: `src/crm-funders/crm-funders.service.spec.ts` (fornecer `NotificationsService` mock; assertar `enqueueSend`)

**Interfaces:**
- Consumes: `NotificationsService.enqueueSend` (de Task 3).

- [ ] **Step 1: Adicionar/ajustar teste em `crm-funders.service.spec.ts`**

No `Test.createTestingModule` desse spec, adicionar aos `providers` um mock de `NotificationsService`:
```ts
import { NotificationsService } from '../notifications/notifications.service';
// ...
{ provide: NotificationsService, useValue: { enqueueSend: jest.fn().mockResolvedValue(undefined) } },
```
Adicionar um teste que, ao criar um grant, o envio é enfileirado (ajustar o nome do método/inputs ao que o spec já usa para criar grants):
```ts
it('enfileira notificação de grant criado (não escreve notificationLog direto)', async () => {
  const notifications = module.get(NotificationsService) as any;
  // ... arranjar mocks mínimos para createGrant correr (ver outros testes do spec) ...
  // após chamar o método de criação de grant:
  expect(notifications.enqueueSend).toHaveBeenCalledWith(
    expect.objectContaining({ type: 'GRANT_CREATED', userId: expect.any(Number) }),
  );
});
```
(Se o spec já tiver um teste de criação de grant, basta acrescentar a asserção `enqueueSend` a esse fluxo em vez de um teste novo.)

- [ ] **Step 2: Correr — deve falhar**

Run: `npx jest src/crm-funders/crm-funders.service.spec.ts --runInBand --forceExit`
Expected: FAIL (ainda usa `prisma.notificationLog.create`; `NotificationsService` não injetado).

- [ ] **Step 3: Injetar `NotificationsService` no construtor**

Em `src/crm-funders/crm-funders.service.ts`, mudar o construtor (atual):
```ts
  constructor(
    private prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}
```
para:
```ts
  constructor(
    private prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}
```
E adicionar o import no topo:
```ts
import { NotificationsService } from '../notifications/notifications.service';
```

- [ ] **Step 4: Reescrever `notifyGrantCreated` para enfileirar**

Substituir o corpo de `notifyGrantCreated` (atual `return this.prisma.notificationLog.create({...})`) por:
```ts
  /** Notificação de grant criado — efeito secundário enfileirado (fire-and-forget). */
  private notifyGrantCreated(
    grant: { id: string; title: string; funderId: string },
    dto: CreateGrantDto,
    userId: number,
  ) {
    const currency = dto.currency || DEFAULT_CURRENCY;
    return this.notifications.enqueueSend({
      userId,
      type: 'GRANT_CREATED',
      title: 'Novo financiamento registado',
      message: `Grant "${grant.title}" no valor de ${currency} ${dto.amount.toLocaleString('pt-AO')} criado.`,
      metadata: { grantId: grant.id, funderId: grant.funderId },
    });
  }
```
(Nota: `enqueueSend` recebe `metadata` como **objeto** — o `send()` faz o `JSON.stringify`.)

- [ ] **Step 5: Importar `NotificationsModule` no `crm-funders.module.ts`**

Adicionar `NotificationsModule` aos `imports` do `CrmFundersModule` e o import:
```ts
import { NotificationsModule } from '../notifications/notifications.module';
```

- [ ] **Step 6: Correr os testes — devem passar**

Run: `npx jest src/crm-funders/crm-funders.service.spec.ts --runInBand --forceExit`
Expected: PASS.

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 8: Commit**

```
git add src/crm-funders/crm-funders.service.ts src/crm-funders/crm-funders.module.ts src/crm-funders/crm-funders.service.spec.ts
git commit -m "feat(crm-funders): enfileirar notificacao de grant criado (fire-and-forget)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Notas de execução

- **Verificação de integração opcional** (com Memurai a correr): arrancar a app (`npm run start:dev` ou equivalente) e confirmar nos logs que a fila `audit`/`notifications` liga ao Redis sem erros. Não é obrigatório para fechar as tarefas (os testes usam mocks).
- **Ordem das tarefas importa:** Task 2/3/4 dependem do `QueueModule` (Task 1) e Task 4 depende do `enqueueSend` (Task 3).
- **Máquina sob carga:** correr jest `--runInBand` por ficheiro; um `tsc --noEmit` de cada vez.
