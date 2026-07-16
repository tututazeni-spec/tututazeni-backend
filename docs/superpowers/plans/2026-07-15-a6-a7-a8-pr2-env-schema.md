# A6+A7+A8 PR2 — Env Schema Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar validação de schema Joi ao bootstrap via `ConfigModule.forRoot({ validationSchema })` — a app não arranca se vars críticas estiverem em falta ou com valores inválidos, reportando todas as violações de uma vez.

**Architecture:** `@nestjs/config` já está instalado (^4.0.3) e `ConfigModule.forRoot({ isGlobal: true })` já existe em `app.module.ts`. Esta PR apenas instala `joi`, cria o schema de validação e adiciona `validationSchema` ao `ConfigModule.forRoot()` já existente. Os `process.env.*` em todos os serviços NÃO são migrados para `ConfigService` — o Joi valida no bootstrap e os serviços continuam a ler `process.env` directamente.

**Tech Stack:** `@nestjs/config` ^4.0.3 (já instalado), `joi` (a instalar), Jest

**Pré-requisito:** PR1 mergeada — esta PR é criada a partir de `main` após PR1 estar em `main`.

## Global Constraints

- Branch: `fix/a6-a7-a8-pr2-env-schema` criada a partir de `main` **após PR1 mergeada**
- `@nestjs/config` já instalado — NÃO reinstalar
- `ConfigModule.forRoot({ isGlobal: true })` já existe em `app.module.ts` linha 97 — apenas adicionar `validationSchema`
- `allowUnknown: true` no schema Joi — variáveis do SO e de outras ferramentas não devem impedir o arranque
- `abortEarly: false` — reporta TODAS as violações de uma vez, não só a primeira
- Todos os testes correm com: `npx jest <caminho-do-spec> --no-coverage`
- Commits em português no formato `feat(config): ...`

---

## Mapa de ficheiros

| Acção | Ficheiro |
|-------|----------|
| Instalar | `joi` (npm) |
| Criar | `src/config/env.validation.ts` |
| Criar | `src/config/env.validation.spec.ts` |
| Modificar | `src/app.module.ts` |

---

## Task 1: Instalar joi e criar schema de validação

**Files:**
- Create: `src/config/env.validation.ts`
- Create: `src/config/env.validation.spec.ts`

**Interfaces:**
- Produz: `envValidationSchema` (Joi.ObjectSchema) — exportado e usado pelo `ConfigModule.forRoot()` em Task 2

- [ ] **Step 1: Instalar joi**

```
npm install joi
```

Verificar que foi adicionado ao `package.json` em `dependencies`.

- [ ] **Step 2: Criar o teste que falha**

```typescript
// src/config/env.validation.spec.ts
import { envValidationSchema } from './env.validation';

function validate(env: Record<string, unknown>) {
  return envValidationSchema.validate(env, { abortEarly: false, allowUnknown: true });
}

const VALID_ENV = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/innova',
  JWT_SECRET: 'supersecret-key-with-more-than-32-chars!!',
  JWT_REFRESH_SECRET: 'another-refresh-secret-long-enough!!',
  ALLOWED_FILE_HOST: 'storage.innova.ao',
  ALLOWED_ORIGINS: 'https://innova.ao',
  APP_URL: 'https://innova.ao',
  METRICS_TOKEN: 'metrics-token-value',
};

describe('envValidationSchema', () => {
  it('aceita um .env válido completo', () => {
    const { error } = validate(VALID_ENV);
    expect(error).toBeUndefined();
  });

  it('rejeita JWT_SECRET em falta', () => {
    const { JWT_SECRET, ...rest } = VALID_ENV;
    const { error } = validate(rest);
    expect(error?.details.map(d => d.context?.key)).toContain('JWT_SECRET');
  });

  it('rejeita JWT_SECRET com valor placeholder', () => {
    const { error } = validate({ ...VALID_ENV, JWT_SECRET: 'your_jwt_secret' });
    expect(error?.details.map(d => d.context?.key)).toContain('JWT_SECRET');
  });

  it('rejeita JWT_SECRET com menos de 32 caracteres', () => {
    const { error } = validate({ ...VALID_ENV, JWT_SECRET: 'curta' });
    expect(error?.details.map(d => d.context?.key)).toContain('JWT_SECRET');
  });

  it('rejeita DATABASE_URL em falta', () => {
    const { DATABASE_URL, ...rest } = VALID_ENV;
    const { error } = validate(rest);
    expect(error?.details.map(d => d.context?.key)).toContain('DATABASE_URL');
  });

  it('rejeita APP_URL em falta', () => {
    const { APP_URL, ...rest } = VALID_ENV;
    const { error } = validate(rest);
    expect(error?.details.map(d => d.context?.key)).toContain('APP_URL');
  });

  it('rejeita APP_URL com valor não-URI', () => {
    const { error } = validate({ ...VALID_ENV, APP_URL: 'nao-uma-uri' });
    expect(error?.details.map(d => d.context?.key)).toContain('APP_URL');
  });

  it('exige SWAGGER_TOKEN apenas em NODE_ENV=production', () => {
    const prodEnv = { ...VALID_ENV, NODE_ENV: 'production' };
    const { error: errSemToken } = validate(prodEnv);
    expect(errSemToken?.details.map(d => d.context?.key)).toContain('SWAGGER_TOKEN');

    const { error: errComToken } = validate({ ...prodEnv, SWAGGER_TOKEN: 'tok' });
    expect(errComToken).toBeUndefined();
  });

  it('aceita SWAGGER_TOKEN em falta em development', () => {
    const devEnv = { ...VALID_ENV, NODE_ENV: 'development' };
    const { error } = validate(devEnv);
    expect(error).toBeUndefined();
  });

  it('aceita variáveis extra desconhecidas (allowUnknown)', () => {
    const { error } = validate({ ...VALID_ENV, QUALQUER_VARIAVEL_NOVA: 'valor' });
    expect(error).toBeUndefined();
  });

  it('aplica default NODE_ENV=development quando omitido', () => {
    const { value } = validate(VALID_ENV);
    expect(value.NODE_ENV).toBe('development');
  });

  it('aplica default PORT=4000 quando omitido', () => {
    const { value } = validate(VALID_ENV);
    expect(value.PORT).toBe(4000);
  });

  it('reporta todas as violações com abortEarly:false', () => {
    const { error } = validate({});
    // DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET, ALLOWED_FILE_HOST, ALLOWED_ORIGINS, APP_URL, METRICS_TOKEN
    expect((error?.details.length ?? 0)).toBeGreaterThanOrEqual(3);
  });
});
```

- [ ] **Step 3: Correr o teste — verificar que falha**

```
npx jest src/config/env.validation.spec.ts --no-coverage
```

Resultado esperado: FAIL — módulo não encontrado.

- [ ] **Step 4: Criar src/config/env.validation.ts**

```typescript
// src/config/env.validation.ts
import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),

  PORT: Joi.number().default(4000),

  // Base de dados
  DATABASE_URL: Joi.string().required(),

  // JWT — rejeita o placeholder do .env.example
  JWT_SECRET: Joi.string().min(32).disallow('your_jwt_secret').required(),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),

  // Upload e CORS
  ALLOWED_FILE_HOST: Joi.string().required(),
  ALLOWED_ORIGINS: Joi.string().required(),

  // URLs de infra
  APP_URL: Joi.string().uri().required(),
  METRICS_TOKEN: Joi.string().required(),
  STORAGE_BASE_URL: Joi.string().uri().optional(),

  // Swagger — obrigatório apenas em produção
  SWAGGER_TOKEN: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().required(),
    otherwise: Joi.string().optional(),
  }),

  // IA Tutor — opcionais (app funciona sem eles)
  AI_PROVIDER: Joi.string().valid('groq', 'gemini', 'ollama').optional(),
  GROQ_API_KEY: Joi.string().optional().allow(''),
  GROQ_MODEL: Joi.string().optional(),
  GEMINI_API_KEY: Joi.string().optional().allow(''),
  GEMINI_MODEL: Joi.string().optional(),
  OLLAMA_URL: Joi.string().uri().optional().allow(''),
  OLLAMA_MODEL: Joi.string().optional(),

  // Runtime
  JWT_USER_CACHE_TTL_MS: Joi.number().default(30000),
  LOG_LEVEL: Joi.string()
    .valid('trace', 'debug', 'info', 'warn', 'error', 'fatal')
    .default('info'),
  AUTH_ALLOW_BEARER: Joi.boolean().default(true),
}).options({ allowUnknown: true });
```

- [ ] **Step 5: Correr o teste — verificar que passa**

```
npx jest src/config/env.validation.spec.ts --no-coverage
```

Resultado esperado: PASS — todos os testes passam.

- [ ] **Step 6: Commit**

```
git add src/config/env.validation.ts src/config/env.validation.spec.ts package.json package-lock.json
git commit -m "feat(config): schema Joi de validação de variáveis de ambiente — A7"
```

---

## Task 2: Integrar o schema no ConfigModule

**Files:**
- Modify: `src/app.module.ts`

**Interfaces:**
- Consome: `envValidationSchema` de `src/config/env.validation.ts`
- Produz: bootstrap falha com mensagem clara se vars inválidas

- [ ] **Step 1: Adicionar o import em app.module.ts**

Em `src/app.module.ts`, adicionar o import após os imports existentes (antes de `@Module`):

```typescript
import { envValidationSchema } from './config/env.validation';
```

- [ ] **Step 2: Actualizar ConfigModule.forRoot()**

Na linha 97 de `src/app.module.ts`, substituir:

```typescript
    ConfigModule.forRoot({ isGlobal: true }),
```

Por:

```typescript
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
      validationOptions: { abortEarly: false },
    }),
```

- [ ] **Step 3: Verificar que o módulo compila**

```
npx tsc --noEmit
```

Resultado esperado: sem erros de tipo.

- [ ] **Step 4: Verificar comportamento em desenvolvimento**

Com o `.env` local completo (DATABASE_URL, JWT_SECRET válido, etc.), a app deve arrancar normalmente:

```
npx ts-node -e "process.env.NODE_ENV='development'; require('./src/main')"
```

Alternativa — apenas verificar que o schema não rejeita o `.env` de desenvolvimento:

```
npx jest src/config/env.validation.spec.ts --no-coverage
```

Resultado esperado: PASS.

- [ ] **Step 5: Commit**

```
git add src/app.module.ts
git commit -m "feat(config): integrar envValidationSchema no ConfigModule.forRoot — A7"
```

---

## Task 3: Push e PR

- [ ] **Step 1: Verificar git log**

```
git log --oneline -3
```

Resultado esperado: 2 commits na branch (schema Joi + ConfigModule).

- [ ] **Step 2: Correr todos os testes da PR**

```
npx jest src/config/env.validation.spec.ts --no-coverage
```

Resultado esperado: PASS.

- [ ] **Step 3: Push e PR**

```
git push -u origin fix/a6-a7-a8-pr2-env-schema
```

```
gh pr create --title "feat(config): A7 PR2 — validação de schema .env com @nestjs/config + Joi" --body "$(cat <<'EOF'
## O que faz

Adiciona validação declarativa de todas as variáveis de ambiente críticas ao bootstrap da aplicação. Se `JWT_SECRET` for o placeholder, ou `DATABASE_URL` ou `APP_URL` estiverem em falta, a app **não arranca** e lista todas as violações de uma vez.

## Achado remediado

- **A7-6** — sem validação de schema de `.env` no bootstrap; vars críticas em falta só causavam erro em runtime quando o endpoint era chamado pela primeira vez

## Ficheiros alterados

- `src/config/env.validation.ts` (novo) — schema Joi com 20+ variáveis
- `src/app.module.ts` — `ConfigModule.forRoot({ validationSchema })` 
- `package.json` — dependência `joi`

## Sem migração para ConfigService

Os `process.env.*` existentes em todos os serviços **não são migrados**. O Joi valida no bootstrap; os serviços continuam a ler `process.env` directamente. Migração para `ConfigService` é um refactor separado fora do âmbito desta auditoria.

## Pré-requisito

Requer PR1 (`fix/a6-a7-a8-pr1-quick-wins`) mergeada — o `validateEnv()` manual do PR1 coexiste sem conflito e pode ser removido num follow-up.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
