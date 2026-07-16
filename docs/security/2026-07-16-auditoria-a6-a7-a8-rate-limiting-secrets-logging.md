# Auditoria A-6 / A-7 / A-8 — Rate Limiting, Secrets e Logging (INNOVA)

> Faixas A-6, A-7 e A-8 da auditoria de production readiness. Data: 2026-07-15.
> Âmbito: protecção contra DoS e brute-force (A-6), gestão de variáveis de
> ambiente e segredos (A-7), e exposição de informação via logs e docs (A-8).
> Repositório: `innova` (backend NestJS).
> **Todos os achados foram remediados em PR #32, #34 e #35.**

---

## 1. Resumo executivo

As três faixas partilham um denominador comum: **ausência de barreiras entre a
aplicação e o exterior** — qualquer utilizador autenticado pode disparar queries
pesadas sem limite de taxa; os segredos de produção não têm validação no arranque;
e o Swagger UI fica exposto sem autenticação, enquanto o logger regista campos
PII em claro.

Nenhum dos 10 achados exigia dependências novas de peso — foram resolvidos com
decoradores `@Throttle`, validação Joi no bootstrap, middleware Express e
configuração do Pino. As correções foram distribuídas por três PRs:

| PR | Branch | Achados fechados |
|---|---|---|
| #32 | `fix/a6-a7-a8-pr1-quick-wins` | A6-1/2, A6-3/4, A7-1..5, A8-1..3 |
| #34 | `fix/a6-a7-a8-pr2-env-schema` | A7-6 (schema Joi completo) |
| #35 | `fix/a6-5-throttler-redis-store` | A6-5 (ThrottlerStore Redis) |

---

## 2. Faixa A-6 — Rate Limiting e DoS

### 2.1 Cenário de ataque

**Brute-force de tokens.** `/auth/refresh` e `/auth/reset-password` são
endpoints `@Public()` — não passam pelo `JwtAuthGuard`. Antes da remediação,
tinham apenas o limite global de 100 req/min por IP, partilhado com toda a API.
Um atacante podia fazer centenas de tentativas de brute-force de refresh tokens
sem qualquer bloqueio dedicado.

**DoS por query amplificada.** `GET /search?q=a&limit=10000` era válido. O
`SearchService` executava até 7 queries Prisma em paralelo com `take: 10000`
por pedido — um único utilizador autenticado podia saturar a BD.

**Perda de contadores em restart.** O `ThrottlerModule` usava armazenamento
in-memory (default): todos os contadores de rate limiting eram perdidos em cada
restart da aplicação — um atacante que soubesse do restart podia explorar a
janela.

### 2.2 Achados

| ID | Severidade | Descrição | Evidência | Estado |
|---|---|---|---|---|
| A6-1/2 | 🟠 Alto | `limit` sem `@Max()` em `GlobalSearchDto`, `TypedSearchDto`, `AutocompleteDto` — qualquer utilizador autenticado podia enviar `limit=10000` | `src/search/search.dto.ts` | ✅ Corrigido (#32) |
| A6-3/4 | 🟠 Alto | `/auth/refresh` e `/auth/reset-password` com apenas o limite global de 100/min, sem throttle dedicado | `src/auth/auth.controller.ts` | ✅ Corrigido (#32) |
| A6-5 | 🟡 Médio | `ThrottlerModule.forRoot()` com armazenamento in-memory — contadores perdidos em restart; sem partilha entre instâncias | `src/app.module.ts:138` | ✅ Corrigido (#35) |

### 2.3 Correções aplicadas

**A6-1/2 — `@Max(100)` nos DTOs de pesquisa** (`src/search/search.dto.ts`):

```typescript
// Antes
@IsOptional()
@IsInt()
limit?: number;

// Depois
@IsOptional()
@IsInt()
@Max(100)
limit?: number;
```

Aplicado a `GlobalSearchDto.limit`, `TypedSearchDto.limit` e
`AutocompleteDto.limit`. O `ValidationPipe` global rejeita pedidos com
`limit > 100`.

**A6-3/4 — `@Throttle` dedicado em endpoints de auth** (`src/auth/auth.controller.ts`):

```typescript
@Throttle({ default: { limit: 10, ttl: 60_000 } })
@Post('refresh')
async refresh(...)

@Throttle({ default: { limit: 5, ttl: 60_000 } })
@Post('reset-password')
async resetPassword(...)
```

**A6-5 — `ThrottlerStorageRedisService`** (`src/common/config/throttler.config.ts`):

```typescript
export function buildThrottlerOptions(config: ConfigService) {
  const isTest = config.get<string>('NODE_ENV') === 'test';
  return {
    throttlers: [{ ttl: THROTTLE_TTL, limit: isTest ? THROTTLE_LIMIT_TEST : THROTTLE_LIMIT_PROD }],
    storage: new ThrottlerStorageRedisService(new Redis({ ... })),
  };
}
```

`ThrottlerModule.forRootAsync({ useFactory: buildThrottlerOptions })` — os
contadores persistem no Redis entre restarts e são partilhados entre instâncias.

---

## 3. Faixa A-7 — Secrets e Configuração

### 3.1 Cenário de ataque

**JWT com placeholder em produção.** Se `JWT_SECRET=your_jwt_secret` fosse
usado em produção (sem falha de arranque), qualquer atacante que soubesse do
placeholder podia assinar tokens válidos para qualquer utilizador — incluindo
`ADMIN`.

**Variáveis críticas sem documentação.** `APP_URL`, `METRICS_TOKEN`,
`STORAGE_BASE_URL`, `SWAGGER_TOKEN` eram usadas no código mas ausentes do
`.env.example` — um deploy feito a partir do exemplo resultava em comportamento
silenciosamente incorreto (links quebrados, métricas expostas, Swagger sem
autenticação).

### 3.2 Achados

| ID | Severidade | Descrição | Evidência | Estado |
|---|---|---|---|---|
| A7-1 | 🔴 Crítico | `APP_URL` não documentado; fallback hardcoded `'https://innova.ao'` — links de PDFs e declarações podiam apontar para domínio errado em produção | `src/work-declaration/work-declaration.service.ts:67` | ✅ Corrigido (#32) |
| A7-2/3/4 | 🟠 Alto | `GROQ_API_KEY`, `METRICS_TOKEN`, `STORAGE_BASE_URL` ausentes do `.env.example` | `.env.example` | ✅ Corrigido (#32) |
| A7-5 | 🔴 Crítico | Sem fail-fast no bootstrap se `JWT_SECRET` estiver com placeholder — a aplicação arrancava silenciosamente com segredo inseguro | `src/main.ts` | ✅ Corrigido (#32 bootstrap + #34 Joi) |
| A7-6 | 🟠 Alto | Sem validação de schema de `.env` no bootstrap — ausência de variáveis críticas só era detectada em runtime, potencialmente em produção | `src/app.module.ts` | ✅ Corrigido (#34) |

### 3.3 Correções aplicadas

**A7-1..4 — `.env.example` completo** com todas as variáveis relevantes
documentadas com comentários.

**A7-5 — `validateEnv()` no bootstrap** (`src/common/bootstrap/validate-env.ts`):
Falha imediatamente se `JWT_SECRET` estiver em falta ou com o placeholder
`your_jwt_secret`. Avisa (sem falhar) para `APP_URL`, `METRICS_TOKEN` e
`STORAGE_BASE_URL` ausentes.

**A7-6 — Schema Joi no `ConfigModule`** (`src/config/env.validation.ts`):

```typescript
export const envValidationSchema = Joi.object({
  DATABASE_URL:        Joi.string().required(),
  JWT_SECRET:          Joi.string().min(32).invalid('your_jwt_secret').required(),
  JWT_REFRESH_SECRET:  Joi.string().min(32).required(),
  ALLOWED_FILE_HOST:   Joi.string().required(),
  ALLOWED_ORIGINS:     Joi.string().required(),
  APP_URL:             Joi.string().uri().required(),
  METRICS_TOKEN:       Joi.string().required(),
  SWAGGER_TOKEN:       Joi.when('NODE_ENV', { is: 'production', then: Joi.string().required() }),
  // ... vars opcionais com defaults
}).options({ allowUnknown: true });
```

`ConfigModule.forRoot({ validationSchema, validationOptions: { abortEarly: false } })` —
a app não arranca se faltar alguma variável crítica; todas as violações são
reportadas de uma vez.

---

## 4. Faixa A-8 — Logging e Information Disclosure

### 4.1 Cenário de ataque

**Swagger UI em produção sem autenticação.** `/docs` era acessível por qualquer
utilizador — ou qualquer pessoa que conhecesse a URL — sem credenciais. O Swagger
UI documenta todos os endpoints, DTOs e schemas da API, facilitando reconhecimento
por atacantes.

**PII e segredos em logs.** O `LoggingInterceptor` anterior usava `console.log` e
`this.logger.log()` (NestJS Logger) em vez do pipeline Pino, contornando o
redact. Campos como `password`, `newPassword`, `token`, `nif` e `nib` apareciam
em claro nos logs de produção.

### 4.2 Achados

| ID | Severidade | Descrição | Evidência | Estado |
|---|---|---|---|---|
| A8-1 | 🟠 Alto | `/docs` sem autenticação em produção — qualquer pessoa com acesso à URL lia toda a documentação da API | `src/main.ts` | ✅ Corrigido (#32) |
| A8-2 | 🟠 Alto | `LoggingInterceptor` usava `console.log` / NestJS Logger, bypass ao pipeline Pino (redact, request-id, formato estruturado) | `src/common/interceptors/logging.interceptor.ts` | ✅ Corrigido (#32) |
| A8-3 | 🟠 Alto | Campos PII/financeiros (`password`, `newPassword`, `token`, `nif`, `nib`) não redacted pelo Pino | `src/app.module.ts` (LoggerModule config) | ✅ Corrigido (#32) |

### 4.3 Correções aplicadas

**A8-1 — Middleware Bearer token para `/docs`** (`src/common/security/swagger-auth.middleware.ts`):

```typescript
// Só activo em NODE_ENV=production
if (isProd) {
  app.use(['/docs', '/docs-json'], createSwaggerAuthMiddleware(process.env.SWAGGER_TOKEN));
}
```

Devolve `401 Unauthorized` se o header `Authorization: Bearer <SWAGGER_TOKEN>`
estiver ausente ou incorrecto. `SWAGGER_TOKEN` é obrigatório em produção (Joi).

**A8-2 — `LoggingInterceptor` com `PinoLogger`** (`src/common/interceptors/logging.interceptor.ts`):

```typescript
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

`autoLogging: false` no `LoggerModule` evita duplicação de logs (o Pino já
regista via `pino-http`; o interceptor adiciona o `userId` estruturado).

**A8-3 — Redact alargado no Pino** (`src/app.module.ts`):

```typescript
redact: {
  paths: [
    'req.headers.authorization', 'req.headers.cookie',
    'req.body.password', 'req.body.newPassword', 'req.body.currentPassword',
    'req.body.oldPassword', 'req.body.token', 'req.body.nif', 'req.body.nib',
    'res.headers["set-cookie"]',
  ],
  remove: true,
},
```

---

## 5. Resultado final

| Faixa | Achados | Resolvidos | Pendentes |
|---|---|---|---|
| A-6 Rate Limiting | 3 | 3 | 0 |
| A-7 Secrets | 4 (A7-1..6 → 4 grupos) | 4 | 0 |
| A-8 Logging | 3 | 3 | 0 |
| **Total** | **10** | **10** | **0** |

Todas as faixas A-6, A-7 e A-8 estão encerradas. A stack de rate limiting usa
agora Redis partilhado, o bootstrap rejeita segredos inválidos antes de aceitar
tráfego, e os logs de produção não expõem PII.
