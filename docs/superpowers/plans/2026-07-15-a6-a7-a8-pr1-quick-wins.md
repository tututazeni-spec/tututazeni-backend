# A6+A7+A8 PR1 — Security Quick Wins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar 9 achados de segurança (A6/A7/A8) sem adicionar dependências novas — rate limiting, fail-fast de env, Swagger guard e logging via Pino.

**Architecture:** Seis alterações independentes numa única branch. Cada task tem o seu test cycle e commit. Os ficheiros novos (`validate-env.ts`, `swagger-auth.middleware.ts`) são utilitários puros sem estado — fáceis de testar em isolamento.

**Tech Stack:** NestJS 10, `class-validator`, `@nestjs/throttler`, `nestjs-pino` ^4.6.1, Express middleware, Jest

## Global Constraints

- Branch: `fix/a6-a7-a8-pr1-quick-wins` criada a partir de `main`
- `nestjs-pino` já instalado — `PinoLogger` e `InjectPinoLogger` disponíveis
- `@nestjs/config` já instalado — não é necessário reinstalar
- Porta da aplicação: 4000; sem prefixo global de rotas
- Todos os testes correm com: `npx jest <caminho-do-spec> --no-coverage`
- Não executar o suite completo (lento no Windows) — testar só o ficheiro relevante por task
- Commits em português no formato `fix(security): ...`

---

## Mapa de ficheiros

| Acção | Ficheiro |
|-------|----------|
| Modificar | `src/search/search.dto.ts` |
| Criar | `src/search/search.dto.spec.ts` |
| Modificar | `src/auth/auth.controller.ts` |
| Modificar | `src/auth/auth.controller.spec.ts` |
| Modificar | `.env.example` |
| Criar | `src/common/bootstrap/validate-env.ts` |
| Criar | `src/common/bootstrap/validate-env.spec.ts` |
| Modificar | `src/main.ts` |
| Criar | `src/common/security/swagger-auth.middleware.ts` |
| Criar | `src/common/security/swagger-auth.middleware.spec.ts` |
| Modificar | `src/app.module.ts` |
| Modificar | `src/common/interceptors/logging.interceptor.ts` |
| Modificar | `src/common/interceptors/logging.interceptor.spec.ts` |

---

## Task 1: A6 — @Max(100) em DTOs de pesquisa

**Files:**
- Modify: `src/search/search.dto.ts`
- Create: `src/search/search.dto.spec.ts`

**Interfaces:**
- Produz: `GlobalSearchDto.limit`, `TypedSearchDto.limit`, `AutocompleteDto.limit` com `@Max(100)` — validação é feita pelo `ValidationPipe` global

- [ ] **Step 1: Criar o teste que falha**

```typescript
// src/search/search.dto.spec.ts
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { GlobalSearchDto, TypedSearchDto, AutocompleteDto } from './search.dto';

async function errorsFor<T extends object>(
  cls: new () => T,
  value: Record<string, unknown>,
): Promise<string[]> {
  const obj = plainToInstance(cls, value);
  const errors = await validate(obj);
  return errors.flatMap(e => Object.values(e.constraints ?? {}));
}

describe('Search DTOs — limit máximo', () => {
  describe('GlobalSearchDto', () => {
    it('aceita limit=100', async () => {
      expect(await errorsFor(GlobalSearchDto, { q: 'test', limit: 100 })).toHaveLength(0);
    });
    it('rejeita limit=101', async () => {
      expect((await errorsFor(GlobalSearchDto, { q: 'test', limit: 101 })).length).toBeGreaterThan(0);
    });
    it('aceita limit omitido', async () => {
      expect(await errorsFor(GlobalSearchDto, { q: 'test' })).toHaveLength(0);
    });
  });

  describe('TypedSearchDto', () => {
    it('aceita limit=100', async () => {
      expect(await errorsFor(TypedSearchDto, { q: 'test', limit: 100 })).toHaveLength(0);
    });
    it('rejeita limit=101', async () => {
      expect((await errorsFor(TypedSearchDto, { q: 'test', limit: 101 })).length).toBeGreaterThan(0);
    });
  });

  describe('AutocompleteDto', () => {
    it('aceita limit=100', async () => {
      expect(await errorsFor(AutocompleteDto, { q: 'ac', limit: 100 })).toHaveLength(0);
    });
    it('rejeita limit=101', async () => {
      expect((await errorsFor(AutocompleteDto, { q: 'ac', limit: 101 })).length).toBeGreaterThan(0);
    });
  });
});
```

- [ ] **Step 2: Correr o teste — verificar que falha**

```
npx jest src/search/search.dto.spec.ts --no-coverage
```

Resultado esperado: FAIL — "rejeita limit=101" falha porque `@Max` ainda não existe.

- [ ] **Step 3: Implementar — adicionar `Max` ao import e `@Max(100)` aos três campos**

Em `src/search/search.dto.ts`, linha 2, adicionar `Max` ao import:
```typescript
import {
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  IsArray,
  IsBoolean,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
```

No `GlobalSearchDto` (linha 61-66), adicionar `@Max(100)` antes de `@Type`:
```typescript
  @ApiPropertyOptional({ default: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number;
```

No `TypedSearchDto` (linha 84-89), adicionar `@Max(100)`:
```typescript
  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number;
```

No `AutocompleteDto` (linha 100-105), adicionar `@Max(100)`:
```typescript
  @ApiPropertyOptional({ default: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number;
```

- [ ] **Step 4: Correr o teste — verificar que passa**

```
npx jest src/search/search.dto.spec.ts --no-coverage
```

Resultado esperado: PASS — 7 testes passam.

- [ ] **Step 5: Commit**

```
git add src/search/search.dto.ts src/search/search.dto.spec.ts
git commit -m "fix(security): @Max(100) em GlobalSearchDto, TypedSearchDto e AutocompleteDto — A6"
```

---

## Task 2: A6 — @Throttle em /auth/refresh e /auth/reset-password

**Files:**
- Modify: `src/auth/auth.controller.ts`
- Modify: `src/auth/auth.controller.spec.ts`

**Interfaces:**
- Consome: `authThrottleLimit()` já exportado do mesmo ficheiro (padrão existente)
- Produz: `refreshThrottleLimit()` exportado (testável), `REFRESH_THROTTLE` constante, `@Throttle(REFRESH_THROTTLE)` em `refresh`, `@Throttle(AUTH_THROTTLE)` em `resetPassword`

- [ ] **Step 1: Adicionar testes ao spec existente**

Em `src/auth/auth.controller.spec.ts`, adicionar ao bloco `describe('AuthController throttle metadata (C2)')` (após o teste do `login`, linha 19):

```typescript
  it('refreshThrottleLimit retorna 10000 em test e 10 em produção', () => {
    expect(refreshThrottleLimit('test')).toBe(10000);
    expect(refreshThrottleLimit('production')).toBe(10);
    expect(refreshThrottleLimit('development')).toBe(10);
  });

  it('refresh tem decorator @Throttle definido', () => {
    const meta = Reflect.getMetadata('THROTTLER:LIMITdefault', AuthController.prototype.refresh);
    expect(meta).toBeDefined();
  });

  it('resetPassword tem decorator @Throttle definido', () => {
    const meta = Reflect.getMetadata('THROTTLER:LIMITdefault', AuthController.prototype.resetPassword);
    expect(meta).toBeDefined();
  });
```

Actualizar o import do controller para incluir `refreshThrottleLimit`:
```typescript
import { AuthController, authThrottleLimit, refreshThrottleLimit } from './auth.controller';
```

- [ ] **Step 2: Correr os testes novos — verificar que falham**

```
npx jest src/auth/auth.controller.spec.ts --no-coverage
```

Resultado esperado: FAIL — `refreshThrottleLimit` não exportado, `THROTTLER:LIMITdefault` undefined em `refresh` e `resetPassword`.

- [ ] **Step 3: Implementar em auth.controller.ts**

Após a linha `export function authThrottleLimit(...)` (linha 30), adicionar:

```typescript
export function refreshThrottleLimit(env: string | undefined = process.env.NODE_ENV): number {
  return env === 'test' ? 10000 : 10;
}
```

Após a linha `const AUTH_THROTTLE = ...` (linha 34), adicionar:

```typescript
const REFRESH_THROTTLE = { default: { limit: refreshThrottleLimit(), ttl: 60000 } };
```

No método `refresh` (linha 65), adicionar `@Throttle(REFRESH_THROTTLE)` antes de `@Post('refresh')`:

```typescript
  @Public()
  @Throttle(REFRESH_THROTTLE)
  @Post('refresh')
  @UseGuards(RefreshTokenGuard)
  async refresh(
```

No método `resetPassword` (linha 107), adicionar `@Throttle(AUTH_THROTTLE)` antes de `@Post('reset-password')`:

```typescript
  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
```

- [ ] **Step 4: Correr os testes — verificar que passam**

```
npx jest src/auth/auth.controller.spec.ts --no-coverage
```

Resultado esperado: PASS — todos os testes passam incluindo os novos.

- [ ] **Step 5: Commit**

```
git add src/auth/auth.controller.ts src/auth/auth.controller.spec.ts
git commit -m "fix(security): @Throttle em /auth/refresh (10/min) e /auth/reset-password (5/min) — A6"
```

---

## Task 3: A7 — .env.example + validateEnv() + fail-fast em main.ts

**Files:**
- Modify: `.env.example`
- Create: `src/common/bootstrap/validate-env.ts`
- Create: `src/common/bootstrap/validate-env.spec.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Produz: `validateEnv(env?: NodeJS.ProcessEnv): void` — lança `Error` se vars críticas em falta; `console.warn` para vars de aviso

- [ ] **Step 1: Criar o teste que falha**

```typescript
// src/common/bootstrap/validate-env.spec.ts
import { validateEnv } from './validate-env';

const BASE = {
  JWT_SECRET: 'supersecret-key-with-more-than-32-chars!!',
  JWT_REFRESH_SECRET: 'another-refresh-secret-long-enough!!',
  ALLOWED_FILE_HOST: 'storage.innova.ao',
};

describe('validateEnv', () => {
  it('não lança com todas as vars obrigatórias definidas', () => {
    expect(() => validateEnv(BASE)).not.toThrow();
  });

  it('lança quando JWT_SECRET é o valor placeholder', () => {
    expect(() => validateEnv({ ...BASE, JWT_SECRET: 'your_jwt_secret' }))
      .toThrow('JWT_SECRET');
  });

  it('lança quando JWT_SECRET está em falta', () => {
    const { JWT_SECRET, ...rest } = BASE;
    expect(() => validateEnv(rest as NodeJS.ProcessEnv)).toThrow('JWT_SECRET');
  });

  it('lança quando JWT_REFRESH_SECRET está em falta', () => {
    const { JWT_REFRESH_SECRET, ...rest } = BASE;
    expect(() => validateEnv(rest as NodeJS.ProcessEnv)).toThrow('JWT_REFRESH_SECRET');
  });

  it('lança quando ALLOWED_FILE_HOST está em falta', () => {
    const { ALLOWED_FILE_HOST, ...rest } = BASE;
    expect(() => validateEnv(rest as NodeJS.ProcessEnv)).toThrow('ALLOWED_FILE_HOST');
  });

  it('não lança mesmo com APP_URL em falta (apenas warn)', () => {
    expect(() => validateEnv(BASE)).not.toThrow();
  });
});
```

- [ ] **Step 2: Correr o teste — verificar que falha**

```
npx jest src/common/bootstrap/validate-env.spec.ts --no-coverage
```

Resultado esperado: FAIL — módulo não encontrado.

- [ ] **Step 3: Criar src/common/bootstrap/validate-env.ts**

```typescript
// src/common/bootstrap/validate-env.ts
export function validateEnv(env: NodeJS.ProcessEnv = process.env): void {
  const { JWT_SECRET, JWT_REFRESH_SECRET, ALLOWED_FILE_HOST } = env;

  if (!JWT_SECRET || JWT_SECRET === 'your_jwt_secret') {
    throw new Error(
      '[BOOT] JWT_SECRET não está definido ou ainda tem o valor placeholder. ' +
      'Define uma chave forte (mínimo 32 caracteres) no ficheiro .env de produção.',
    );
  }

  if (!JWT_REFRESH_SECRET) {
    throw new Error('[BOOT] JWT_REFRESH_SECRET não está definido no ficheiro .env.');
  }

  if (!ALLOWED_FILE_HOST) {
    throw new Error(
      '[BOOT] ALLOWED_FILE_HOST não está definido. ' +
      'Ex: ALLOWED_FILE_HOST=storage.innova.ao',
    );
  }

  if (!env.APP_URL) {
    console.warn(
      '[BOOT] APP_URL não definido — links em documentos e declarações usarão o valor hardcoded.',
    );
  }

  if (!env.METRICS_TOKEN) {
    console.warn('[BOOT] METRICS_TOKEN não definido — endpoint /metrics pode estar desprotegido.');
  }

  if (!env.STORAGE_BASE_URL) {
    console.warn('[BOOT] STORAGE_BASE_URL não definido — URLs de DOCX podem falhar.');
  }
}
```

- [ ] **Step 4: Correr o teste — verificar que passa**

```
npx jest src/common/bootstrap/validate-env.spec.ts --no-coverage
```

Resultado esperado: PASS — 6 testes passam.

- [ ] **Step 5: Actualizar .env.example**

Adicionar no final do ficheiro `.env.example` (preservar conteúdo existente, apenas adicionar o bloco):

```env

# ─── URLs e Infraestrutura ────────────────────────────────────────────────────
# URL pública da aplicação (usada em links de documentos, declarações e PDFs)
APP_URL=https://innova.ao

# URL base do storage externo (Cloudflare R2, S3, etc.)
STORAGE_BASE_URL=https://storage.innova.ao

# ─── Segurança e Acesso ───────────────────────────────────────────────────────
# Token Bearer para proteger o endpoint /metrics (Prometheus scraping)
METRICS_TOKEN=change-me-in-production

# Token Bearer para aceder ao Swagger UI em produção (GET /docs)
SWAGGER_TOKEN=change-me-in-production

# ─── IA Tutor ─────────────────────────────────────────────────────────────────
# Provider activo: groq | gemini | ollama
AI_PROVIDER=groq

GROQ_API_KEY=
GROQ_MODEL=llama3-70b-8192

GEMINI_API_KEY=
GEMINI_MODEL=gemini-1.5-pro

OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3

# ─── Configuração de Runtime ──────────────────────────────────────────────────
# Cache TTL do perfil de utilizador no JWT strategy (ms)
JWT_USER_CACHE_TTL_MS=30000

# Nível de log: trace | debug | info | warn | error | fatal
LOG_LEVEL=info
```

- [ ] **Step 6: Integrar validateEnv() em main.ts**

Em `src/main.ts`, adicionar o import após os imports existentes (linha 11):

```typescript
import { validateEnv } from './common/bootstrap/validate-env';
```

Adicionar a chamada logo no início de `bootstrap()`, antes de qualquer outra lógica (linha 14, após `async function bootstrap() {`):

```typescript
async function bootstrap() {
  validateEnv();

  const app = await NestFactory.create(AppModule, { bufferLogs: true });
```

- [ ] **Step 7: Verificar que os testes continuam a passar**

```
npx jest src/common/bootstrap/validate-env.spec.ts --no-coverage
```

Resultado esperado: PASS.

- [ ] **Step 8: Commit**

```
git add .env.example src/common/bootstrap/validate-env.ts src/common/bootstrap/validate-env.spec.ts src/main.ts
git commit -m "fix(security): fail-fast de env vars críticas no bootstrap + documentar vars em .env.example — A7"
```

---

## Task 4: A8 — Swagger guard via middleware Express

**Files:**
- Create: `src/common/security/swagger-auth.middleware.ts`
- Create: `src/common/security/swagger-auth.middleware.spec.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Produz: `createSwaggerAuthMiddleware(token: string | undefined): (req, res, next) => void` — factory pura, sem estado

- [ ] **Step 1: Criar o teste que falha**

```typescript
// src/common/security/swagger-auth.middleware.spec.ts
import { createSwaggerAuthMiddleware } from './swagger-auth.middleware';

describe('createSwaggerAuthMiddleware', () => {
  const TOKEN = 'test-swagger-token';
  const middleware = createSwaggerAuthMiddleware(TOKEN);

  let req: { headers: Record<string, string> };
  let res: { status: jest.Mock; json: jest.Mock };
  let next: jest.Mock;

  beforeEach(() => {
    req = { headers: {} };
    res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    next = jest.fn();
  });

  it('chama next() quando o token é correcto', () => {
    req.headers['authorization'] = `Bearer ${TOKEN}`;
    middleware(req as any, res as any, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('devolve 401 quando o header Authorization está em falta', () => {
    middleware(req as any, res as any, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: 'Unauthorized' });
    expect(next).not.toHaveBeenCalled();
  });

  it('devolve 401 quando o token é incorrecto', () => {
    req.headers['authorization'] = 'Bearer wrong-token';
    middleware(req as any, res as any, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('devolve 401 quando SWAGGER_TOKEN não está definido (undefined)', () => {
    const m = createSwaggerAuthMiddleware(undefined);
    req.headers['authorization'] = `Bearer ${TOKEN}`;
    m(req as any, res as any, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('devolve 401 quando SWAGGER_TOKEN está vazio', () => {
    const m = createSwaggerAuthMiddleware('');
    req.headers['authorization'] = 'Bearer ';
    m(req as any, res as any, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
```

- [ ] **Step 2: Correr o teste — verificar que falha**

```
npx jest src/common/security/swagger-auth.middleware.spec.ts --no-coverage
```

Resultado esperado: FAIL — módulo não encontrado.

- [ ] **Step 3: Criar swagger-auth.middleware.ts**

```typescript
// src/common/security/swagger-auth.middleware.ts
import { Request, Response, NextFunction } from 'express';

export function createSwaggerAuthMiddleware(token: string | undefined) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const bearer = req.headers['authorization']?.replace('Bearer ', '');
    if (!token || !bearer || bearer !== token) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }
    next();
  };
}
```

- [ ] **Step 4: Correr o teste — verificar que passa**

```
npx jest src/common/security/swagger-auth.middleware.spec.ts --no-coverage
```

Resultado esperado: PASS — 5 testes passam.

- [ ] **Step 5: Integrar em main.ts**

Em `src/main.ts`, adicionar o import após os imports existentes:

```typescript
import { createSwaggerAuthMiddleware } from './common/security/swagger-auth.middleware';
```

Na secção `// ─── Swagger ─────────────────────────────────────────────────────────────` (antes de `const config = new DocumentBuilder()`), adicionar o middleware:

```typescript
  // ─── Swagger ─────────────────────────────────────────────────────────────
  // Em produção, /docs e /docs-json exigem Bearer token (SWAGGER_TOKEN).
  // Nota: NestJS guards não se aplicam a rotas do SwaggerModule (nível Express);
  // o middleware Express é registado antes do setup do Swagger.
  if (isProd) {
    app.use(
      ['/docs', '/docs-json'],
      createSwaggerAuthMiddleware(process.env.SWAGGER_TOKEN),
    );
  }

  const config = new DocumentBuilder()
```

- [ ] **Step 6: Correr os testes**

```
npx jest src/common/security/swagger-auth.middleware.spec.ts --no-coverage
```

Resultado esperado: PASS.

- [ ] **Step 7: Commit**

```
git add src/common/security/swagger-auth.middleware.ts src/common/security/swagger-auth.middleware.spec.ts src/main.ts
git commit -m "fix(security): proteger /docs com middleware Bearer token em produção — A8"
```

---

## Task 5: A8 — Pino redact + autoLogging:false

**Files:**
- Modify: `src/app.module.ts`

**Interfaces:**
- Sem interfaces externas — apenas configuração do `LoggerModule`

Nota: não há teste unitário para esta task — o `redact` é configuração do Pino e só é verificável em runtime. O correcto é confirmar manualmente (ou em E2E) que os campos não aparecem nos logs.

- [ ] **Step 1: Actualizar app.module.ts — alargar redact.paths**

Em `src/app.module.ts`, na secção `redact.paths` (linhas 110-115), substituir pelo bloco completo:

```typescript
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.body.password',
            'req.body.newPassword',
            'req.body.currentPassword',
            'req.body.oldPassword',
            'req.body.token',
            'req.body.nif',
            'req.body.nib',
            'res.headers["set-cookie"]',
          ],
          remove: true,
        },
```

- [ ] **Step 2: Desactivar autoLogging para eliminar log duplicado**

Na mesma secção `pinoHttp` (linha 101), alterar `autoLogging: true` para `autoLogging: false`:

```typescript
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        autoLogging: false,
```

Justificação: o `LoggingInterceptor` (Task 6) passa a ser a única fonte de logs de request — elimina o duplicado e garante que o `userId` está sempre presente.

- [ ] **Step 3: Verificar que o módulo compila**

```
npx tsc --noEmit
```

Resultado esperado: sem erros de tipo.

- [ ] **Step 4: Commit**

```
git add src/app.module.ts
git commit -m "fix(security): alargar redact do Pino (nif, nib, token, passwords) e desactivar autoLogging — A8"
```

---

## Task 6: A8 — Refactorizar LoggingInterceptor para PinoLogger

**Files:**
- Modify: `src/common/interceptors/logging.interceptor.ts`
- Modify: `src/common/interceptors/logging.interceptor.spec.ts`

**Interfaces:**
- Consome: `PinoLogger`, `InjectPinoLogger` de `nestjs-pino` (já instalado ^4.6.1)
- Produz: `LoggingInterceptor` com construtor `constructor(@InjectPinoLogger(LoggingInterceptor.name) private readonly logger: PinoLogger)` — logging via `this.logger.info({ method, userId, ms }, 'http')`; **sem `url`** (previne exposição de query params)

- [ ] **Step 1: Actualizar o spec existente**

Substituir o conteúdo completo de `src/common/interceptors/logging.interceptor.spec.ts`:

```typescript
import { LoggingInterceptor } from './logging.interceptor';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';

describe('LoggingInterceptor', () => {
  let interceptor: LoggingInterceptor;
  let logger: { info: jest.Mock };

  beforeEach(() => {
    logger = { info: jest.fn() };
    interceptor = new LoggingInterceptor(logger as any);
  });

  it('deve ser definido', () => {
    expect(interceptor).toBeDefined();
  });

  it('loga method e userId via Pino info', done => {
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ method: 'GET', url: '/courses', user: { id: 42 } }),
      }),
    } as unknown as ExecutionContext;

    const next: CallHandler = { handle: () => of({ data: 'ok' }) };

    interceptor.intercept(context, next).subscribe(() => {
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'GET', userId: 42 }),
        'http',
      );
      done();
    });
  });

  it('loga userId como null para pedidos anónimos', done => {
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ method: 'POST', url: '/auth/login', user: undefined }),
      }),
    } as unknown as ExecutionContext;

    const next: CallHandler = { handle: () => of(null) };

    interceptor.intercept(context, next).subscribe(() => {
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ userId: null }),
        'http',
      );
      done();
    });
  });

  it('NÃO inclui url no objecto logado (previne exposição de query params)', done => {
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ method: 'GET', url: '/search?q=nome+apelido+secreto', user: { id: 1 } }),
      }),
    } as unknown as ExecutionContext;

    const next: CallHandler = { handle: () => of([]) };

    interceptor.intercept(context, next).subscribe(() => {
      const loggedObj = (logger.info.mock.calls[0] as any[])[0];
      expect(loggedObj).not.toHaveProperty('url');
      done();
    });
  });

  it('inclui ms (tempo de resposta) no log', done => {
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ method: 'GET', url: '/courses', user: { id: 1 } }),
      }),
    } as unknown as ExecutionContext;

    const next: CallHandler = { handle: () => of('ok') };

    interceptor.intercept(context, next).subscribe(() => {
      const loggedObj = (logger.info.mock.calls[0] as any[])[0];
      expect(typeof loggedObj.ms).toBe('number');
      done();
    });
  });
});
```

- [ ] **Step 2: Correr o spec — verificar que falha**

```
npx jest src/common/interceptors/logging.interceptor.spec.ts --no-coverage
```

Resultado esperado: FAIL — `new LoggingInterceptor(logger)` falha (construtor não aceita argumento).

- [ ] **Step 3: Substituir o conteúdo de logging.interceptor.ts**

```typescript
// src/common/interceptors/logging.interceptor.ts
import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PinoLogger, InjectPinoLogger } from 'nestjs-pino';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(
    @InjectPinoLogger(LoggingInterceptor.name)
    private readonly logger: PinoLogger,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const { method, user } = req;
    const now = Date.now();

    return next.handle().pipe(
      tap(() => {
        this.logger.info({ method, userId: user?.id ?? null, ms: Date.now() - now }, 'http');
      }),
    );
  }
}
```

- [ ] **Step 4: Correr o spec — verificar que passa**

```
npx jest src/common/interceptors/logging.interceptor.spec.ts --no-coverage
```

Resultado esperado: PASS — 5 testes passam.

- [ ] **Step 5: Commit**

```
git add src/common/interceptors/logging.interceptor.ts src/common/interceptors/logging.interceptor.spec.ts
git commit -m "fix(security): refactorizar LoggingInterceptor para PinoLogger — elimina duplicado e bypass de redact — A8"
```

---

## Task 7: Criar branch, push e PR

- [ ] **Step 1: Verificar que todos os testes das tasks anteriores passam**

```
npx jest src/search/search.dto.spec.ts src/auth/auth.controller.spec.ts src/common/bootstrap/validate-env.spec.ts src/common/security/swagger-auth.middleware.spec.ts src/common/interceptors/logging.interceptor.spec.ts --no-coverage
```

Resultado esperado: PASS em todos.

- [ ] **Step 2: Verificar git status**

```
git status
git log --oneline -6
```

Resultado esperado: working tree limpo, 6 commits na branch.

- [ ] **Step 3: Push e PR**

```
git push -u origin fix/a6-a7-a8-pr1-quick-wins
```

```
gh pr create --title "fix(security): A6+A7+A8 PR1 — rate limiting, secrets e logging hardening" --body "$(cat <<'EOF'
## Achados remediados

- **A6-1/2** `@Max(100)` em `GlobalSearchDto`, `TypedSearchDto`, `AutocompleteDto` — bloqueia DoS por queries paralelas ilimitadas
- **A6-3/4** `@Throttle` em `/auth/refresh` (10/min) e `/auth/reset-password` (5/min)
- **A7-1/2/3/4** `.env.example` actualizado com 13 variáveis documentadas (`APP_URL`, `METRICS_TOKEN`, `STORAGE_BASE_URL`, AI keys, etc.)
- **A7-5** `validateEnv()` no bootstrap — falha hard se `JWT_SECRET` é placeholder ou vars críticas em falta
- **A8-1** Swagger `/docs` protegido por middleware Bearer token em produção (`SWAGGER_TOKEN`)
- **A8-2** `LoggingInterceptor` refactorizado para `PinoLogger` — elimina log duplicado e bypass do redact
- **A8-3** Pino `redact` alargado: `newPassword`, `currentPassword`, `oldPassword`, `token`, `nif`, `nib`
- `autoLogging: false` no pino-http — `LoggingInterceptor` é agora a única fonte de logs de request

## Sem alterações ao schema Prisma
## Zero dependências novas

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
