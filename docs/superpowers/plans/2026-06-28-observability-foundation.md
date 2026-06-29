# Fundação de observabilidade — Plano de Implementação (regras 1,2,3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Logging JSON estruturado com Request-ID por pedido (`nestjs-pino`) e um exception filter global que loga stack traces completos e devolve erros JSON com `requestId`.

**Architecture:** `nestjs-pino` substitui o logger do Nest (JSON, reqId via AsyncLocalStorage, header `x-request-id`). Um `AllExceptionsFilter` global (registado via `APP_FILTER`) loga com stack e responde JSON consistente sem expor o stack.

**Tech Stack:** NestJS 11, nestjs-pino + pino + pino-http (+ pino-pretty dev), Jest.

## Global Constraints

- Logger: **`nestjs-pino`**. Request-ID: honra `x-request-id` recebido, senão gera `randomUUID()` (de `node:crypto` — NÃO adicionar o pacote `uuid`). Devolve `x-request-id` no header da resposta.
- Redação obrigatória nos logs: `req.headers.authorization`, `req.headers.cookie`, `req.body.password`, `res.headers["set-cookie"]`.
- O **stack trace nunca** vai na resposta HTTP (só nos logs). Erros JSON: `{ statusCode, message, requestId, path, timestamp }`. `HttpException` preservam `statusCode`/`message`.
- Pretty em dev (`NODE_ENV !== 'production'`), JSON puro em prod.
- Jest: `--forceExit`, `--testPathPatterns`; máquina sob carga → `--runInBand` por ficheiro; `npx` sem pipe (ou `cmd /c`); `tsc` OOM → `node --max-old-space-size=4096 node_modules/typescript/bin/tsc --noEmit`.
- Commits `--no-verify`, terminam com: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

### Task 1: nestjs-pino — logging JSON + request-id

**Files:**
- Modify: `package.json`/`package-lock.json` (deps)
- Modify: `src/app.module.ts` (LoggerModule.forRoot)
- Modify: `src/main.ts` (bufferLogs + useLogger)

**Interfaces:**
- Produces: logger pino global; `reqId` em todos os logs; header `x-request-id`. O `PinoLogger`/`Logger` de `nestjs-pino` fica injetável (usado na Task 2).

- [ ] **Step 1: Instalar deps**
Run: `npm install nestjs-pino pino pino-http --no-audit --no-fund`
Run: `npm install --save-dev pino-pretty --no-audit --no-fund`

- [ ] **Step 2: Adicionar `LoggerModule.forRoot` ao `app.module.ts`**
Import no topo:
```ts
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
```
No array `imports` do `AppModule`, logo a seguir a `ConfigModule.forRoot({ isGlobal: true }),`, adicionar:
```ts
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        autoLogging: true,
        genReqId: (req, res) => {
          const incoming = req.headers['x-request-id'];
          const id =
            (Array.isArray(incoming) ? incoming[0] : incoming) || randomUUID();
          res.setHeader('x-request-id', id);
          return id;
        },
        customProps: (req) => ({ reqId: (req as { id?: string }).id }),
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.body.password',
            'res.headers["set-cookie"]',
          ],
          remove: true,
        },
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { singleLine: true } }
            : undefined,
      },
    }),
```

- [ ] **Step 3: `main.ts` — usar o logger pino**
No topo, adicionar: `import { Logger } from 'nestjs-pino';`
Substituir:
```ts
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug'],
  });
```
por:
```ts
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
```

- [ ] **Step 4: Typecheck**
Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Build + smoke**
Run: `npm run build`
Expected: compila sem erros.
(Opcional, se houver BD/Redis: `npm run start:dev` brevemente → confirmar que os logs saem em JSON/pretty com `reqId` e que um pedido a `/health` produz 1 linha de log.)

- [ ] **Step 6: Commit**
```
git add package.json package-lock.json src/app.module.ts src/main.ts
git commit --no-verify -m "feat(observability): logging JSON estruturado + request-id (nestjs-pino)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Exception filter global (stack trace + erros JSON)

**Files:**
- Create: `src/common/filters/all-exceptions.filter.ts`
- Create: `src/common/filters/all-exceptions.filter.spec.ts`
- Modify: `src/app.module.ts` (provider `APP_FILTER`)

**Interfaces:**
- Consumes: `PinoLogger` (de nestjs-pino, Task 1).
- Produces: respostas de erro JSON `{ statusCode, message, requestId, path, timestamp }`.

- [ ] **Step 1: Escrever o teste que falha — `all-exceptions.filter.spec.ts`**
```ts
import { NotFoundException } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';

function makeRes() {
  const r: any = {};
  r.status = jest.fn(() => r);
  r.json = jest.fn(() => r);
  return r;
}
function makeHost(req: any, res: any): any {
  return { switchToHttp: () => ({ getResponse: () => res, getRequest: () => req }) };
}

describe('AllExceptionsFilter', () => {
  const logger = { error: jest.fn(), warn: jest.fn(), setContext: jest.fn() } as any;
  beforeEach(() => jest.clearAllMocks());

  it('erro genérico (500): loga com stack e responde JSON com requestId, sem stack', () => {
    const res = makeRes();
    new AllExceptionsFilter(logger).catch(
      new Error('boom'),
      makeHost({ method: 'GET', url: '/x', id: 'req-1' }, res),
    );
    expect(logger.error).toHaveBeenCalled();
    expect(logger.error.mock.calls[0][0].err.stack).toBeDefined();
    expect(res.status).toHaveBeenCalledWith(500);
    const body = res.json.mock.calls[0][0];
    expect(body).toEqual(
      expect.objectContaining({ statusCode: 500, requestId: 'req-1', path: '/x' }),
    );
    expect(body.stack).toBeUndefined();
  });

  it('HttpException (404): usa warn e preserva statusCode/mensagem', () => {
    const res = makeRes();
    new AllExceptionsFilter(logger).catch(
      new NotFoundException('não existe'),
      makeHost({ method: 'GET', url: '/y', id: 'req-2' }, res),
    );
    expect(logger.warn).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json.mock.calls[0][0]).toEqual(
      expect.objectContaining({ statusCode: 404, message: 'não existe', requestId: 'req-2' }),
    );
  });
});
```

- [ ] **Step 2: Correr — deve falhar**
Run: `npx jest src/common/filters/all-exceptions.filter.spec.ts --runInBand --forceExit`
Expected: FAIL (o filtro ainda não existe).

- [ ] **Step 3: Criar `src/common/filters/all-exceptions.filter.ts`**
```ts
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { PinoLogger } from 'nestjs-pino';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext('AllExceptionsFilter');
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { id?: string }>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const message =
      exception instanceof HttpException ? exception.message : 'Internal server error';

    const logPayload = {
      statusCode: status,
      method: req.method,
      path: req.url,
      err:
        exception instanceof Error
          ? { message: exception.message, stack: exception.stack }
          : { value: exception },
    };
    if (status >= 500) this.logger.error(logPayload, message);
    else this.logger.warn(logPayload, message);

    res.status(status).json({
      statusCode: status,
      message,
      requestId: req.id,
      path: req.url,
      timestamp: new Date().toISOString(),
    });
  }
}
```

- [ ] **Step 4: Registar via `APP_FILTER` no `app.module.ts`**
Imports no topo:
```ts
import { APP_FILTER } from '@nestjs/core';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
```
No array `providers` do `AppModule`, adicionar:
```ts
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
```

- [ ] **Step 5: Correr o teste — deve passar**
Run: `npx jest src/common/filters/all-exceptions.filter.spec.ts --runInBand --forceExit`
Expected: PASS (2 testes).

- [ ] **Step 6: Typecheck + build**
Run: `npx tsc --noEmit` → sem erros.
Run: `npm run build` → compila.

- [ ] **Step 7: Commit**
```
git add src/common/filters/all-exceptions.filter.ts src/common/filters/all-exceptions.filter.spec.ts src/app.module.ts
git commit --no-verify -m "feat(observability): exception filter global com stack trace e erros JSON

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Notas de execução
- **Risco de regressão:** o filtro global uniformiza o formato das respostas de erro. Se algum teste de integração (`test/jest-integration`) assertar o shape antigo de erro, pode partir. Correr a suite relevante após a Task 2; se houver falha, ajustar o teste ao novo shape `{ statusCode, message, requestId, path, timestamp }` (que preserva `statusCode`/`message`).
- `nestjs-pino` exporta tanto `Logger` (para `app.useLogger`) como `PinoLogger` (injetável no filtro) — usar cada um no seu sítio.
- O CI corre a suite completa — confirmar verde antes do merge.
