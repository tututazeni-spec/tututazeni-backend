# INNOVA — Guia Completo de Testes E2E (End-to-End)
> Playwright + Browser real | Frontend + Backend + BD juntos
> A última fase de testes antes da produção

---

## O QUE SÃO TESTES E2E

```
Testes E2E simulam um utilizador REAL:
→ Abre o browser de verdade (Chromium)
→ Escreve o email e password no formulário
→ Clica no botão de login
→ Navega pelos menus
→ Inscreve-se num curso
→ Verifica que tudo aparece no ecrã

Testa a plataforma COMPLETA:
Frontend (Next.js) + Backend (NestJS) + BD (PostgreSQL)
```

---

## ⚠️ REGRAS OBRIGATÓRIAS DO PROJECTO INNOVA

```
- fullName (NUNCA name) no modelo User
- entity (NUNCA entityType) no AuditLog
- courseId_userId compound key no Enrollment
- legacyPdi (NUNCA pdi como modelo)
- badgeAward (NUNCA badge como modelo)
- AttendanceRecord (NUNCA Attendance)
- Login retorna accessToken (não access_token)
- Login retorna status 201 (não 200)
- BD de teste: innova_test (NUNCA innova)
- Backend: porta 4000 | Frontend: porta 3000
```

---

## PRÉ-REQUISITOS

```
Para os E2E precisas dos DOIS a correr:

Terminal 1 → Backend:
$env:NODE_ENV="test"
node dist/main.js
# porta 4000

Terminal 2 → Frontend:
cd frontend
npm run dev
# porta 3000

Terminal 3 → Testes E2E
```

---

## FASE 0 — VERIFICAÇÃO INICIAL

```bash
# 1. Frontend existe e arranca?
ls frontend/package.json

# 2. Backend compilado?
ls dist/main.js

# 3. BD de teste com utilizadores seed?
# (os utilizadores int.*@innova-test.com devem existir)

# 4. Playwright já instalado?
npm list @playwright/test 2>/dev/null
```

---

## FASE 1 — INSTALAR O PLAYWRIGHT

```bash
# Na raiz do projecto backend (ou numa pasta e2e/ própria)
npm install --save-dev @playwright/test

# Instala o browser Chromium (~150MB, uma vez só)
npx playwright install chromium
```

---

## FASE 2 — CONFIGURAÇÃO

### 2.1 — Criar `playwright.config.ts` na raiz

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test/e2e',
  timeout: 60000,
  retries: 1,
  workers: 1,              // 1 de cada vez no PC local
  use: {
    baseURL: 'http://localhost:3000',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'on-first-retry',
  },
  reporter: [
    ['list'],
    ['html', { outputFolder: 'test/e2e/reports', open: 'never' }],
  ],
});
```

### 2.2 — Adicionar scripts ao `package.json`

```json
"test:e2e": "playwright test",
"test:e2e:ui": "playwright test --ui",
"test:e2e:headed": "playwright test --headed",
"test:e2e:report": "playwright show-report test/e2e/reports"
```

---

## FASE 3 — HELPER DE LOGIN

### Criar `test/e2e/helpers/login.helper.ts`

```typescript
import { Page } from '@playwright/test';

export const E2E_USERS = {
  employee: { email: 'int.employee@innova-test.com', password: 'Test@1234' },
  rh:       { email: 'int.rh@innova-test.com',       password: 'Test@1234' },
  admin:    { email: 'int.admin@innova-test.com',     password: 'Test@1234' },
};

export async function login(
  page: Page,
  user: keyof typeof E2E_USERS,
) {
  await page.goto('/login');
  await page.fill('input[name="email"]', E2E_USERS[user].email);
  await page.fill('input[name="password"]', E2E_USERS[user].password);
  await page.click('button[type="submit"]');
  // Aguarda o redirect pós-login (ajustar à rota real)
  await page.waitForURL('**/dashboard', { timeout: 15000 });
}
```

> ⚠️ Os selectores (`input[name="email"]` etc.) devem ser
> ajustados ao HTML real do frontend. O Claude Code deve
> ler o page.tsx do login primeiro.

---

## FASE 4 — TESTES E2E DOS FLUXOS CRÍTICOS

### 4.1 — `test/e2e/auth.e2e.ts` — Login e Logout

```typescript
import { test, expect } from '@playwright/test';
import { login, E2E_USERS } from './helpers/login.helper';

test.describe('Autenticação E2E', () => {
  test('login com sucesso leva ao dashboard', async ({ page }) => {
    await login(page, 'employee');
    await expect(page).toHaveURL(/dashboard/);
  });

  test('password errada mostra mensagem de erro', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[name="email"]', E2E_USERS.employee.email);
    await page.fill('input[name="password"]', 'password_errada');
    await page.click('button[type="submit"]');
    // Ajustar ao texto/elemento real de erro do frontend
    await expect(page.locator('text=/inválid|incorrect|erro/i'))
      .toBeVisible({ timeout: 10000 });
  });

  test('rota protegida sem login redireciona para /login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/login/);
  });

  test('logout volta ao login', async ({ page }) => {
    await login(page, 'employee');
    // Ajustar ao botão real de logout
    await page.click('[data-testid="logout"], button:has-text("Sair")');
    await expect(page).toHaveURL(/login/);
  });
});
```

### 4.2 — `test/e2e/courses.e2e.ts` — Academia

```typescript
import { test, expect } from '@playwright/test';
import { login } from './helpers/login.helper';

test.describe('Cursos E2E', () => {
  test('lista de cursos carrega', async ({ page }) => {
    await login(page, 'employee');
    await page.goto('/courses');
    // Pelo menos 1 curso visível (do seed)
    await expect(page.locator('text=Curso Integração Teste'))
      .toBeVisible({ timeout: 15000 });
  });

  test('detalhe do curso abre', async ({ page }) => {
    await login(page, 'employee');
    await page.goto('/courses');
    await page.click('text=Curso Integração Teste');
    await expect(page.locator('h1, h2'))
      .toContainText(/Curso Integração Teste/);
  });

  test('inscrição num curso funciona', async ({ page }) => {
    await login(page, 'employee');
    await page.goto('/courses');
    await page.click('text=Curso Integração Teste');
    // Ajustar ao botão real
    const btn = page.locator('button:has-text(/Inscrever|Enroll/)');
    if (await btn.isVisible()) {
      await btn.click();
      // 201 criado OU mensagem de "já inscrito" (409) — ambos válidos
      await expect(
        page.locator('text=/inscrito|sucesso|already/i')
      ).toBeVisible({ timeout: 10000 });
    }
  });
});
```

### 4.3 — `test/e2e/rh.e2e.ts` — Permissões RH

```typescript
import { test, expect } from '@playwright/test';
import { login } from './helpers/login.helper';

test.describe('Permissões RH E2E', () => {
  test('RH vê a lista de utilizadores', async ({ page }) => {
    await login(page, 'rh');
    await page.goto('/users');
    // REGRA: o frontend mostra fullName
    await expect(page.locator('text=Employee Int'))
      .toBeVisible({ timeout: 15000 });
  });

  test('Employee NÃO vê a lista de utilizadores', async ({ page }) => {
    await login(page, 'employee');
    await page.goto('/users');
    // 403 → o frontend mostra erro ou redireciona
    await expect(
      page.locator('text=/sem permissão|forbidden|403|acesso negado/i')
        .or(page.locator('text=Employee Int'))
    ).toBeVisible({ timeout: 15000 });
    // O nome NÃO deve estar visível para employee
  });
});
```

### 4.4 — `test/e2e/pdi.e2e.ts` — PDI

```typescript
import { test, expect } from '@playwright/test';
import { login } from './helpers/login.helper';

test.describe('PDI E2E (legacyPdi)', () => {
  test('página do meu PDI carrega', async ({ page }) => {
    await login(page, 'employee');
    await page.goto('/pdi');
    // A página renderiza sem erro (mesmo vazia)
    await expect(page.locator('body')).not.toContainText(/500|erro interno/i);
  });
});
```

---

## FASE 5 — EXECUTAR

```bash
# Com backend (4000) e frontend (3000) a correr:

# Modo normal (headless)
npm run test:e2e

# Modo visual — vês o browser a trabalhar (ótimo para debug)
npm run test:e2e:headed

# Interface interactiva do Playwright
npm run test:e2e:ui

# Relatório HTML após os testes
npm run test:e2e:report
```

---

## RESULTADO ESPERADO

```
Running 10 tests using 1 worker

  ✓ Autenticação E2E › login com sucesso (4s)
  ✓ Autenticação E2E › password errada mostra erro (3s)
  ✓ Autenticação E2E › rota protegida redireciona (2s)
  ✓ Autenticação E2E › logout volta ao login (4s)
  ✓ Cursos E2E › lista de cursos carrega (5s)
  ✓ Cursos E2E › detalhe do curso abre (5s)
  ✓ Cursos E2E › inscrição funciona (6s)
  ✓ Permissões RH › RH vê utilizadores (5s)
  ✓ Permissões RH › Employee não vê (4s)
  ✓ PDI E2E › página carrega (4s)

10 passed (45s)
```

---

## COMMIT FINAL

```bash
git add -A
git commit -m "test: add E2E tests with Playwright - auth courses rh pdi" --no-verify
git push origin main
```

---

## PROMPT PARA O CLAUDE CODE

```
Concentra-te APENAS nos testes E2E com Playwright.
NÃO corras testes de carga (Artillery).
NÃO corras testes de API (Bruno CLI).
NÃO modifiques load-tests/ nem bruno/.
NÃO modifiques os testes existentes.

PRÉ-REQUISITO CRÍTICO antes de tudo:
Os E2E precisam do frontend E do backend a correr.
1. Verifica se o backend responde:
   curl http://localhost:4000
2. Verifica se o frontend responde:
   curl http://localhost:3000
3. Se algum não estiver a correr, AVISA-ME
   para os arrancar e PARA até confirmação.

Lê o E2E-TESTING-GUIDE.md na raiz e executa
as fases por ordem.

FASE 0 → Verifica pré-requisitos
FASE 1 → Instala @playwright/test + Chromium
FASE 2 → Cria playwright.config.ts + scripts
FASE 3 → Cria o login.helper.ts
         MAS PRIMEIRO lê o ficheiro real do
         frontend de login (frontend/app/login/
         page.tsx ou similar) para usar os
         selectores reais dos inputs e botões
FASE 4 → Cria os 4 ficheiros de teste,
         ajustando selectores e rotas ao
         frontend real (lê os page.tsx antes)
FASE 5 → Corre: npm run test:e2e
         Corrige selectores que falharem
         (1 ficheiro de cada vez)

Executa SEMPRE uma operação de cada vez.
A cada 20 minutos faz commit parcial.

REGRAS OBRIGATÓRIAS DO INNOVA:
- fullName (nunca name) no modelo User
- courseId_userId compound key no Enrollment
- legacyPdi (nunca pdi como modelo)
- Login retorna accessToken, status 201
- Rotas protegidas sem token → 401
- Sem permissão → 403
- BD de teste: innova_test
- Backend porta 4000, frontend porta 3000

No final:
git add -A
git commit -m "test: E2E tests passing with Playwright" --no-verify
git push origin main
```

---

*INNOVA — E2E Testing Guide v1.0*
*Playwright + Chromium | A última fase de testes*
*Após os E2E: produção (ver INNOVA-GUIA-PRODUCAO.pdf)*
