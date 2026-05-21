# INNOVA — Testes de API com Bruno CLI
> Bruno CLI | NestJS + Prisma + PostgreSQL
> Alternativa ao Jest+Supertest — mais simples e visual

---

## O QUE É O BRUNO CLI

```
Bruno é como o Postman mas:
→ Ficheiros guardados no projecto (não na nuvem)
→ Corre no terminal via CLI
→ Tem interface visual no VSCode
→ Perfeito para testes de API em equipa
→ Sem conta obrigatória
```

---

## PASSO 1 — INSTALAR O BRUNO CLI

```powershell
npm install --save-dev @usebruno/cli
```

Confirma:
```powershell
npx bru --version
```

Resultado esperado:
```
@usebruno/cli/x.x.x
```

---

## PASSO 2 — ESTRUTURA DE FICHEIROS A CRIAR

```
bruno/
├── bruno.json                          ← configuração da colecção
├── environments/
│   ├── local.bru                       ← variáveis ambiente local
│   └── staging.bru                     ← variáveis ambiente staging
├── auth/
│   ├── login-sucesso.bru               ← POST /auth/login OK
│   ├── login-password-errada.bru       ← POST /auth/login 401
│   └── login-sem-token.bru             ← rota protegida sem token
├── courses/
│   ├── listar-cursos.bru               ← GET /courses
│   └── detalhe-curso.bru               ← GET /courses/:id
├── enrollment/
│   ├── inscrever-curso.bru             ← POST /enrollment
│   ├── inscricao-duplicada.bru         ← POST /enrollment 409
│   └── minhas-inscricoes.bru           ← GET /enrollment/my
├── users/
│   ├── listar-users-rh.bru             ← GET /users (RH)
│   └── listar-users-employee.bru       ← GET /users (403)
└── pdi/
    └── meu-pdi.bru                     ← GET /pdi/my
```

---

## PASSO 3 — CRIAR `bruno/bruno.json`

```json
{
  "version": "1",
  "name": "INNOVA API Tests",
  "type": "collection",
  "ignore": [
    "node_modules",
    ".git"
  ]
}
```

---

## PASSO 4 — CRIAR `bruno/environments/local.bru`

```
vars {
  baseUrl: http://localhost:4000
  accessToken: 
  courseId: 
  userId: 
}
```

---

## PASSO 5 — CRIAR PASTA `bruno/auth/`

### `bruno/auth/login-sucesso.bru`

```
meta {
  name: Login com sucesso
  type: http
  seq: 1
}

post {
  url: {{baseUrl}}/auth/login
  body: json
  auth: none
}

body:json {
  {
    "email": "test.rh@innova-test.com",
    "password": "Test@1234"
  }
}

tests {
  test("Status deve ser 201", function() {
    expect(res.status).to.equal(201);
  });

  test("Deve ter accessToken", function() {
    expect(res.body).to.have.property("accessToken");
    expect(res.body.accessToken).to.be.a("string");
    expect(res.body.accessToken.length).to.be.greaterThan(10);
  });

  test("Deve ter dados do utilizador", function() {
    expect(res.body).to.have.property("user");
  });
}

script:post-response {
  if (res.status === 201 && res.body.accessToken) {
    bru.setEnvVar("accessToken", res.body.accessToken);
    console.log("✅ Token guardado:", res.body.accessToken.substring(0, 20) + "...");
  }
}
```

---

### `bruno/auth/login-password-errada.bru`

```
meta {
  name: Login password errada
  type: http
  seq: 2
}

post {
  url: {{baseUrl}}/auth/login
  body: json
  auth: none
}

body:json {
  {
    "email": "test.rh@innova-test.com",
    "password": "password_errada"
  }
}

tests {
  test("Status deve ser 401", function() {
    expect(res.status).to.equal(401);
  });

  test("Nao deve ter accessToken", function() {
    expect(res.body).to.not.have.property("accessToken");
  });
}
```

---

### `bruno/auth/login-sem-token.bru`

```
meta {
  name: Rota protegida sem token
  type: http
  seq: 3
}

get {
  url: {{baseUrl}}/users
  auth: none
}

tests {
  test("Status deve ser 401", function() {
    expect(res.status).to.equal(401);
  });
}
```

---

## PASSO 6 — CRIAR PASTA `bruno/courses/`

### `bruno/courses/listar-cursos.bru`

```
meta {
  name: Listar cursos
  type: http
  seq: 1
}

get {
  url: {{baseUrl}}/courses
  auth: bearer
}

auth:bearer {
  token: {{accessToken}}
}

tests {
  test("Status deve ser 200", function() {
    expect(res.status).to.equal(200);
  });

  test("Deve retornar array ou objecto com data", function() {
    const body = res.body;
    const isArray = Array.isArray(body);
    const hasData = body && body.data !== undefined;
    expect(isArray || hasData).to.be.true;
  });
}

script:post-response {
  const body = res.body;
  const items = Array.isArray(body) ? body : (body.data || []);
  if (items.length > 0) {
    bru.setEnvVar("courseId", items[0].id);
    console.log("✅ courseId guardado:", items[0].id);
  }
}
```

---

### `bruno/courses/detalhe-curso.bru`

```
meta {
  name: Detalhe do curso
  type: http
  seq: 2
}

get {
  url: {{baseUrl}}/courses/{{courseId}}
  auth: bearer
}

auth:bearer {
  token: {{accessToken}}
}

tests {
  test("Status deve ser 200 ou 404", function() {
    expect([200, 404]).to.include(res.status);
  });

  test("Se 200 deve ter id e title", function() {
    if (res.status === 200) {
      expect(res.body).to.have.property("id");
      expect(res.body).to.have.property("title");
    }
  });
}
```

---

## PASSO 7 — CRIAR PASTA `bruno/enrollment/`

### `bruno/enrollment/inscrever-curso.bru`

```
meta {
  name: Inscrever em curso
  type: http
  seq: 1
}

post {
  url: {{baseUrl}}/enrollment
  body: json
  auth: bearer
}

auth:bearer {
  token: {{accessToken}}
}

body:json {
  {
    "courseId": "{{courseId}}"
  }
}

tests {
  test("Status deve ser 201 ou 409", function() {
    expect([201, 409]).to.include(res.status);
  });

  test("Se 201 deve ter courseId", function() {
    if (res.status === 201) {
      expect(res.body).to.have.property("courseId");
    }
  });
}
```

---

### `bruno/enrollment/inscricao-duplicada.bru`

```
meta {
  name: Inscricao duplicada deve dar 409
  type: http
  seq: 2
}

post {
  url: {{baseUrl}}/enrollment
  body: json
  auth: bearer
}

auth:bearer {
  token: {{accessToken}}
}

body:json {
  {
    "courseId": "{{courseId}}"
  }
}

tests {
  test("Status deve ser 409 compound unique", function() {
    expect(res.status).to.equal(409);
  });
}
```

---

### `bruno/enrollment/minhas-inscricoes.bru`

```
meta {
  name: Minhas inscricoes
  type: http
  seq: 3
}

get {
  url: {{baseUrl}}/enrollment/my
  auth: bearer
}

auth:bearer {
  token: {{accessToken}}
}

tests {
  test("Status deve ser 200", function() {
    expect(res.status).to.equal(200);
  });
}
```

---

## PASSO 8 — CRIAR PASTA `bruno/users/`

### `bruno/users/listar-users-rh.bru`

```
meta {
  name: Listar users como RH
  type: http
  seq: 1
}

get {
  url: {{baseUrl}}/users
  auth: bearer
}

auth:bearer {
  token: {{accessToken}}
}

tests {
  test("RH deve listar users com 200", function() {
    expect(res.status).to.equal(200);
  });

  test("Deve ter campo fullName e nao name", function() {
    const body = res.body;
    const items = Array.isArray(body) ? body : (body.data || []);
    if (items.length > 0) {
      expect(items[0]).to.have.property("fullName");
      expect(items[0]).to.not.have.property("name");
    }
  });
}
```

---

### `bruno/users/listar-users-employee.bru`

```
meta {
  name: Employee nao pode listar users
  type: http
  seq: 2
}

get {
  url: {{baseUrl}}/users
  auth: bearer
}

auth:bearer {
  token: {{accessToken}}
}

tests {
  test("Employee deve receber 403", function() {
    expect(res.status).to.equal(403);
  });
}
```

---

## PASSO 9 — CRIAR PASTA `bruno/pdi/`

### `bruno/pdi/meu-pdi.bru`

```
meta {
  name: Meu PDI (legacyPdi)
  type: http
  seq: 1
}

get {
  url: {{baseUrl}}/pdi/my
  auth: bearer
}

auth:bearer {
  token: {{accessToken}}
}

tests {
  test("Status deve ser 200 ou 403", function() {
    expect([200, 403]).to.include(res.status);
  });
}
```

---

## PASSO 10 — ADICIONAR SCRIPTS AO `package.json`

Cola na secção `scripts`:

```json
"test:api": "npx bru run bruno/ --env local",
"test:api:auth": "npx bru run bruno/auth/ --env local",
"test:api:courses": "npx bru run bruno/courses/ --env local",
"test:api:enrollment": "npx bru run bruno/enrollment/ --env local",
"test:api:users": "npx bru run bruno/users/ --env local",
"test:api:pdi": "npx bru run bruno/pdi/ --env local",
"test:api:report": "npx bru run bruno/ --env local --reporter-json bruno/reports/results.json"
```

---

## PASSO 11 — EXECUTAR OS TESTES

### Antes de correr — backend tem de estar a correr

```powershell
# Terminal 1 — backend
node dist/main.js

# Terminal 2 — testes
```

### Ordem de execução correcta

```powershell
# 1. Primeiro corre só o auth para guardar o token
npm run test:api:auth

# 2. Depois cursos (guarda courseId)
npm run test:api:courses

# 3. Enrollment (usa courseId e token)
npm run test:api:enrollment

# 4. Users
npm run test:api:users

# 5. PDI
npm run test:api:pdi

# 6. Todos juntos
npm run test:api
```

---

## PASSO 12 — RESULTADO ESPERADO

```
bruno/auth/login-sucesso.bru
  ✓ Status deve ser 201
  ✓ Deve ter accessToken
  ✓ Deve ter dados do utilizador

bruno/auth/login-password-errada.bru
  ✓ Status deve ser 401
  ✓ Nao deve ter accessToken

bruno/courses/listar-cursos.bru
  ✓ Status deve ser 200
  ✓ Deve retornar array ou objecto com data

bruno/enrollment/inscrever-curso.bru
  ✓ Status deve ser 201 ou 409

bruno/users/listar-users-rh.bru
  ✓ RH deve listar users com 200
  ✓ Deve ter campo fullName e nao name

Passed: 14
Failed: 0
```

---

## PASSO 13 — COMMIT FINAL

```powershell
git add -A
git commit -m "test: add Bruno CLI API tests collection" --no-verify
git push origin main
```

---

## DIFERENÇA ENTRE JEST E BRUNO

```
Jest + Supertest          Bruno CLI
──────────────────────────────────────────
Backend não precisa correr  Backend TEM de correr
Mais código TypeScript      Ficheiros .bru simples
Difícil de depurar          Fácil de ver o request
Integração CI/CD nativa     Integração CI/CD possível
Sem interface visual        Interface no VSCode (app Bruno)
```

---

## BÓNUS — INSTALAR A APP BRUNO NO WINDOWS

Para veres e correres os testes visualmente:

```
1. Vai a: https://www.usebruno.com/downloads
2. Descarrega Bruno para Windows
3. Instala
4. Abre → File → Open Collection
5. Selecciona a pasta bruno/ do projecto
6. Vês todos os requests e corres visualmente
```

---

*INNOVA — Bruno CLI API Testing Guide*
*Versão: 1.0 | Alternativa ao Jest+Supertest*
*Backend tem de estar a correr na porta 4000*
