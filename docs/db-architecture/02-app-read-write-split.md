# Fase 3 — Read/Write Split na Aplicação (NestJS + Prisma 7)

> Objectivo: escrita → primary (master); leitura → réplica (slave). Com segurança contra
> *replication lag* (read-after-write). Código pronto para o vosso `src/prisma/prisma.service.ts`.

---

## A. Instalar a extensão oficial

```bash
npm install @prisma/extension-read-replicas
```

A extensão adiciona routing automático:
- Queries de **escrita** (`create`, `update`, `delete`, `$executeRaw`, transacções) → **primary**.
- Queries de **leitura** (`findMany`, `findUnique`, `count`, ...) → **réplica**.
- `prisma.$primary()` força uma leitura no primary (para casos read-after-write).

---

## B. `prisma.service.ts` — versão com read-replicas

> Mantém o vosso padrão actual (`Pool` + `PrismaPg` + slow query log) e acrescenta a réplica.
> Substitui o ficheiro `src/prisma/prisma.service.ts` por esta versão quando fizer a Fase 3.

```typescript
import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { readReplicas } from '@prisma/extension-read-replicas';
import { Pool } from 'pg';
import * as fs from 'fs';

function makePool(connectionString: string, max: number) {
  return new Pool({
    connectionString,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max,
    idleTimeoutMillis: 600000,
    connectionTimeoutMillis: 30000,
  });
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  /** Cliente estendido com routing de réplicas. Use ESTE nos repositórios/serviços. */
  public readonly db: ReturnType<PrismaService['buildExtended']>;

  constructor() {
    const writePool = makePool(
      process.env.DATABASE_URL as string,
      parseInt(process.env.DB_POOL_MAX || '10', 10), // baixo: o pooler do provider multiplexa
    );
    super({
      adapter: new PrismaPg(writePool),
      log: process.env.SLOW_QUERY_LOG ? [{ emit: 'event', level: 'query' }] : [],
    });
    this.db = this.buildExtended();
  }

  private buildExtended() {
    const replicaUrl = process.env.DATABASE_REPLICA_URL;
    const useReplicas = process.env.USE_REPLICAS === 'true' && !!replicaUrl;

    if (!useReplicas) {
      this.logger?.warn?.('Read replicas DESLIGADAS — todas as queries vão para o primary.');
      return this.$extends({}) as any;
    }

    const replicaPool = makePool(
      replicaUrl as string,
      parseInt(process.env.DB_REPLICA_POOL_MAX || '10', 10),
    );
    return this.$extends(
      readReplicas({ replicas: [new PrismaPg(replicaPool)] as any }),
    ) as any;
  }

  async onModuleInit() {
    await this.$connect();
    if (process.env.SLOW_QUERY_LOG) {
      const thresholdMs = parseInt(process.env.SLOW_QUERY_MS || '500', 10);
      const stream = fs.createWriteStream(
        process.env.SLOW_QUERY_LOG_FILE || 'load-tests/reports/slow-queries.log',
        { flags: 'a' },
      );
      (this as any).$on('query', (e: { query: string; params: string; duration: number }) => {
        if (e.duration >= thresholdMs) {
          stream.write(`${e.duration}ms | ${e.query} | params=${e.params}\n`);
        }
      });
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

> **Compatibilidade Prisma 7 + driver adapter:** a extensão aceita instâncias de adapter como
> réplicas. Se a versão instalada não aceitar `PrismaPg` directamente, use a forma por URL:
> `readReplicas({ url: process.env.DATABASE_REPLICA_URL })`. Validar com `npm run test:smoke`.

---

## C. ⚠️ Read-after-write (o bug a evitar)

Depois de uma **escrita**, uma leitura imediata pode bater numa réplica atrasada e **não ver
o dado**. Force o primary nesses casos:

```typescript
// Exemplo: inscrever e devolver imediatamente a inscrição criada
async enrollAndReturn(userId: number, courseId: number) {
  await this.prisma.db.enrollment.create({ data: { userId, courseId, status: 'ACTIVE' } });

  // ❌ ERRADO: pode ler de réplica atrasada e devolver vazio
  // return this.prisma.db.enrollment.findFirst({ where: { userId, courseId } });

  // ✅ CERTO: leitura forçada no primary logo após a escrita
  return this.prisma.db.$primary().enrollment.findFirst({ where: { userId, courseId } });
}
```

**Regra prática:** se na mesma request você **escreve e depois lê o mesmo dado**, use
`$primary()`. Para leituras puras (listas, dashboards, relatórios) deixe ir à réplica.

---

## D. Migração progressiva (sem big-bang)

1. Deploy com `USE_REPLICAS=false` → comportamento idêntico ao actual (zero risco).
2. Trocar serviços para usar `this.prisma.db.*` em vez de `this.prisma.*` (mesma API).
3. Activar `USE_REPLICAS=true` em staging → load-test → produção.
4. Se aparecer qualquer inconsistência: pôr `USE_REPLICAS=false` (rollback instantâneo, sem deploy).

---

## E. Candidatos prioritários a leitura na réplica (read-heavy do INNOVA)

Endpoints de leitura pura, seguros para réplica (do load-test e controllers):
`GET /courses`, `GET /courses/:id`, `GET /enrollment/my`, `GET /certificates/my`,
`GET /users`, `GET /pdi/my`, `GET /attendance/my`, `GET /audit-logs`, dashboards institucionais.

Fluxos que precisam de `$primary()` no read-after-write:
`POST /enrollment` seguido de leitura da inscrição; submissão de avaliação seguida de leitura.
