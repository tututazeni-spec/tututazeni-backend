# A6 + A7 + A8 — Security Hardening: Rate Limiting, Secrets, Logging
**Data:** 2026-07-15
**Faixas:** A-6 (Rate Limiting / DoS), A-7 (Secrets / Config), A-8 (Logging / Information Disclosure)
**PRs:** PR1 (quick wins, zero novas dependências) + PR2 (env schema validation com @nestjs/config + Joi)

---

## Contexto

Auditorias A6/A7/A8 identificaram 10 achados distribuídos por três áreas:
- **A6:** throttle ausente em dois endpoints de auth; `limit` sem `@Max()` em DTOs de search → DoS por qualquer utilizador autenticado
- **A7:** 10+ variáveis de ambiente usadas no código mas ausentes do `.env.example`; `JWT_SECRET` placeholder sem fail-fast; sem validação de schema no bootstrap
- **A8:** Swagger exposto sem autenticação em produção; campos PII/financeiros não redacted pelo Pino; `LoggingInterceptor` duplica logs e bypassa o pipeline Pino

---

## Achados remediados

| ID | Severidade | Descrição | PR |
|----|-----------|-----------|-----|
| A6-1/2 | 🟠 Alto | `limit` sem `@Max()` em `GlobalSearchDto`, `TypedSearchDto`, `AutocompleteDto` | PR1 |
| A6-3/4 | 🟠 Alto | `/auth/refresh` e `/auth/reset-password` sem `@Throttle` específico | PR1 |
| A7-1 | 🔴 Crítico | `APP_URL` não documentado; fallback hardcoded `'https://innova.ao'` | PR1 + PR2 |
| A7-2/3/4 | 🟠 Alto | `GROQ_API_KEY`, `METRICS_TOKEN`, `STORAGE_BASE_URL` ausentes do `.env.example` | PR1 |
| A7-5 | 🟠 Alto | `JWT_SECRET=your_jwt_secret` sem fail-fast no bootstrap | PR1 (manual) → PR2 (Joi) |
| A7-6 | 🟡 Médio | Sem validação de schema de `.env` no bootstrap | PR2 |
| A8-1 | 🟠 Alto | Swagger (`/docs`) exposto sem autenticação em produção | PR1 |
| A8-2 | 🟠 Alto | `LoggingInterceptor` duplica logs e bypassa redact do Pino | PR1 |
| A8-3 | 🟠 Alto | `newPassword`, `token`, `nif`, `nib` não redacted pelo Pino | PR1 |
| A6-5 | 🟡 Médio | ThrottlerStore in-memory (reset em restart) | ⏳ Adiado — aguarda Redis |

---

## PR1 — Quick Wins (zero dependências novas)

### A6 — Rate limiting

**`src/search/search.dto.ts`**
- Adicionar `@Max(100)` a `limit` em `GlobalSearchDto`, `TypedSearchDto` e `AutocompleteDto`
- `Max` já está importado de `class-validator` noutros DTOs do ficheiro
- Bloqueia o vector DoS: qualquer utilizador autenticado poderia enviar `?limit=10000` e disparar 7 queries Prisma paralelas com `take: 10000`

**`src/auth/auth.controller.ts`**
- `POST /auth/refresh` → `@Throttle({ default: { limit: 10, ttl: 60000 } })`
- `POST /auth/reset-password` → `@Throttle({ default: { limit: 5, ttl: 60000 } })`
- Ambos os endpoints são `@Public()` — só têm o limite global de 100/min, insuficiente para brute force de tokens

### A7 — Secrets e configuração

**`.env.example`**
Adicionar as seguintes variáveis (com comentários explicativos):

```env
# URL pública da aplicação (links em documentos, declarações e PDFs)
APP_URL=https://innova.ao

# Token para o endpoint /metrics (Prometheus scraping)
METRICS_TOKEN=change-me-in-production

# URL base do storage externo (Cloudflare R2, S3, etc.)
STORAGE_BASE_URL=https://storage.innova.ao

# Token Bearer para aceder ao Swagger UI em produção (/docs)
SWAGGER_TOKEN=change-me-in-production

# IA Tutor — provider activo: groq | gemini | ollama
AI_PROVIDER=groq
GROQ_API_KEY=
GROQ_MODEL=llama3-70b-8192
GEMINI_API_KEY=
GEMINI_MODEL=gemini-1.5-pro
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3

# Cache TTL do perfil de utilizador no JWT strategy (ms)
JWT_USER_CACHE_TTL_MS=30000

# Nível de log: trace | debug | info | warn | error | fatal
LOG_LEVEL=info
```

**`src/main.ts`** — fail-fast manual antes de `app.listen()`:
- Falha hard se `JWT_SECRET` é `undefined` ou `'your_jwt_secret'`
- Falha hard se `JWT_REFRESH_SECRET` é `undefined`
- Falha hard se `ALLOWED_FILE_HOST` é `undefined`
- `console.warn` (não falha) para `APP_URL`, `METRICS_TOKEN`, `STORAGE_BASE_URL` ausentes
- Este bloco é substituído em PR2 pelo schema Joi; pode coexistir sem conflito

### A8 — Logging e information disclosure

**`src/main.ts`** — middleware Express para `/docs` antes de `SwaggerModule.setup()`:

```typescript
if (isProd) {
  const swaggerToken = process.env.SWAGGER_TOKEN;
  app.use(['/docs', '/docs-json'], (req, res, next) => {
    const bearer = req.headers['authorization']?.replace('Bearer ', '');
    if (!swaggerToken || bearer !== swaggerToken) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }
    next();
  });
}
SwaggerModule.setup('docs', app, document);
```

Nota: NestJS guards não se aplicam às rotas do SwaggerModule (registadas ao nível do Express); o middleware Express é a abordagem correcta.

**`src/app.module.ts`** — alargar `redact.paths`:

```typescript
'req.body.newPassword',
'req.body.currentPassword',
'req.body.oldPassword',
'req.body.token',
'req.body.nif',
'req.body.nib',
```

**`src/common/interceptors/logging.interceptor.ts`** — refactorizar (não remover):
- Substituir `new Logger('HTTP')` por injecção do `Logger` do `nestjs-pino` via `@InjectPinoLogger()`
- Remover logging do `url` completo com query params (previne exposição de pesquisas nominais)
- Desactivar `autoLogging` no `pino-http` (`app.module.ts`) para eliminar o log duplicado
- O interceptor continua a logar `method`, `userId` e tempo de resposta — dados que o pino-http não tem acesso no contexto NestJS

### Ficheiros alterados — PR1

| Ficheiro | Tipo de alteração |
|----------|------------------|
| `src/search/search.dto.ts` | `@Max(100)` em 3 campos `limit` |
| `src/auth/auth.controller.ts` | `@Throttle` em `/refresh` e `/reset-password` |
| `.env.example` | 13 variáveis documentadas |
| `src/main.ts` | Fail-fast manual + middleware Swagger |
| `src/app.module.ts` | Redact paths + `autoLogging: false` |
| `src/common/interceptors/logging.interceptor.ts` | Refactorização para Pino |

---

## PR2 — Env Schema Validation (@nestjs/config + Joi)

### Dependências novas

```
npm install @nestjs/config joi
```

### Ficheiro novo: `src/config/env.validation.ts`

Schema Joi centralizado com todas as variáveis críticas e opcionais:

```typescript
import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV:              Joi.string().valid('development', 'production', 'test').default('development'),
  PORT:                  Joi.number().default(4000),
  DATABASE_URL:          Joi.string().required(),
  JWT_SECRET:            Joi.string().min(32).disallow('your_jwt_secret').required(),
  JWT_REFRESH_SECRET:    Joi.string().min(32).required(),
  ALLOWED_FILE_HOST:     Joi.string().required(),
  ALLOWED_ORIGINS:       Joi.string().required(),
  APP_URL:               Joi.string().uri().required(),
  METRICS_TOKEN:         Joi.string().required(),
  SWAGGER_TOKEN:         Joi.when('NODE_ENV', {
                           is: 'production',
                           then: Joi.string().required(),
                           otherwise: Joi.string().optional(),
                         }),
  STORAGE_BASE_URL:      Joi.string().uri().optional(),
  AI_PROVIDER:           Joi.string().valid('groq', 'gemini', 'ollama').optional(),
  GROQ_API_KEY:          Joi.string().optional().allow(''),
  GEMINI_API_KEY:        Joi.string().optional().allow(''),
  OLLAMA_URL:            Joi.string().uri().optional().allow(''),
  GROQ_MODEL:            Joi.string().optional(),
  GEMINI_MODEL:          Joi.string().optional(),
  OLLAMA_MODEL:          Joi.string().optional(),
  JWT_USER_CACHE_TTL_MS: Joi.number().default(30000),
  LOG_LEVEL:             Joi.string()
                           .valid('trace', 'debug', 'info', 'warn', 'error', 'fatal')
                           .default('info'),
  AUTH_ALLOW_BEARER:     Joi.boolean().default(true),
}).options({ allowUnknown: true }); // outras vars do sistema não listadas são permitidas
```

### `src/app.module.ts`

Adicionar `ConfigModule.forRoot()` ao topo dos `imports`:

```typescript
ConfigModule.forRoot({
  isGlobal: true,
  validationSchema: envValidationSchema,
  validationOptions: { abortEarly: false }, // reporta TODAS as vars em falta, não só a primeira
}),
```

### Comportamento no bootstrap

Se `JWT_SECRET` for o placeholder ou estiver em falta, a app não arranca e imprime todas as violações de uma vez:
```
Error: Config validation error:
  "JWT_SECRET" must not be one of [your_jwt_secret]
  "APP_URL" is required
  "METRICS_TOKEN" is required
```

### Relação com PR1

O fail-fast manual de PR1 (`main.ts`) continua a funcionar em paralelo com o Joi. Após PR2 ser mergeado, o bloco manual pode ser removido num follow-up (é redundante mas inofensivo).

Os `process.env.*` existentes em todos os serviços **não são migrados** para `ConfigService` — o Joi valida no bootstrap; os serviços continuam a ler `process.env` directamente. Migrar 50+ ficheiros seria scope creep fora do âmbito desta auditoria.

### Ficheiros alterados — PR2

| Ficheiro | Tipo de alteração |
|----------|------------------|
| `package.json` | `@nestjs/config` + `joi` |
| `src/config/env.validation.ts` | Ficheiro novo — schema Joi |
| `src/app.module.ts` | `ConfigModule.forRoot()` nos imports |

---

## Testes

### PR1

| Componente | Teste |
|-----------|-------|
| `search.dto.ts` | `limit = 101` → ValidationError; `limit = 100` → passa |
| `auth.controller.ts` | `@Throttle` metadata presente em `/refresh` e `/reset-password` |
| `logging.interceptor.ts` | Log via Pino (não `new Logger`); URL não incluída no output |
| Swagger middleware | Em `NODE_ENV=production` + token errado → 401; token correcto → 200 |
| Fail-fast `main.ts` | Bootstrap falha com `JWT_SECRET=your_jwt_secret` |

### PR2

| Componente | Teste |
|-----------|-------|
| `env.validation.ts` | Joi schema — `JWT_SECRET` abaixo de 32 chars → erro; placeholder → erro |
| `ConfigModule` bootstrap | `.env` incompleto → app não arranca + lista todos os erros |
| `JWT_SECRET` vazio | Deve rejeitar mesmo com `min(32)` via `required()` |

---

## Decisões de design

| Decisão | Alternativa rejeitada | Motivo |
|---------|----------------------|--------|
| Swagger via middleware Express | Guard NestJS | Guards NestJS não se aplicam a rotas do SwaggerModule |
| `LoggingInterceptor` refactorizado (não removido) | Remoção completa | Preserva `userId` nos logs — valioso para auditoria de acesso |
| `autoLogging: false` no pino-http | Manter `true` | Elimina log duplicado por request |
| Fail-fast manual em PR1 | Esperar PR2 | Fecha A7-5 (JWT_SECRET crítico) imediatamente sem bloquear PR2 |
| `allowUnknown: true` no Joi | Schema estrito | Variáveis do SO e de outras ferramentas não devem impedir o arranque |
| Sem migração para `ConfigService` | Migração completa | 50+ ficheiros fora de scope; Joi valida no bootstrap, `process.env` continua funcional |

---

## Adiado

- **A6-5 ThrottlerStore Redis** — aguarda disponibilidade de Redis na infraestrutura. O comportamento actual (in-memory) é aceitável para VPS single-instance.
