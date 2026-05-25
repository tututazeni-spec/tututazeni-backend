# INNOVA — Guia Completo de Qualidade de Código
> ESLint + Prettier + Husky + SonarQube/SonarCloud
> NestJS + Prisma + PostgreSQL | 6000 funcionários

---

## O QUE É QUALIDADE DE CÓDIGO

```
Testes de Carga    → "aguenta muita gente?"
Testes de API      → "responde correctamente?"
Qualidade de Código → "o código está bem escrito?"

Qualidade de Código verifica:
→ Código duplicado (copy-paste)
→ Funções demasiado complexas
→ Vulnerabilidades de segurança
→ Más práticas de programação
→ Cobertura de testes (% do código testado)
→ Formatação consistente
→ Erros antes de chegarem à produção
```

---

## FERRAMENTAS QUE VAMOS USAR

```
ESLint        → detecta erros e más práticas
Prettier      → formata o código automaticamente
Husky         → corre verificações antes do commit
lint-staged   → corre ESLint só nos ficheiros alterados
SonarQube     → análise profunda de qualidade e segurança
Jest Coverage → mede % do código coberto por testes
```

---

## FICHEIROS A CRIAR

```
raiz do projecto/
├── .eslintrc.js              ← regras ESLint (se não existir)
├── .prettierrc               ← regras Prettier
├── .prettierignore           ← ficheiros ignorados pelo Prettier
├── sonar-project.properties  ← configuração SonarQube
├── .husky/
│   ├── pre-commit            ← corre lint antes do commit
│   └── pre-push              ← corre testes antes do push
└── docker-compose.sonar.yml  ← SonarQube via Docker (local)
```

---

## ⚠️ REGRAS OBRIGATÓRIAS DO PROJECTO INNOVA

```
- campo fullName (NUNCA name) no modelo User
- campo entity (NUNCA entityType) no AuditLog
- textContent (NUNCA content) nas Lesson
- compound key courseId_userId no Enrollment
- NotificationLog.metadata → sempre JSON.stringify()
- legacyPdi (NUNCA pdi como modelo Prisma)
- badgeAward (NUNCA badge como modelo Prisma)
- AttendanceRecord (NUNCA Attendance como modelo)
- roleCode para filtrar roles (NUNCA where: { role: 'RH' })
```

---

## FASE 1 — ESLINT + PRETTIER

### PASSO 1.1 — Instalar dependências

```powershell
npm install --save-dev `
  prettier `
  eslint-config-prettier `
  eslint-plugin-prettier `
  @typescript-eslint/eslint-plugin `
  @typescript-eslint/parser `
  eslint-plugin-import `
  eslint-plugin-unused-imports
```

---

### PASSO 1.2 — Criar `.prettierrc`

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

---

### PASSO 1.3 — Criar `.prettierignore`

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

---

### PASSO 1.4 — Criar/Actualizar `.eslintrc.js`

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
    'unused-imports',
    'import',
  ],
  extends: [
    'plugin:@typescript-eslint/recommended',
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
  ],
  rules: {
    // TypeScript
    '@typescript-eslint/interface-name-prefix': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': 'off',

    // Imports não utilizados — detecta código morto
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

    // Prettier
    'prettier/prettier': [
      'error',
      {
        endOfLine: 'auto',
      },
    ],

    // Boas práticas
    'no-console': 'warn',
    'no-duplicate-imports': 'error',
  },
};
```

---

### PASSO 1.5 — Adicionar scripts ao `package.json`

Cola na secção `scripts`:

```json
"lint": "eslint \"{src,apps,libs,test}/**/*.ts\" --fix",
"lint:check": "eslint \"{src,apps,libs,test}/**/*.ts\"",
"format": "prettier --write \"src/**/*.ts\"",
"format:check": "prettier --check \"src/**/*.ts\""
```

---

### PASSO 1.6 — Testar ESLint e Prettier

```powershell
# Verifica erros sem corrigir
npm run lint:check

# Corrige automaticamente
npm run lint

# Formata o código
npm run format
```

---

## FASE 2 — HUSKY + LINT-STAGED

### PASSO 2.1 — Instalar dependências

```powershell
npm install --save-dev husky lint-staged
npx husky install
```

---

### PASSO 2.2 — Adicionar ao `package.json`

Cola após a secção `scripts`:

```json
"lint-staged": {
  "src/**/*.ts": [
    "eslint --fix",
    "prettier --write"
  ]
},
"husky": {
  "hooks": {
    "pre-commit": "lint-staged",
    "pre-push": "npm run lint:check"
  }
}
```

---

### PASSO 2.3 — Criar `.husky/pre-commit`

```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

echo "🔍 A verificar qualidade do código antes do commit..."
npx lint-staged
echo "✅ Verificação concluída"
```

---

### PASSO 2.4 — Criar `.husky/pre-push`

```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

echo "🔍 A verificar lint antes do push..."
npm run lint:check
echo "✅ Push autorizado"
```

---

### PASSO 2.5 — Dar permissões aos hooks

```powershell
git config core.hooksPath .husky
npx husky install
```

---

## FASE 3 — SONARQUBE

### Opção A — SonarCloud (recomendado — grátis, sem instalação)

#### PASSO 3A.1 — Criar conta no SonarCloud

```
1. Vai a: https://sonarcloud.io
2. Clica "Log in with GitHub"
3. Autoriza o acesso ao repositório
4. Clica "+" → "Analyze new project"
5. Selecciona: evoslda2025-prog/innova-backend
6. Clica "Set Up"
7. Escolhe: "With GitHub Actions" ou "Manually"
8. Copia o SONAR_TOKEN que aparece
```

---

#### PASSO 3A.2 — Criar `sonar-project.properties`

```properties
# sonar-project.properties
# Configuração SonarCloud para INNOVA

sonar.projectKey=evoslda2025-prog_innova-backend
sonar.organization=evoslda2025-prog
sonar.projectName=INNOVA Backend
sonar.projectVersion=1.0

# Código fonte
sonar.sources=src
sonar.exclusions=**/*.spec.ts,**/*.e2e-spec.ts,**/node_modules/**,**/dist/**,**/load-tests/**,**/bruno/**,**/prisma/migrations/**

# Testes
sonar.tests=src
sonar.test.inclusions=**/*.spec.ts

# Cobertura de código
sonar.javascript.lcov.reportPaths=coverage/lcov.info
sonar.typescript.lcov.reportPaths=coverage/lcov.info

# Encoding
sonar.sourceEncoding=UTF-8

# Linguagem
sonar.language=ts

# Duplicação — limites profissionais
sonar.cpd.exclusions=**/*.dto.ts,**/*.entity.ts,**/*.module.ts
```

---

#### PASSO 3A.3 — Instalar o Sonar Scanner

```powershell
npm install --save-dev sonarqube-scanner
```

---

#### PASSO 3A.4 — Adicionar scripts ao `package.json`

```json
"sonar": "sonar-scanner",
"sonar:local": "sonar-scanner -Dsonar.host.url=http://localhost:9000"
```

---

#### PASSO 3A.5 — Correr análise SonarCloud

```powershell
# Define o token (obtido no PASSO 3A.1)
$env:SONAR_TOKEN="SEU_TOKEN_AQUI"

# Corre a análise
npm run sonar
```

Abre no browser:
```
https://sonarcloud.io/project/overview?id=evoslda2025-prog_innova-backend
```

---

### Opção B — SonarQube Local via Docker

#### PASSO 3B.1 — Criar `docker-compose.sonar.yml`

```yaml
# docker-compose.sonar.yml
version: "3.8"

services:
  sonarqube:
    image: sonarqube:community
    container_name: innova-sonarqube
    ports:
      - "9000:9000"
    environment:
      - SONAR_ES_BOOTSTRAP_CHECKS_DISABLE=true
    volumes:
      - sonarqube_data:/opt/sonarqube/data
      - sonarqube_logs:/opt/sonarqube/logs
      - sonarqube_extensions:/opt/sonarqube/extensions
    restart: unless-stopped

volumes:
  sonarqube_data:
  sonarqube_logs:
  sonarqube_extensions:
```

---

#### PASSO 3B.2 — Iniciar SonarQube local

```powershell
# Inicia o SonarQube (precisa do Docker Desktop instalado)
docker-compose -f docker-compose.sonar.yml up -d

# Aguarda 2 minutos e abre no browser:
# http://localhost:9000
# Login: admin / admin
# (muda a password no primeiro login)
```

---

#### PASSO 3B.3 — Configurar projecto no SonarQube local

```
1. Abre http://localhost:9000
2. Login: admin
3. Clica "Create Project" → "Manually"
4. Project key: innova-backend
5. Display name: INNOVA Backend
6. Clica "Set Up"
7. Gera um token → copia
```

---

#### PASSO 3B.4 — Correr análise local

```powershell
$env:SONAR_TOKEN="TOKEN_DO_SONARQUBE_LOCAL"
npm run sonar:local
```

---

## FASE 4 — COBERTURA DE CÓDIGO PARA SONARQUBE

### PASSO 4.1 — Configurar Jest para gerar relatório de cobertura

Adiciona ao `package.json` na secção `jest` (ou cria):

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
    "!**/*.entity.ts"
  ],
  "coverageDirectory": "../coverage",
  "coverageReporters": ["text", "lcov", "html"],
  "testEnvironment": "node"
}
```

---

### PASSO 4.2 — Adicionar script de cobertura

```json
"test:coverage": "jest --coverage --forceExit",
"test:coverage:watch": "jest --coverage --watch"
```

---

### PASSO 4.3 — Gerar relatório de cobertura

```powershell
npm run test:coverage
```

Resultado esperado:
```
----------|---------|----------|---------|---------|
File      | % Stmts | % Branch | % Funcs | % Lines |
----------|---------|----------|---------|---------|
All files |   XX.X  |   XX.X   |   XX.X  |   XX.X  |
----------|---------|----------|---------|---------|

Coverage directory: coverage/
```

O ficheiro `coverage/lcov.info` é enviado para o SonarQube automaticamente.

---

## FASE 5 — MÉTRICAS E THRESHOLDS PROFISSIONAIS

### O que o SonarQube vai analisar

```
Security Hotspots   → vulnerabilidades de segurança
Bugs                → erros que podem causar falhas
Code Smells         → más práticas de código
Duplications        → código copiado e colado
Coverage            → % do código testado
Complexity          → funções demasiado complexas
```

### Thresholds recomendados para INNOVA

```
Coverage mínima       → 70%
Duplicações máximas   → 3%
Bugs                  → 0 bloqueadores
Vulnerabilidades      → 0 críticas
Code Smells           → menos de 5 por ficheiro
Complexidade ciclom.  → menos de 15 por função
```

---

## FASE 6 — INTEGRAÇÃO COM GITHUB ACTIONS (CI/CD)

### PASSO 6.1 — Criar `.github/workflows/quality.yml`

```yaml
# .github/workflows/quality.yml
name: Code Quality

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  quality:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout código
        uses: actions/checkout@v3
        with:
          fetch-depth: 0

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
          cache: 'npm'

      - name: Instalar dependências
        run: npm ci

      - name: Verificar lint
        run: npm run lint:check

      - name: Verificar formatação
        run: npm run format:check

      - name: Build
        run: npm run build

      - name: Cobertura de código
        run: npm run test:coverage

      - name: Análise SonarCloud
        uses: SonarSource/sonarcloud-github-action@master
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
```

---

### PASSO 6.2 — Adicionar SONAR_TOKEN ao GitHub

```
1. Vai a: github.com/evoslda2025-prog/innova-backend
2. Settings → Secrets and variables → Actions
3. Clica "New repository secret"
4. Name: SONAR_TOKEN
5. Value: [token do SonarCloud]
6. Clica "Add secret"
```

---

## ORDEM DE EXECUÇÃO COMPLETA

```powershell
# FASE 1 — ESLint + Prettier
npm install --save-dev prettier eslint-config-prettier eslint-plugin-prettier
# Cria .prettierrc e .prettierignore e .eslintrc.js
npm run lint:check     # verifica erros
npm run lint           # corrige automaticamente
npm run format         # formata o código

# FASE 2 — Husky
npm install --save-dev husky lint-staged
npx husky install
# Cria .husky/pre-commit e .husky/pre-push

# FASE 3 — SonarCloud
# Cria conta em sonarcloud.io
npm install --save-dev sonarqube-scanner
# Cria sonar-project.properties
$env:SONAR_TOKEN="SEU_TOKEN"
npm run sonar

# FASE 4 — Cobertura
npm run test:coverage
# Abre coverage/index.html no browser

# FASE 5 — GitHub Actions
# Cria .github/workflows/quality.yml
# Adiciona SONAR_TOKEN ao GitHub Secrets

# COMMIT FINAL
git add -A
git commit -m "chore: add code quality tools - eslint prettier husky sonarqube" --no-verify
git push origin main
```

---

## RESULTADO ESPERADO NO SONARQUBE

```
✅ Quality Gate: PASSED
   Bugs:              0
   Vulnerabilities:   0
   Security Hotspots: A revisar
   Code Smells:       X (a reduzir ao longo do tempo)
   Coverage:          XX%
   Duplications:      X%
```

---

## INSTRUÇÕES PARA O CLAUDE CODE

Cola isto no Claude Code:

```
Lê o ficheiro CODE-QUALITY-GUIDE.md que está 
na raiz do projecto e executa todas as fases 
por ordem.

Começa pela FASE 1 — ESLint + Prettier.
Após cada fase confirma que o build passa
antes de avançar para a seguinte.

Regras obrigatórias do INNOVA durante as correcções:
- fullName (não name) no modelo User
- entity (não entityType) no AuditLog
- textContent (não content) nas Lesson
- courseId_userId compound key no Enrollment
- legacyPdi (não pdi como modelo)
- badgeAward (não badge como modelo)
- NotificationLog.metadata → JSON.stringify()

No final faz commit:
git commit -m "chore: add code quality - eslint prettier husky sonarqube" --no-verify
git push origin main
```

---

*INNOVA — Code Quality Guide*
*Versão: 1.0 | ESLint + Prettier + Husky + SonarQube*
*Complemento ao CLAUDE.md, BRUNO-API-TESTING.md e Artillery Load Tests*
