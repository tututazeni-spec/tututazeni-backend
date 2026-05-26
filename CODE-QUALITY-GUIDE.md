# INNOVA — Guia Completo de Qualidade de Código
> ESLint Segurança + SonarQube + Coverage + Husky
> NestJS + Prisma + PostgreSQL | 6000 funcionários

---

## ⚠️ REGRAS OBRIGATÓRIAS DO PROJECTO INNOVA

```
- fullName (NUNCA name) no modelo User
- entity (NUNCA entityType) no AuditLog
- textContent (NUNCA content) nas Lesson
- courseId_userId compound key no Enrollment
- NotificationLog.metadata → sempre JSON.stringify()
- legacyPdi (NUNCA pdi como modelo Prisma)
- badgeAward (NUNCA badge como modelo Prisma)
- AttendanceRecord (NUNCA Attendance como modelo)
- roleCode para filtrar roles (NUNCA where: { role: 'RH' })
- Login retorna accessToken (não access_token)
- Login retorna status 201 (não 200)
```

---

## FASE 0 — VERIFICAÇÃO DO QUE JÁ EXISTE

Antes de instalar ou criar qualquer coisa, verifica:

```bash
# 1. ESLint já configurado?
cat .eslintrc.js 2>/dev/null || cat .eslintrc.json 2>/dev/null || echo "NAO EXISTE"

# 2. Prettier já configurado?
cat .prettierrc 2>/dev/null || echo "NAO EXISTE"

# 3. Husky já instalado?
ls .husky/ 2>/dev/null || echo "NAO EXISTE"

# 4. SonarScanner já instalado?
npm list sonarqube-scanner 2>/dev/null

# 5. sonar-project.properties já existe?
cat sonar-project.properties 2>/dev/null || echo "NAO EXISTE"

# 6. Coverage já existe?
ls coverage/ 2>/dev/null || echo "NAO EXISTE"

# 7. Scripts existentes no package.json
cat package.json | grep -E "lint|format|coverage|sonar|husky"
```

Regista o que existe e o que falta antes de avançar.

---

## FASE 1 — ESLINT COM REGRAS DE SEGURANÇA

### 1.1 — Instalar dependências de segurança

```bash
npm install --save-dev \
  eslint-plugin-security \
  eslint-plugin-no-secrets \
  eslint-plugin-sonarjs \
  @typescript-eslint/eslint-plugin \
  @typescript-eslint/parser \
  eslint-plugin-prettier \
  eslint-config-prettier \
  eslint-plugin-unused-imports \
  eslint-plugin-import
```

### 1.2 — Criar/Actualizar `.eslintrc.js`

```javascript
module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: 'tsconfig.json',
    tsconfigRootDir: __dirname,
    sourceType: 'module',
  },
  plugins: [
    '@typescript-eslint/eslint-plugin',
    'security',
    'no-secrets',
    'sonarjs',
    'unused-imports',
    'import',
  ],
  extends: [
    'plugin:@typescript-eslint/recommended',
    'plugin:security/recommended',
    'plugin:sonarjs/recommended',
    'plugin:prettier/recommended',
  ],
  root: true,
  env: {
    node: true,
    jest: true,
  },
  ignorePatterns: [
    '.eslintrc.js',
    'dist/**',
    'node_modules/**',
    'load-tests/**',
    'bruno/**',
    'prisma/migrations/**',
    'coverage/**',
    '.claude/**',
    'frontend/**',
  ],
  rules: {
    // TypeScript
    '@typescript-eslint/interface-name-prefix': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': 'off',
    '@typescript-eslint/no-floating-promises': 'warn',
    '@typescript-eslint/await-thenable': 'error',
    '@typescript-eslint/no-misused-promises': 'warn',

    // Segurança
    'security/detect-object-injection': 'warn',
    'security/detect-non-literal-regexp': 'warn',
    'security/detect-unsafe-regex': 'error',
    'security/detect-buffer-noassert': 'error',
    'security/detect-child-process': 'warn',
    'security/detect-disable-mustache-escape': 'error',
    'security/detect-eval-with-expression': 'error',
    'security/detect-new-buffer': 'error',
    'security/detect-no-csrf-before-method-override': 'error',
    'security/detect-possible-timing-attacks': 'warn',
    'security/detect-pseudoRandomBytes': 'error',
    'no-secrets/no-secrets': ['error', { tolerance: 4.2 }],

    // SonarJS (qualidade)
    'sonarjs/no-duplicate-string': ['warn', { threshold: 3 }],
    'sonarjs/no-identical-functions': 'error',
    'sonarjs/cognitive-complexity': ['warn', 15],
    'sonarjs/no-collapsible-if': 'warn',
    'sonarjs/no-collection-size-mischeck': 'error',
    'sonarjs/no-redundant-jump': 'warn',
    'sonarjs/no-same-line-conditional': 'error',
    'sonarjs/no-unused-collection': 'warn',
    'sonarjs/prefer-immediate-return': 'warn',

    // Imports
    'unused-imports/no-unused-imports': 'error',
    'unused-imports/no-unused-vars': [
      'warn',
      {
        vars: 'all',
        varsIgnorePattern: '^_',
        args: 'after-used',
        argsIgnorePattern: '^_',
      },
    ],
    'no-duplicate-imports': 'error',

    // Boas práticas
    'no-console': 'warn',
    'no-eval': 'error',
    'no-implied-eval': 'error',
    'no-new-func': 'error',
    'no-return-await': 'warn',
    'require-await': 'warn',

    // Prettier
    'prettier/prettier': ['error', { endOfLine: 'auto' }],
  },
};
```

### 1.3 — Criar `.prettierrc` (só se não existir)

```json
{
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "semi": true,
  "bracketSpacing": true,
  "arrowParens": "avoid",
  "endOfLine": "lf"
}
```

### 1.4 — Criar `.prettierignore` (só se não existir)

```
node_modules
dist
coverage
load-tests
bruno
.husky
prisma/migrations
*.json
*.md
*.yml
*.yaml
```

### 1.5 — Adicionar scripts ao package.json (só se não existirem)

```json
"lint": "eslint \"{src,apps,libs}/**/*.ts\" --fix",
"lint:check": "eslint \"{src,apps,libs}/**/*.ts\"",
"lint:security": "eslint \"{src,apps,libs}/**/*.ts\" --plugin security",
"format": "prettier --write \"src/**/*.ts\"",
"format:check": "prettier --check \"src/**/*.ts\""
```

### 1.6 — Correr o lint

```bash
# Verifica erros
npm run lint:check

# Corrige automaticamente
npm run lint

# Build deve passar após lint
npm run build
```

---

## FASE 2 — COBERTURA DE CÓDIGO (coverage/ + lcov.info)

### 2.1 — Actualizar configuração Jest no package.json

```json
"jest": {
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": "src",
  "testRegex": ".*\\.spec\\.ts$",
  "transform": {
    "^.+\\.(t|j)s$": "ts-jest"
  },
  "collectCoverageFrom": [
    "**/*.(t|j)s",
    "!**/*.spec.ts",
    "!**/main.ts",
    "!**/*.module.ts",
    "!**/*.dto.ts",
    "!**/*.entity.ts",
    "!**/*.interface.ts",
    "!**/*.enum.ts",
    "!**/*.constant.ts",
    "!**/prisma/**"
  ],
  "coverageDirectory": "../coverage",
  "coverageReporters": ["text", "lcov", "html", "json-summary"],
  "testEnvironment": "node"
}
```

### 2.2 — Adicionar scripts de coverage

```json
"test:coverage": "jest --coverage --forceExit --passWithNoTests",
"test:coverage:open": "jest --coverage --forceExit --passWithNoTests && start coverage/lcov-report/index.html"
```

### 2.3 — Gerar coverage/ e lcov.info

```bash
npm run test:coverage
```

### 2.4 — Verificar que lcov.info foi criado

```bash
ls -la coverage/
# Deve mostrar:
# lcov.info          ← ficheiro que o SonarQube usa
# lcov-report/       ← relatório HTML
# coverage-summary.json
```

---

## FASE 3 — SONARSCANNER (verificar e instalar)

### 3.1 — Verificar se já está instalado

```bash
npm list sonarqube-scanner
npm exec sonar-scanner -- --version
```

### 3.2 — Instalar apenas se não existir

```bash
npm install --save-dev sonarqube-scanner
```

---

## FASE 4 — SONAR-PROJECT.PROPERTIES

### 4.1 — Verificar se já existe

```bash
cat sonar-project.properties
```

### 4.2 — Criar/Actualizar com conteúdo completo

```properties
sonar.projectKey=evoslda2025-prog_innova-backend
sonar.organization=evoslda2025-prog
sonar.projectName=INNOVA Backend
sonar.projectVersion=1.0
sonar.host.url=https://sonarcloud.io
sonar.sources=src
sonar.sourceEncoding=UTF-8
sonar.typescript.tsconfigPath=tsconfig.json
sonar.javascript.lcov.reportPaths=coverage/lcov.info
sonar.typescript.lcov.reportPaths=coverage/lcov.info
sonar.exclusions=**/*.spec.ts,**/*.e2e-spec.ts,**/node_modules/**,**/dist/**,**/load-tests/**,**/bruno/**,**/prisma/migrations/**,**/.claude/**,**/frontend/**,**/coverage/**,**/worktrees/**
sonar.cpd.exclusions=**/*.dto.ts,**/*.entity.ts,**/*.module.ts,**/*.interface.ts
sonar.qualitygate.wait=true
```

---

## FASE 5 — SONARQUBE THRESHOLDS MÍNIMOS

### 5.1 — Quality Gate no SonarCloud

```
Abre: https://sonarcloud.io/organizations/evoslda2025-prog/quality_gates

Cria Quality Gate "INNOVA Gate":

Condição                      Threshold
──────────────────────────────────────────
Coverage                      > 50%
Duplicated Lines (%)          < 5%
Maintainability Rating        A ou B
Reliability Rating            A ou B
Security Rating               A
Security Hotspots Reviewed    > 80%
Bugs                          < 10
Vulnerabilities               = 0
Code Smells                   < 50
```

### 5.2 — Correr o scan com coverage

```bash
# 1. Gera coverage primeiro
npm run test:coverage

# 2. Carrega token do .env
# PowerShell:
Get-Content .env | Where-Object { $_ -match "SONAR_TOKEN" } | ForEach-Object {
  $parts = $_ -split "=", 2
  $env:SONAR_TOKEN = $parts[1].Trim()
}

# 3. Confirma token
$env:SONAR_TOKEN.Substring(0,8)

# 4. Corre o scan
npm exec sonar-scanner
```

---

## FASE 6 — HUSKY + LINT-STAGED

### 6.1 — Verificar se já existe

```bash
ls .husky/
npm list husky lint-staged
```

### 6.2 — Instalar apenas se não existir

```bash
npm install --save-dev husky lint-staged
npx husky install
```

### 6.3 — Criar `.husky/pre-commit`

```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

echo "Verificar qualidade antes do commit..."
npx lint-staged
echo "Qualidade verificada"
```

### 6.4 — Criar `.husky/pre-push`

```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

echo "Verificar lint antes do push..."
npm run lint:check
echo "Push autorizado"
```

### 6.5 — Adicionar lint-staged ao package.json

```json
"lint-staged": {
  "src/**/*.ts": [
    "eslint --fix",
    "prettier --write"
  ]
}
```

---

## FASE 7 — GITHUB ACTIONS CI/CD

### 7.1 — Criar `.github/workflows/quality.yml`

```yaml
name: Code Quality INNOVA

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  quality:
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
      - name: Checkout
        uses: actions/checkout@v3
        with:
          fetch-depth: 0

      - name: Setup Node.js 20
        uses: actions/setup-node@v3
        with:
          node-version: '20'
          cache: 'npm'

      - name: Instalar dependencias
        run: npm ci

      - name: Verificar lint
        run: npm run lint:check

      - name: Build
        run: npm run build

      - name: Gerar coverage
        run: npm run test:coverage

      - name: SonarCloud Scan
        uses: SonarSource/sonarcloud-github-action@master
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
```

---

## ORDEM DE EXECUÇÃO COMPLETA

```
FASE 0 → Verifica o que já existe
FASE 1 → ESLint com regras de segurança
FASE 2 → Gera coverage/ e lcov.info
FASE 3 → Verifica/instala SonarScanner
FASE 4 → Cria sonar-project.properties
FASE 5 → Corre o scan com coverage
FASE 6 → Configura Husky
FASE 7 → GitHub Actions

COMMIT FINAL:
git add -A
git commit -m "chore: code quality complete - eslint security sonarqube coverage" --no-verify
git push origin main
```

---

## PROMPT PARA O CLAUDE CODE

```
Lê o CODE-QUALITY-GUIDE.md na raiz do projecto
e executa todas as fases por ordem.

REGRA FUNDAMENTAL:
Começa sempre pela FASE 0 — verifica o que 
já existe antes de instalar ou criar qualquer coisa.
Nao duplica o que já existe.
Nao sobrescreve sem verificar primeiro.

Após cada fase confirma que npm run build passa.

REGRAS OBRIGATÓRIAS DO INNOVA:
- fullName (nunca name) no modelo User
- entity (nunca entityType) no AuditLog
- textContent (nunca content) nas Lesson
- courseId_userId compound key no Enrollment
- legacyPdi (nunca pdi como modelo)
- badgeAward (nunca badge como modelo)
- NotificationLog.metadata sempre JSON.stringify()
- Login retorna accessToken (nao access_token)
- Login retorna status 201 (nao 200)

Para o SONAR_TOKEN usa sempre o valor do .env.
Nunca peças o token directamente.

No final faz commit:
git add -A
git commit -m "chore: code quality - eslint security sonarqube coverage husky" --no-verify
git push origin main
```

---

*INNOVA — Code Quality Guide v2.0*
*ESLint Seguranca + SonarQube Thresholds + Coverage + Husky + GitHub Actions*
*Verifica sempre o que existe antes de criar — Nao duplicar*
