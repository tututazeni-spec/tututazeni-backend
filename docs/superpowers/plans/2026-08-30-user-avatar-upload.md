# Foto de perfil do utilizador — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que o utilizador autenticado carregue uma foto de perfil a partir do canto superior direito da plataforma, e que essa foto substitua o avatar de iniciais em todo o lado onde o seu próprio avatar aparece.

**Architecture:** A foto é redimensionada no browser para 256×256 (center-crop via `<canvas>`) e enviada como data URL base64 para um novo endpoint self-service `PATCH /users/me/avatar`, que a grava no campo `User.avatarUrl` (já existente no schema — sem migração). `GET /auth/me` já devolve `avatarUrl`; o frontend passa a tipá-lo e a consumi-lo. Uma única entrada de cache do React Query (`queryKeys.auth.me()`) é invalidada após o upload, por isso Topbar e Definições actualizam sem reload. Zero infraestrutura nova (sem multer, sem storage estático, sem S3).

**Tech Stack:** NestJS 11 + Prisma + class-validator (backend, repo `innova`); Next.js + React Query + `@testing-library/react` + vitest (frontend, repo `frontend` — repositório git separado `tututazeni-frontend`).

**Spec:** `docs/superpowers/specs/2026-08-30-user-avatar-upload-design.md`

## Global Constraints

- **`main` é protegida em ambos os repos** — nunca fazer push/commit directo. Sempre branch + PR + check `quality` verde antes de merge (`innova`: branch protection dura; `frontend`: convenção, na mesma com CI). Ver memória `project_innova_main_protected` e `project_innova_frontend_separate_repo`.
- **Modelo `User`**: campo é `fullName`, nunca `name`. Filtrar roles por `roleCode`, nunca `role: 'X'`.
- **`User.avatarUrl`** já existe (`prisma/schema.prisma` ~linha 555, `String?`). **Não criar migração.**
- **Limite de tamanho da data URL: `200_000` caracteres.** Este número tem de ser idêntico nos dois repos: `@MaxLength(200_000)` no DTO backend e `MAX_AVATAR_DATA_URL_LEN = 200_000` em `lib/image.ts` no frontend.
- **Formatos de imagem aceites: `png`, `jpeg`/`jpg`, `webp`.** Nunca `svg` (evita SVG com script).
- **Prisma no `UsersService`**: escritas via `this.prisma.user.*`, leituras via `this.prisma.read.user.*` (padrão já usado no ficheiro).
- **Antes de fechar cada PR**: correr, no repo respectivo, o que a CI corre — backend: `npx tsc --noEmit` + `npm test` (jest) + suite de integração relevante + `npx prettier --check`; frontend: `npx tsc --noEmit` + `npm run build` + `npm test` (vitest) + `npx prettier --check`. Correr `npx prettier --write` no que for tocado (ver memória `feedback_run_prettier_before_push`).
- **Ambiente de integração backend**: Postgres `innova_test` a correr, Redis local a correr, `DB_POOL_MAX` baixo em `.env.test`. Ver memória `project_innova_integration_test_infra`.

---

# PARTE A — Backend (`innova`)

Branch: `feat/user-avatar-upload` (já criada; o spec já está commitado nela).

## Task A1: Validador `IsBase64ImageDataUrl`

**Files:**
- Create: `src/common/validators/is-base64-image-data-url.decorator.ts`
- Test: `src/common/validators/is-base64-image-data-url.decorator.spec.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `export function IsBase64ImageDataUrl(options?: ValidationOptions): PropertyDecorator` — decorator class-validator que valida uma string data URL de imagem base64 (`png`/`jpeg`/`jpg`/`webp`). Usado pelo `UpdateMyAvatarDto` na Task A2.

- [ ] **Step 1: Escrever o teste que falha**

```ts
// src/common/validators/is-base64-image-data-url.decorator.spec.ts
import { validate } from 'class-validator';
import { IsBase64ImageDataUrl } from './is-base64-image-data-url.decorator';

class Dto {
  @IsBase64ImageDataUrl()
  avatarUrl!: string;
}

async function errorCount(value: unknown): Promise<number> {
  const d = new Dto();
  // @ts-expect-error — testar valores inválidos de propósito
  d.avatarUrl = value;
  return (await validate(d)).length;
}

describe('IsBase64ImageDataUrl', () => {
  it('aceita data URL png base64', async () => {
    expect(await errorCount('data:image/png;base64,iVBORw0KGgo=')).toBe(0);
  });
  it('aceita data URL jpeg base64', async () => {
    expect(await errorCount('data:image/jpeg;base64,/9j/4AAQSkZJRg==')).toBe(0);
  });
  it('aceita data URL jpg base64', async () => {
    expect(await errorCount('data:image/jpg;base64,/9j/4AAQ')).toBe(0);
  });
  it('aceita data URL webp base64', async () => {
    expect(await errorCount('data:image/webp;base64,UklGRi4AAABXRUJQ')).toBe(0);
  });
  it('recusa https URL', async () => {
    expect(await errorCount('https://storage.innova.ao/x.png')).toBeGreaterThan(0);
  });
  it('recusa data URL svg', async () => {
    expect(await errorCount('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=')).toBeGreaterThan(0);
  });
  it('recusa data URL gif', async () => {
    expect(await errorCount('data:image/gif;base64,R0lGODlh')).toBeGreaterThan(0);
  });
  it('recusa data URL não-base64 (texto)', async () => {
    expect(await errorCount('data:image/png,notbase64')).toBeGreaterThan(0);
  });
  it('recusa payload base64 com caracteres inválidos', async () => {
    expect(await errorCount('data:image/png;base64,abc$%^&')).toBeGreaterThan(0);
  });
  it('recusa string vazia', async () => {
    expect(await errorCount('')).toBeGreaterThan(0);
  });
  it('recusa não-string', async () => {
    expect(await errorCount(12345)).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Correr o teste — verificar que falha**

Run: `npx jest src/common/validators/is-base64-image-data-url.decorator.spec.ts`
Expected: FAIL — `Cannot find module './is-base64-image-data-url.decorator'`.

- [ ] **Step 3: Implementação mínima**

```ts
// src/common/validators/is-base64-image-data-url.decorator.ts
// Valida uma foto de perfil enviada como data URL base64 (upload self-service
// de avatar). Restringe a png/jpeg/jpg/webp — svg fica de fora de propósito
// (um SVG pode conter <script>, e o avatar é sempre renderizado em <img src>).
// O limite de tamanho vive no @MaxLength do DTO, não aqui.
import { registerDecorator, ValidationOptions } from 'class-validator';

const BASE64_IMAGE_DATA_URL =
  /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

export function IsBase64ImageDataUrl(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isBase64ImageDataUrl',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate: (value: unknown) =>
          typeof value === 'string' && BASE64_IMAGE_DATA_URL.test(value),
        defaultMessage: () =>
          'avatarUrl deve ser uma data URL de imagem (png, jpeg ou webp) em base64',
      },
    });
  };
}
```

- [ ] **Step 4: Correr o teste — verificar que passa**

Run: `npx jest src/common/validators/is-base64-image-data-url.decorator.spec.ts`
Expected: PASS (11 testes).

- [ ] **Step 5: Commit**

```bash
git add src/common/validators/is-base64-image-data-url.decorator.ts src/common/validators/is-base64-image-data-url.decorator.spec.ts
git commit -m "feat(users): validador IsBase64ImageDataUrl para upload de avatar

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WKndfttK1uPKXpm44tXMCw"
```

---

## Task A2: DTO, rotas `me/avatar` e métodos do serviço

**Files:**
- Modify: `src/users/users.dto.ts` (adicionar `UpdateMyAvatarDto`; imports `MaxLength` já presente)
- Modify: `src/users/users.controller.ts` (2 rotas novas; imports `Delete`, `HttpCode`, `HttpStatus` já presentes)
- Modify: `src/users/users.service.ts` (2 métodos novos)
- Modify: `src/users/users.controller.spec.ts` (2 mocks + 2 testes)
- Modify: `src/main.ts` (limite do JSON body parser)

**Interfaces:**
- Consumes: `IsBase64ImageDataUrl` da Task A1.
- Produces:
  - `UpdateMyAvatarDto { avatarUrl: string }` (exportado de `users.dto.ts`).
  - `UsersController.setMyAvatar(user, dto)` → `Promise<{ avatarUrl: string }>` (rota `PATCH /users/me/avatar`).
  - `UsersController.removeMyAvatar(user)` → `Promise<{ avatarUrl: null }>` (rota `DELETE /users/me/avatar`).
  - `UsersService.setAvatar(userId: number, avatarUrl: string)` → `Promise<{ avatarUrl: string }>`.
  - `UsersService.clearAvatar(userId: number)` → `Promise<{ avatarUrl: null }>`.
  - Contrato consumido pela Parte B: `PATCH /users/me/avatar` body `{ avatarUrl: "data:image/jpeg;base64,..." }` → `200 { avatarUrl }`; `DELETE /users/me/avatar` → `200 { avatarUrl: null }`.

- [ ] **Step 1: Escrever os testes de controller que falham**

Adicionar a `src/users/users.controller.spec.ts`: no objecto `mockSvc`, duas entradas novas —

```ts
  setAvatar: jest.fn().mockResolvedValue({ avatarUrl: 'data:image/jpeg;base64,AAAA' }),
  clearAvatar: jest.fn().mockResolvedValue({ avatarUrl: null }),
```

e dois testes novos dentro do `describe('UsersController', ...)` —

```ts
  it('setMyAvatar → setAvatar(user.id, dto.avatarUrl)', async () => {
    const dto = { avatarUrl: 'data:image/jpeg;base64,AAAA' } as any;
    await controller.setMyAvatar(mockUser as any, dto);
    expect(mockSvc.setAvatar).toHaveBeenCalledWith(1, 'data:image/jpeg;base64,AAAA');
  });

  it('removeMyAvatar → clearAvatar(user.id)', async () => {
    await controller.removeMyAvatar(mockUser as any);
    expect(mockSvc.clearAvatar).toHaveBeenCalledWith(1);
  });
```

- [ ] **Step 2: Correr — verificar que falha**

Run: `npx jest src/users/users.controller.spec.ts`
Expected: FAIL — `controller.setMyAvatar is not a function`.

- [ ] **Step 3: Adicionar o DTO**

Em `src/users/users.dto.ts`, adicionar o import do validador junto aos outros imports locais:

```ts
import { IsBase64ImageDataUrl } from '../common/validators/is-base64-image-data-url.decorator';
```

e a classe (a seguir a `UpdateProfileDto`):

```ts
export class UpdateMyAvatarDto {
  @ApiProperty({
    description: 'Foto de perfil como data URL base64 (png, jpeg ou webp)',
    example: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ...',
  })
  @IsString()
  @MaxLength(200_000) // ~150 KB descodificados — válvula de segurança; espelha o frontend
  @IsBase64ImageDataUrl()
  avatarUrl!: string;
}
```

- [ ] **Step 4: Adicionar os métodos do serviço**

Em `src/users/users.service.ts`, adicionar `UpdateMyAvatarDto` NÃO é necessário (recebemos a string já validada). Adicionar os dois métodos (junto aos outros `me/*`, ex. a seguir a `upsertProfile`):

```ts
  async setAvatar(userId: number, avatarUrl: string) {
    await this.prisma.user.update({ where: { id: userId }, data: { avatarUrl } });
    return { avatarUrl };
  }

  async clearAvatar(userId: number) {
    await this.prisma.user.update({ where: { id: userId }, data: { avatarUrl: null } });
    return { avatarUrl: null };
  }
```

- [ ] **Step 5: Adicionar as rotas no controller**

Em `src/users/users.controller.ts`: adicionar `UpdateMyAvatarDto` à lista de imports de `./users.dto`, e as duas rotas na secção "Endpoints do utilizador autenticado" (a seguir a `updateMyProfile`):

```ts
  @Patch('me/avatar')
  @ApiOperation({ summary: 'Definir a foto de perfil do utilizador autenticado' })
  setMyAvatar(@CurrentUser() user: CurrentUserData, @Body() dto: UpdateMyAvatarDto) {
    return this.svc.setAvatar(user.id, dto.avatarUrl);
  }

  @Delete('me/avatar')
  @ApiOperation({ summary: 'Remover a foto de perfil do utilizador autenticado' })
  @HttpCode(HttpStatus.OK)
  removeMyAvatar(@CurrentUser() user: CurrentUserData) {
    return this.svc.clearAvatar(user.id);
  }
```

> Nota: `@Controller('users')` já está sob `@UseGuards(JwtAuthGuard, RolesGuard)` a nível de classe — as rotas ficam autenticadas sem role específica (qualquer utilizador edita o seu próprio avatar). Confirmar que `me/avatar` fica declarada **antes** de qualquer rota `:id` genérica com o mesmo método — as rotas `me/*` já estão todas no topo do ficheiro, manter aí.

- [ ] **Step 6: Alinhar o limite do JSON body parser**

O parser JSON default do Express (~100 KB) rejeitaria com **413** uma data URL entre 100 KB e o limite de 200 000 caracteres do DTO, antes de o `ValidationPipe` correr. Alinhar em `src/main.ts`:

1. Trocar a assinatura de criação da app para tipar como Express:

```ts
// no topo, junto aos imports
import { NestExpressApplication } from '@nestjs/platform-express';
```
```ts
// era: const app = await NestFactory.create(AppModule, { bufferLogs: true });
const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
```

2. A seguir ao bloco `app.use(...)` de segurança (antes de `app.enableCors`), adicionar:

```ts
  // O avatar de perfil chega como data URL base64 (~até 150 KB) no corpo JSON
  // de PATCH /users/me/avatar. O default do parser (~100 KB) daria 413 antes
  // da validação — subir para 1 MB deixa o @MaxLength(200_000) do DTO ser a
  // fronteira real (resposta 400 limpa, não 413).
  app.useBodyParser('json', { limit: '1mb' });
```

- [ ] **Step 7: Correr os testes — verificar que passam**

Run: `npx jest src/users/users.controller.spec.ts src/common/validators/is-base64-image-data-url.decorator.spec.ts`
Expected: PASS (todos, incluindo os 2 novos de controller).

- [ ] **Step 8: Type-check**

Run: `npx tsc --noEmit`
Expected: sem erros. (Se `useBodyParser` não existir no tipo, confirmar a versão de `@nestjs/platform-express` — deve ser ≥ 10.3; em v11 existe.)

- [ ] **Step 9: Commit**

```bash
git add src/users/users.dto.ts src/users/users.controller.ts src/users/users.service.ts src/users/users.controller.spec.ts src/main.ts
git commit -m "feat(users): endpoint self-service PATCH/DELETE /users/me/avatar

Grava a foto de perfil (data URL base64) em User.avatarUrl. Sobe o
limite do JSON body parser para 1mb para acomodar o payload.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WKndfttK1uPKXpm44tXMCw"
```

---

## Task A3: Teste de integração do fluxo completo

**Files:**
- Create: `test/integration/users/users-avatar.integration-spec.ts`

**Interfaces:**
- Consumes: rotas `PATCH`/`DELETE /users/me/avatar` (A2), `GET /auth/me` (já existente), `getToken` helper (`test/integration/helpers/auth.helper`).
- Produces: nada (é folha).

- [ ] **Step 1: Escrever o spec de integração**

```ts
// test/integration/users/users-avatar.integration-spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { getToken } from '../helpers/auth.helper';

// 1x1 PNG transparente — data URL válida e pequena.
const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAoMBgDTD2qgAAAAASUVORK5CYII=';

describe('Users Avatar Integration', () => {
  let app: NestExpressApplication;
  let token: string;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication<NestExpressApplication>();
    // Espelha src/main.ts (convenção deste repo — ver users.integration-spec.ts).
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    app.useBodyParser('json', { limit: '1mb' });
    await app.init();

    token = await getToken(app.getHttpServer(), 'employee');
  });

  afterAll(async () => {
    // Repõe o estado: o utilizador de teste 'employee' não deve ficar com avatar.
    await request(app.getHttpServer())
      .delete('/users/me/avatar')
      .set('Authorization', `Bearer ${token}`);
    await app.close();
  });

  it('PATCH define o avatar e GET /auth/me devolve-o', async () => {
    const patch = await request(app.getHttpServer())
      .patch('/users/me/avatar')
      .set('Authorization', `Bearer ${token}`)
      .send({ avatarUrl: TINY_PNG })
      .expect(200);
    expect(patch.body.avatarUrl).toBe(TINY_PNG);

    const me = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(me.body.avatarUrl).toBe(TINY_PNG);
  });

  it('DELETE remove o avatar e GET /auth/me devolve null', async () => {
    await request(app.getHttpServer())
      .patch('/users/me/avatar')
      .set('Authorization', `Bearer ${token}`)
      .send({ avatarUrl: TINY_PNG })
      .expect(200);

    await request(app.getHttpServer())
      .delete('/users/me/avatar')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const me = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(me.body.avatarUrl).toBeNull();
  });

  it('recusa uma URL https (não é data URL de imagem) → 400', async () => {
    await request(app.getHttpServer())
      .patch('/users/me/avatar')
      .set('Authorization', `Bearer ${token}`)
      .send({ avatarUrl: 'https://evil.example/x.png' })
      .expect(400);
  });

  it('recusa data URL svg → 400', async () => {
    await request(app.getHttpServer())
      .patch('/users/me/avatar')
      .set('Authorization', `Bearer ${token}`)
      .send({ avatarUrl: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' })
      .expect(400);
  });

  it('aceita um payload grande (~120 KB) válido → 200 (body parser não dá 413)', async () => {
    const big = 'data:image/png;base64,' + 'A'.repeat(120_000);
    await request(app.getHttpServer())
      .patch('/users/me/avatar')
      .set('Authorization', `Bearer ${token}`)
      .send({ avatarUrl: big })
      .expect(200);
  });

  it('recusa um payload acima de 200 000 caracteres → 400 (MaxLength)', async () => {
    const tooBig = 'data:image/png;base64,' + 'A'.repeat(210_000);
    await request(app.getHttpServer())
      .patch('/users/me/avatar')
      .set('Authorization', `Bearer ${token}`)
      .send({ avatarUrl: tooBig })
      .expect(400);
  });

  it('sem token → 401', async () => {
    await request(app.getHttpServer())
      .patch('/users/me/avatar')
      .send({ avatarUrl: TINY_PNG })
      .expect(401);
  });
});
```

> Se o `getToken(..., 'employee')` não existir com essa etiqueta, abrir `test/integration/helpers/auth.helper.ts` e usar a etiqueta de utilizador comum que lá estiver definida (o `users.integration-spec.ts` usa `'employee'`).

- [ ] **Step 2: Correr o spec — verificar que passa**

Run (com Postgres `innova_test` + Redis a correr): `npx jest --config test/jest-integration.json test/integration/users/users-avatar.integration-spec.ts`
(Confirmar o nome real do config de integração em `package.json` — procurar o script `test:integration` ou `test:e2e`.)
Expected: PASS (8 testes).

- [ ] **Step 3: Correr a suite de integração de `users` completa (regressão)**

Run: `npx jest --config test/jest-integration.json test/integration/users/`
Expected: PASS — o novo spec não interfere com `users.integration-spec.ts`.

- [ ] **Step 4: Commit**

```bash
git add test/integration/users/users-avatar.integration-spec.ts
git commit -m "test(users): integração do fluxo de avatar (PATCH/DELETE + /auth/me)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WKndfttK1uPKXpm44tXMCw"
```

---

## Task A4: Verificação final e PR (backend)

- [ ] **Step 1: Verificação completa**

```bash
npx tsc --noEmit
npx jest src/users src/common/validators
npx prettier --check "src/users/**/*.ts" "src/common/validators/is-base64-image-data-url.decorator*" "src/main.ts" "test/integration/users/users-avatar.integration-spec.ts"
```
Se o prettier acusar: `npx prettier --write` nos mesmos caminhos e commit `style: prettier`.

- [ ] **Step 2: Push + PR**

```bash
git push -u origin feat/user-avatar-upload
gh pr create --title "feat(users): upload self-service de foto de perfil" --body "$(cat <<'EOF'
## O quê
Novo endpoint `PATCH /users/me/avatar` (+ `DELETE`) para o utilizador
autenticado definir/remover a sua foto de perfil. A foto é guardada como
data URL base64 em `User.avatarUrl` (campo já existente — sem migração).
Validador `IsBase64ImageDataUrl` restringe a png/jpeg/webp. Limite do JSON
body parser subido para 1mb; `@MaxLength(200_000)` é a fronteira real.

`GET /auth/me` já devolvia `avatarUrl` — sem alteração nas leituras.

## Testes
- Unit: validador (11 casos), controller (2 rotas novas).
- Integração: PATCH → /auth/me → DELETE, rejeição de https/svg, payload
  grande válido (200) vs. acima do MaxLength (400), 401 sem token.

## Fora de âmbito
Frontend (PR separado no repo `frontend`), fotos de terceiros, storage externo.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Aguardar CI `quality` verde e fazer squash-merge**

Sondar até estado terminal: `gh pr checks --watch`. Só com `quality` = pass: `gh pr merge --squash`. Se o CI estiver indisponível, esperar — nunca contornar a protecção do branch (regra 15 do CLAUDE.md).

---

# PARTE B — Frontend (`frontend`)

> Repositório git **separado** (`frontend/` é o root do próprio repo). Todos os comandos `git`/`gh`/`npm` desta parte correm-se **dentro de `frontend/`**. Branch: `feat/user-avatar-upload`.
>
> Só começar depois do contrato do PR da Parte A estar em `main` do `innova`.

## Task B1: `lib/image.ts` — redimensionamento e center-crop no browser

**Files:**
- Create: `frontend/lib/image.ts`
- Create: `frontend/lib/image.test.ts`
- Modify: `frontend/hooks/useCurrentUser.ts` (adicionar `avatarUrl` à interface)

**Interfaces:**
- Consumes: nada.
- Produces:
  - `export const MAX_AVATAR_DATA_URL_LEN = 200_000` (tem de bater com o `@MaxLength` do backend).
  - `export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024`.
  - `export function computeSquareCrop(w: number, h: number): { sx: number; sy: number; side: number }` — quadrado central de uma imagem `w×h`.
  - `export async function resizeImageToDataUrl(file: File, size?: number): Promise<string>` — lê o ficheiro, faz center-crop quadrado, redimensiona para `size` (default 256) e devolve `data:image/jpeg;base64,...`. Lança `Error('IMAGE_TOO_LARGE')` se, mesmo após downshift, exceder `MAX_AVATAR_DATA_URL_LEN`.
  - `CurrentUser.avatarUrl?: string | null`.

- [ ] **Step 1: Escrever `lib/image.test.ts` (falha)**

```ts
// frontend/lib/image.test.ts
import { describe, expect, test } from 'vitest';
import { computeSquareCrop } from './image';

describe('computeSquareCrop', () => {
  test('paisagem — recorta as laterais, centrado', () => {
    expect(computeSquareCrop(200, 100)).toEqual({ sx: 50, sy: 0, side: 100 });
  });
  test('retrato — recorta topo/fundo, centrado', () => {
    expect(computeSquareCrop(100, 200)).toEqual({ sx: 0, sy: 50, side: 100 });
  });
  test('quadrado — sem recorte', () => {
    expect(computeSquareCrop(150, 150)).toEqual({ sx: 0, sy: 0, side: 150 });
  });
  test('dimensão ímpar — arredonda o offset para baixo', () => {
    expect(computeSquareCrop(101, 100)).toEqual({ sx: 0, sy: 0, side: 100 });
    expect(computeSquareCrop(105, 100)).toEqual({ sx: 2, sy: 0, side: 100 });
  });
});
```

- [ ] **Step 2: Correr — verificar que falha**

Run: `npx vitest run lib/image.test.ts`
Expected: FAIL — `Failed to resolve import './image'`.

- [ ] **Step 3: Implementar `lib/image.ts`**

```ts
// frontend/lib/image.ts
// Processamento da foto de perfil no browser: center-crop quadrado +
// redimensionamento para 256px via <canvas>, devolvido como data URL JPEG.
// Sem dependências — o backend guarda a string tal e qual em User.avatarUrl.

/** Tem de ser idêntico ao @MaxLength(200_000) do UpdateMyAvatarDto no backend. */
export const MAX_AVATAR_DATA_URL_LEN = 200_000;

/** Rejeição rápida antes de sequer descodificar o ficheiro. */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export function computeSquareCrop(
  w: number,
  h: number,
): { sx: number; sy: number; side: number } {
  const side = Math.min(w, h);
  return {
    sx: Math.floor((w - side) / 2),
    sy: Math.floor((h - side) / 2),
    side,
  };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Não foi possível ler o ficheiro'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Ficheiro de imagem inválido'));
    img.src = src;
  });
}

function drawSquare(
  img: HTMLImageElement,
  size: number,
  quality: number,
): string {
  const { sx, sy, side } = computeSquareCrop(img.naturalWidth, img.naturalHeight);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponível');
  ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
  return canvas.toDataURL('image/jpeg', quality);
}

export async function resizeImageToDataUrl(
  file: File,
  size = 256,
): Promise<string> {
  const img = await loadImage(await readFileAsDataUrl(file));

  let out = drawSquare(img, size, 0.85);
  if (out.length > 120_000) out = drawSquare(img, size, 0.7);
  if (out.length > 160_000) out = drawSquare(img, 192, 0.7);
  if (out.length > MAX_AVATAR_DATA_URL_LEN) throw new Error('IMAGE_TOO_LARGE');
  return out;
}
```

- [ ] **Step 4: Correr — verificar que passa**

Run: `npx vitest run lib/image.test.ts`
Expected: PASS (4 testes). (`resizeImageToDataUrl` não é testada em unit — jsdom não codifica canvas; é exercitada na verificação manual da Task B7.)

- [ ] **Step 5: Adicionar `avatarUrl` à interface `CurrentUser`**

Em `frontend/hooks/useCurrentUser.ts`, dentro de `export interface CurrentUser`, a seguir a `email: string;`:

```ts
  avatarUrl?: string | null;
```

- [ ] **Step 6: Type-check + commit**

Run: `npx tsc --noEmit`
Expected: sem erros.

```bash
git add lib/image.ts lib/image.test.ts hooks/useCurrentUser.ts
git commit -m "feat(avatar): utilitário de center-crop/resize e tipo avatarUrl

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WKndfttK1uPKXpm44tXMCw"
```

---

## Task B2: `Avatar.tsx` — ramo `<img>` para data URLs

**Files:**
- Modify: `frontend/components/ui/Avatar.tsx`
- Create: `frontend/components/ui/Avatar.test.tsx`

**Interfaces:**
- Consumes: nada (a prop `url?: string` já existe).
- Produces: comportamento — quando `url` começa por `data:`, renderiza `<img>` nativo (não `next/image`); restante API inalterada.

- [ ] **Step 1: Escrever `Avatar.test.tsx` (falha)**

```tsx
// frontend/components/ui/Avatar.test.tsx
import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Avatar } from './Avatar';

const DATA_URL = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';

describe('Avatar', () => {
  test('sem url — mostra as iniciais do nome', () => {
    render(<Avatar name="Ana Lopes" />);
    expect(screen.getByText('AL')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  test('url data: — renderiza um <img> com o src exacto (sem passar pelo next/image)', () => {
    render(<Avatar name="Ana Lopes" url={DATA_URL} />);
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', DATA_URL);
    expect(img).toHaveAttribute('alt', 'Ana Lopes');
  });

  test('url http(s) — renderiza uma imagem (via next/image)', () => {
    render(<Avatar name="Ana Lopes" url="https://cdn.example/a.png" />);
    expect(screen.getByRole('img')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Correr — verificar que falha**

Run: `npx vitest run components/ui/Avatar.test.tsx`
Expected: FAIL no 2º teste — com o código actual, `next/image` reescreve o `src` de uma data URL (não fica igual a `DATA_URL`).

- [ ] **Step 3: Adicionar o ramo `<img>`**

Em `frontend/components/ui/Avatar.tsx`, substituir o bloco `if (url) { ... }` por:

```tsx
  if (url) {
    const isData = url.startsWith('data:');
    return (
      <div
        className={cn(
          'relative overflow-hidden rounded-full',
          SIZE_CLASSES[size],
          className,
        )}
      >
        {isData ? (
          // next/image não processa data URIs; <img> nativo evita-o.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={name}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <Image src={url} alt={name} fill className="object-cover" />
        )}
      </div>
    );
  }
```

- [ ] **Step 4: Correr — verificar que passa**

Run: `npx vitest run components/ui/Avatar.test.tsx`
Expected: PASS (3 testes).

- [ ] **Step 5: Lint + commit**

Run: `npx eslint components/ui/Avatar.tsx`
Expected: sem erros (o `eslint-disable` cobre a regra `no-img-element`).

```bash
git add components/ui/Avatar.tsx components/ui/Avatar.test.tsx
git commit -m "feat(avatar): Avatar renderiza <img> nativo para data URLs

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WKndfttK1uPKXpm44tXMCw"
```

---

## Task B3: `hooks/useUpdateAvatar.ts`

**Files:**
- Create: `frontend/hooks/useUpdateAvatar.ts`

**Interfaces:**
- Consumes: `useApiMutation` (`hooks/useApiQuery`), `apiClient` (`lib/apiClient`), `queryKeys.auth.me()`, `useToast` (`providers/ToastProvider`). Endpoint `PATCH`/`DELETE /users/me/avatar` da Parte A.
- Produces: `export function useUpdateAvatar(): { setAvatar: (dataUrl: string) => void; removeAvatar: () => void; saving: boolean }`.

- [ ] **Step 1: Implementar o hook**

```ts
// frontend/hooks/useUpdateAvatar.ts
// Mutações da foto de perfil. Ambas invalidam queryKeys.auth.me() — a única
// entrada de cache do utilizador autenticado — por isso Topbar e Definições
// re-renderizam com a nova foto sem reload.

'use client';

import { useApiMutation } from './useApiQuery';
import { apiClient } from '@/lib/apiClient';
import { queryKeys } from '@/lib/queryKeys';
import { useToast } from '@/providers/ToastProvider';

export function useUpdateAvatar() {
  const notify = useToast();

  const set = useApiMutation<{ avatarUrl: string }, string>(
    (dataUrl) => apiClient.patch('/users/me/avatar', { avatarUrl: dataUrl }),
    {
      invalidateKeys: [queryKeys.auth.me()],
      onSuccess: () =>
        notify({ title: 'Foto de perfil actualizada', intent: 'success' }),
      onError: (e) =>
        notify({ title: e.message || 'Erro ao guardar a foto', intent: 'danger' }),
    },
  );

  const remove = useApiMutation<{ avatarUrl: null }, void>(
    () => apiClient.delete('/users/me/avatar'),
    {
      invalidateKeys: [queryKeys.auth.me()],
      onSuccess: () =>
        notify({ title: 'Foto de perfil removida', intent: 'success' }),
      onError: (e) =>
        notify({ title: e.message || 'Erro ao remover a foto', intent: 'danger' }),
    },
  );

  return {
    setAvatar: set.mutate,
    removeAvatar: remove.mutate,
    saving: set.isPending || remove.isPending,
  };
}
```

- [ ] **Step 2: Type-check + commit**

Run: `npx tsc --noEmit`
Expected: sem erros.

```bash
git add hooks/useUpdateAvatar.ts
git commit -m "feat(avatar): hook useUpdateAvatar (PATCH/DELETE + invalida auth.me)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WKndfttK1uPKXpm44tXMCw"
```

---

## Task B4: `components/ui/AvatarUploader.tsx`

**Files:**
- Create: `frontend/components/ui/AvatarUploader.tsx`
- Create: `frontend/components/ui/AvatarUploader.test.tsx`

**Interfaces:**
- Consumes: `Avatar` (`./Avatar`), `Button` (`./Button`), `useUpdateAvatar` (B3), `resizeImageToDataUrl` + `MAX_UPLOAD_BYTES` (B1), `useToast`.
- Produces: `export function AvatarUploader(props: { name: string; url?: string | null; size?: 'sm' | 'md' | 'lg' }): JSX.Element`.

- [ ] **Step 1: Escrever `AvatarUploader.test.tsx` (falha)**

```tsx
// frontend/components/ui/AvatarUploader.test.tsx
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const notify = vi.fn();
const setAvatar = vi.fn();
const removeAvatar = vi.fn();

vi.mock('@/providers/ToastProvider', () => ({ useToast: () => notify }));
vi.mock('@/hooks/useUpdateAvatar', () => ({
  useUpdateAvatar: () => ({ setAvatar, removeAvatar, saving: false }),
}));

import { AvatarUploader } from './AvatarUploader';

beforeEach(() => {
  notify.mockClear();
  setAvatar.mockClear();
  removeAvatar.mockClear();
});

describe('AvatarUploader', () => {
  test('sem url — botão diz "Carregar foto" e não há "Remover foto"', () => {
    render(<AvatarUploader name="Ana Lopes" />);
    expect(screen.getByRole('button', { name: 'Carregar foto' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remover foto' })).not.toBeInTheDocument();
  });

  test('com url — mostra "Alterar foto" e "Remover foto"', () => {
    render(<AvatarUploader name="Ana Lopes" url="data:image/jpeg;base64,AAAA" />);
    expect(screen.getByRole('button', { name: 'Alterar foto' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remover foto' }));
    expect(removeAvatar).toHaveBeenCalledTimes(1);
  });

  test('ficheiro acima de 8 MB — toast de erro, não chama setAvatar', () => {
    render(<AvatarUploader name="Ana Lopes" />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const big = new File([new Uint8Array(9 * 1024 * 1024)], 'foto.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [big] } });
    expect(setAvatar).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ intent: 'danger' }),
    );
  });
});
```

- [ ] **Step 2: Correr — verificar que falha**

Run: `npx vitest run components/ui/AvatarUploader.test.tsx`
Expected: FAIL — módulo `./AvatarUploader` não existe.

- [ ] **Step 3: Implementar `AvatarUploader.tsx`**

```tsx
// frontend/components/ui/AvatarUploader.tsx
// Afordância de upload da foto de perfil: o Avatar actual + botões.
// Redimensiona no browser (lib/image) e delega a persistência ao
// useUpdateAvatar. Reutilizado no Topbar (dentro de um Modal) e na
// aba Perfil das Definições (inline).

'use client';

import { useRef, useState, type ChangeEvent } from 'react';
import { Avatar } from './Avatar';
import { Button } from './Button';
import { useToast } from '@/providers/ToastProvider';
import { useUpdateAvatar } from '@/hooks/useUpdateAvatar';
import { resizeImageToDataUrl, MAX_UPLOAD_BYTES } from '@/lib/image';

interface AvatarUploaderProps {
  name: string;
  url?: string | null;
  size?: 'sm' | 'md' | 'lg';
}

export function AvatarUploader({ name, url, size = 'lg' }: AvatarUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const notify = useToast();
  const { setAvatar, removeAvatar, saving } = useUpdateAvatar();
  const [processing, setProcessing] = useState(false);
  const busy = saving || processing;

  async function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite re-seleccionar o mesmo ficheiro depois
    if (!file) return;

    if (file.size > MAX_UPLOAD_BYTES) {
      notify({ title: 'Imagem demasiado grande (máx. 8 MB)', intent: 'danger' });
      return;
    }

    setProcessing(true);
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      setAvatar(dataUrl);
    } catch (err) {
      const tooLarge = err instanceof Error && err.message === 'IMAGE_TOO_LARGE';
      notify({
        title: tooLarge
          ? 'Não foi possível comprimir a imagem o suficiente — tenta outra'
          : 'Não foi possível processar a imagem',
        intent: 'danger',
      });
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar name={name} url={url ?? undefined} size={size} />
      <div className="flex flex-col gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          hidden
          onChange={onFileChange}
        />
        <Button
          type="button"
          intent="secondary"
          size="sm"
          loading={busy}
          onClick={() => inputRef.current?.click()}
        >
          {url ? 'Alterar foto' : 'Carregar foto'}
        </Button>
        {url && (
          <Button
            type="button"
            intent="ghost"
            size="sm"
            disabled={busy}
            onClick={() => removeAvatar()}
          >
            Remover foto
          </Button>
        )}
      </div>
    </div>
  );
}
```

> Nota: com `loading={busy}`, o `Button` mostra o spinner e mantém o texto ("Alterar foto"/"Carregar foto") — o teste procura o botão por esse nome acessível, por isso o texto não pode ser trocado por "A processar…".

- [ ] **Step 4: Correr — verificar que passa**

Run: `npx vitest run components/ui/AvatarUploader.test.tsx`
Expected: PASS (3 testes).

- [ ] **Step 5: Lint + type-check + commit**

```bash
npx eslint components/ui/AvatarUploader.tsx && npx tsc --noEmit
git add components/ui/AvatarUploader.tsx components/ui/AvatarUploader.test.tsx
git commit -m "feat(avatar): componente AvatarUploader (resize no browser + botões)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WKndfttK1uPKXpm44tXMCw"
```

---

## Task B5: `Topbar.tsx` — avatar real, clicável, com Modal

**Files:**
- Modify: `frontend/components/Topbar.tsx`

**Interfaces:**
- Consumes: `Avatar` (`@/components/ui/Avatar`), `Modal` + `ModalContent` (`@/components/ui/Modal`), `AvatarUploader` (`@/components/ui/AvatarUploader`), `useCurrentUser` (já usado).
- Produces: nada (folha de UI).

- [ ] **Step 1: Reescrever o bloco do avatar**

Em `frontend/components/Topbar.tsx`:

1. Ajustar imports:

```tsx
'use client';
import { useState } from 'react';
import { Bell, Search } from 'lucide-react'; // 'User' deixa de ser usado
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { Avatar } from '@/components/ui/Avatar';
import { Modal, ModalContent } from '@/components/ui/Modal';
import { AvatarUploader } from '@/components/ui/AvatarUploader';
```

2. No corpo do componente, adicionar estado:

```tsx
  const { data: user } = useCurrentUser();
  const [open, setOpen] = useState(false);
```

3. Substituir o `<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>` que contém o círculo do avatar + nome/email por:

```tsx
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Abrir foto de perfil"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
          }}
        >
          <Avatar
            name={user?.fullName ?? 'Utilizador'}
            url={user?.avatarUrl ?? undefined}
            size="sm"
          />
          <div style={{ textAlign: 'left' }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', margin: 0 }}>
              {user?.fullName ?? 'Utilizador'}
            </p>
            <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>
              {user?.email ?? ''}
            </p>
          </div>
        </button>

        <Modal open={open} onOpenChange={setOpen}>
          <ModalContent title="Foto de perfil">
            <div className="mt-4">
              <AvatarUploader
                name={user?.fullName ?? 'Utilizador'}
                url={user?.avatarUrl ?? undefined}
                size="lg"
              />
            </div>
          </ModalContent>
        </Modal>
```

> `Modal` é o `Dialog.Root` da radix — aceita `open` / `onOpenChange`. `ModalContent` já traz `Dialog.Portal` + overlay + botão de fechar.

- [ ] **Step 2: Type-check + lint + build**

```bash
npx tsc --noEmit && npx eslint components/Topbar.tsx && npm run build
```
Expected: sem erros; `User` já não é importado (senão o lint `no-unused-vars` acusa).

- [ ] **Step 3: Commit**

```bash
git add components/Topbar.tsx
git commit -m "feat(topbar): avatar real clicável abre modal de foto de perfil

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WKndfttK1uPKXpm44tXMCw"
```

---

## Task B6: `TabPerfil.tsx` — uploader inline nas Definições

**Files:**
- Modify: `frontend/components/settings/TabPerfil.tsx`

**Interfaces:**
- Consumes: `AvatarUploader` (`@/components/ui/AvatarUploader`).
- Produces: nada.

- [ ] **Step 1: Trocar o `<Avatar>` estático pelo uploader**

Em `frontend/components/settings/TabPerfil.tsx`:

1. Trocar o import:

```tsx
// era: import { Avatar } from '@/components/ui/Avatar';
import { AvatarUploader } from '@/components/ui/AvatarUploader';
```

2. No "Cartão principal", substituir:

```tsx
            <Avatar name={user.fullName} size="lg" />
```

por:

```tsx
            <AvatarUploader
              name={user.fullName}
              url={user.avatarUrl ?? undefined}
              size="lg"
            />
```

- [ ] **Step 2: Type-check + lint + build**

```bash
npx tsc --noEmit && npx eslint components/settings/TabPerfil.tsx && npm run build
```
Expected: sem erros; `Avatar` já não é importado neste ficheiro.

- [ ] **Step 3: Commit**

```bash
git add components/settings/TabPerfil.tsx
git commit -m "feat(settings): AvatarUploader inline na aba Perfil

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WKndfttK1uPKXpm44tXMCw"
```

---

## Task B7: Verificação final, prova manual e PR (frontend)

- [ ] **Step 1: Verificação completa**

```bash
npx tsc --noEmit
npm run build
npm test
npx prettier --check "lib/image.ts" "lib/image.test.ts" "hooks/useUpdateAvatar.ts" "hooks/useCurrentUser.ts" "components/ui/Avatar.tsx" "components/ui/Avatar.test.tsx" "components/ui/AvatarUploader.tsx" "components/ui/AvatarUploader.test.tsx" "components/Topbar.tsx" "components/settings/TabPerfil.tsx"
```
Se o prettier acusar: `npx prettier --write` nos mesmos caminhos + commit `style: prettier`.
Expected: `npm test` — os ficheiros de teste base do repo (4) + `image.test.ts` + `Avatar.test.tsx` + `AvatarUploader.test.tsx` todos verdes.

- [ ] **Step 2: Prova manual (backend do `innova` a correr na 4000, PR da Parte A já em `main`)**

1. `npm run dev` no `frontend/`, login com um utilizador de teste.
2. Canto superior direito → clicar no avatar/nome → abre o modal "Foto de perfil".
3. "Carregar foto" → escolher um JPEG/PNG grande (ex. 3000×2000).
4. Confirmar: toast "Foto de perfil actualizada"; o avatar no Topbar passa a mostrar a foto (center-crop, circular) **sem reload**.
5. Abrir **Definições → Perfil**: o mesmo avatar mostra a foto.
6. Em Definições, "Remover foto" → toast "removida"; Topbar e Perfil voltam às iniciais.
7. DevTools → Network: o `PATCH /users/me/avatar` leva `avatarUrl` a começar por `data:image/jpeg;base64,`; resposta 200. O `GET /auth/me` seguinte traz o mesmo valor.

- [ ] **Step 3: Push + PR**

```bash
git push -u origin feat/user-avatar-upload
gh pr create --title "feat(avatar): upload self-service de foto de perfil" --body "$(cat <<'EOF'
## O quê
O avatar do canto superior direito passa a ser clicável e abre um modal
para carregar a foto de perfil. A foto é redimensionada no browser
(center-crop 256×256, JPEG) e enviada como data URL para
`PATCH /users/me/avatar` (backend: innova PR #<N>). Aparece no Topbar e em
Definições → Perfil sem reload (invalidação de `queryKeys.auth.me()`).
`Avatar` renderiza `<img>` nativo para data URLs. "Remover foto" volta às
iniciais.

## Testes
- `lib/image.test.ts` — `computeSquareCrop` (paisagem/retrato/quadrado/ímpar).
- `components/ui/Avatar.test.tsx` — ramo data-URL vs. next/image vs. iniciais.
- `components/ui/AvatarUploader.test.tsx` — rótulos dos botões, remover, guard de 8 MB.
- Prova manual: upload → visível no Topbar + Definições sem reload; remover.

## Fora de âmbito
Fotos de terceiros em listas/organograma; cropper interactivo; storage externo.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Aguardar CI verde e squash-merge**

`gh pr checks --watch` até estado terminal; só então `gh pr merge --squash`.

---

## Self-Review (feito ao escrever o plano)

**1. Cobertura do spec:**
- Validador `IsBase64ImageDataUrl` → Task A1.
- `UpdateMyAvatarDto` + `@MaxLength(200_000)` → A2.
- Rotas `PATCH`/`DELETE /users/me/avatar` + métodos do serviço → A2.
- Limite do JSON body parser em `main.ts` → A2 Step 6.
- `/auth/me` sem alteração (já devolve `avatarUrl`) → coberto pela asserção em A3.
- Testes backend (validador, controller, integração incl. payload grande) → A1, A2, A3.
- `CurrentUser.avatarUrl` → B1 Step 5.
- `Avatar` ramo `data:` `<img>` → B2.
- `AvatarUploader` (center-crop, downshift, guard 8 MB, remover) → B1 (`lib/image`) + B4.
- `useUpdateAvatar` com invalidação de `auth.me()` → B3.
- `Topbar` com `<Avatar>` clicável + Modal → B5.
- `TabPerfil` com uploader inline → B6.
- Fora de âmbito (terceiros, cropper, S3) → não há tarefas, correcto.
- Rollout: PR backend primeiro, PR frontend depois, CI em ambos → A4, B7.

**2. Placeholders:** nenhum `TBD`/`TODO`/"handle edge cases"; todos os passos de código têm bloco de código. Dois pontos de confirmação explícita contra o repo (nome do config jest de integração em A3 Step 2; etiqueta do `getToken` em A3) — são verificações reais, com instrução do que fazer, não placeholders.

**3. Consistência de tipos/nomes:**
- `setAvatar`/`clearAvatar` (serviço backend) vs. `setMyAvatar`/`removeMyAvatar` (controller) — usados de forma consistente entre A2 e A3.
- `setAvatar`/`removeAvatar`/`saving` (hook frontend `useUpdateAvatar`) — idênticos entre B3 (produz) e B4 (consome).
- `resizeImageToDataUrl`, `computeSquareCrop`, `MAX_UPLOAD_BYTES`, `MAX_AVATAR_DATA_URL_LEN` — idênticos entre B1 (produz) e B4 (consome).
- `200_000` — igual no `@MaxLength` (A2) e em `MAX_AVATAR_DATA_URL_LEN` (B1); registado nas Global Constraints.
- Contrato da rota (`{ avatarUrl }` / `{ avatarUrl: null }`) — igual entre A2, A3 e B3.
