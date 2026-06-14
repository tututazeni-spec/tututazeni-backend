# INNOVA — Backend

Plataforma corporativa de **Academia Corporativa + Recursos Humanos** para ~6000 funcionários.
API construída em **NestJS + Prisma + PostgreSQL**.

> Frontend correspondente: [tututazeni-frontend](https://github.com/tututazeni-spec/tututazeni-frontend)

---

## 🧩 Áreas funcionais

- **Academia Corporativa** — cursos, lições, inscrições (enrollments), certificados, badges, percursos de aprendizagem
- **Recursos Humanos** — PDI (planos de desenvolvimento individual), presenças, notificações, audit logs, gestão de utilizadores, departamentos e cargos

## 🛠️ Stack

| Camada | Tecnologia |
|---|---|
| Framework | NestJS 11 |
| Linguagem | TypeScript |
| ORM | Prisma 7 (`@prisma/adapter-pg`) |
| Base de dados | PostgreSQL |
| Autenticação | JWT (Passport, `passport-jwt`) |
| Documentação API | Swagger (`@nestjs/swagger`) |
| Testes | Jest, Playwright (E2E), Artillery (carga), Bruno (API) |

A aplicação corre na **porta `4000`**, sem prefixo global de rotas (`/auth/login`, `/courses`, ...).

---

## 🚀 Arranque

### Pré-requisitos
- Node.js `20.x`
- PostgreSQL em execução

### Instalação

```bash
npm install            # instala dependências e gera o Prisma Client (postinstall)
```

### Configuração

Cria um ficheiro `.env` com, no mínimo, a ligação à base de dados:

```env
DATABASE_URL="postgresql://USER:PASSWORD@127.0.0.1:5432/innova_dev?schema=public"
JWT_SECRET="..."
```

### Base de dados

```bash
npm run db:deploy      # aplica as migrações
npm run db:seed        # popula dados iniciais
npm run db:studio      # abre o Prisma Studio (opcional)
```

### Executar

```bash
npm run start:dev      # modo watch (desenvolvimento)
npm run start          # build + arranque
```

---

## 🧪 Testes

```bash
npm run test                 # testes unitários (Jest)
npm run test:cov             # cobertura
npm run test:integration     # testes de integração (BD innova_test)
npm run test:db              # testes de base de dados (performance, integridade, migrações)
npm run test:e2e             # testes end-to-end (Playwright) — requer frontend a correr
```

### Testes de carga (Artillery)

```bash
npm run seed:loadtest        # gera dados e CSVs de teste de carga
npm run test:smoke           # smoke (sanidade)
npm run test:load            # carga normal (~600 utilizadores)
npm run test:stress          # stress (~3000 utilizadores)
npm run test:spike           # pico repentino
npm run test:report          # relatório HTML
```

### Testes de API (Bruno)

```bash
npm run test:api             # corre toda a coleção Bruno no ambiente local
```

---

## 📁 Estrutura

```
src/                 # código-fonte NestJS (módulos: auth, courses, users, pdi, ...)
prisma/              # schema.prisma, migrações e seeds
test/                # testes (e2e, integration, database)
load-tests/          # cenários e fases Artillery
bruno/               # coleção de testes de API
```

---

## 📝 Convenções do projeto

- Modelo `User`: usar `fullName` (nunca `name`) e `roleCode` para filtrar cargos
- `Lesson`: campo `textContent` (nunca `content`)
- `AuditLog`: campo `entity` (nunca `entityType`)
- `Enrollment`: chave composta `@@unique([courseId, userId])`

---

*Projeto privado — INNOVA.*
