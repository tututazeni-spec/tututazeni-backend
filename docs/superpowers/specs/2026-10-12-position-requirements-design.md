# Requisitos por Cargo + Qualificações do Colaborador — Design

Data: 2026-10-12 · Módulo: Career (Simulador de Carreira) + Departments (Cargos) + Users (Perfil)

## 1. Objectivo

Permitir configurar, para cada cargo (`Position`), requisitos estruturados em seis categorias, registar no perfil do colaborador os dados correspondentes, e fazer o Simulador de Carreira avaliar o colaborador contra esses requisitos.

| Categoria | Origem |
|---|---|
| Habilitações académicas | novo `PositionRequirement` (ACADEMIC) |
| Experiência profissional | novo `PositionRequirement` (EXPERIENCE) |
| Competências técnicas (hard) | `PositionCompetency` existente |
| Competências comportamentais (soft) | `PositionCompetency` existente |
| Idiomas | novo `PositionRequirement` (LANGUAGE) |
| Certificações e licenças | novo `PositionRequirement` (CERTIFICATION) |

## 2. Âmbito e pressupostos

- Alvo: modelo `Position` (o usado por `simulateNextRole`). `CareerRole` e `CareerPosition` ficam fora.
- Camada 1 (requisitos por cargo) e camada 2 (dados do colaborador) incluídas.
- Campos de texto antigos (`requirements`, `requiredTraining`, `requiredExperience`) mantêm-se, sem migração de dados.
- Escala de idiomas: A1<A2<B1<B2<C1<C2 (rótulos PT; "Fluente" ≥ C1).
- Escala académica: TECNICO<BACHARELATO<LICENCIATURA<POS_GRADUACAO<MESTRADO<DOUTORAMENTO.
- Fora de âmbito: SAML/importação de CVs, validação documental de certificados, migrar os campos de texto antigos.

## 3. Modelo de dados (migration manual: `migrate diff` + `migrate deploy`)

```prisma
enum RequirementCategory { ACADEMIC EXPERIENCE LANGUAGE CERTIFICATION }

model PositionRequirement {
  id         Int                 @id @default(autoincrement())
  positionId Int
  category   RequirementCategory
  title      String              // curso / idioma / certificação
  level      String?             // enum-string da escala (académica ou CEFR)
  minYears   Float?              // EXPERIENCE
  mandatory  Boolean             @default(true)
  notes      String?             @db.Text
  createdAt  DateTime            @default(now())
  position   Position            @relation(fields: [positionId], references: [id], onDelete: Cascade)
  @@index([positionId, category])
}

model UserQualification {   // userId, degree(enum escala), course, institution, year?
model UserLanguage {        // userId, language, level(CEFR), @@unique([userId, language])
model UserExternalCertification { // userId, name, issuer?, issuedAt?, expiresAt?
// User.priorExperienceYears Float? @default(0)
```

`Position` ganha `requirementItems PositionRequirement[]`; `User` ganha as três relações. `onDelete: Cascade` nos modelos de perfil.

## 4. Backend

- **Requisitos do cargo**: `GET/POST /career/positions/:id/requirements`, `PUT/DELETE .../requirements/:reqId`. Roles: ADMIN, RH, GESTOR (escrita); leitura para autenticados.
- **Perfil**: `GET/POST/PUT/DELETE /users/:id/qualifications|languages|certifications`. Dono gere os seus; RH/ADMIN qualquer um. Cada método chama `assertCanAccess`/`isPrivileged` antes de ler/escrever (lacunas IDOR históricas).
- **DTOs** com `class-validator`; `@EmptyStringToUndefined()` onde aplicável; ValidationPipe com `forbidNonWhitelisted` (cuidado com DTOs duplicados).
- **`simulateNextRole`** devolve adicionalmente `requirementChecks[]`: `{ requirementId, category, title, mandatory, status: MET|NOT_MET|NO_DATA, required, actual }`.
  - ACADEMIC: maior grau do colaborador vs. escala.
  - EXPERIENCE: `priorExperienceYears` + anos desde `hireDate` vs. `minYears`.
  - LANGUAGE: nível do idioma (match por nome normalizado) vs. escala CEFR.
  - CERTIFICATION: match por nome normalizado em `UserExternalCertification` não expiradas e `Certificate` da plataforma não revogadas/expiradas.
  - `NO_DATA` quando o colaborador não tem qualquer registo da categoria.
- **Score**: `readinessScore` = (competências cumpridas + requisitos obrigatórios MET) / (competências + requisitos obrigatórios com dados). Diferenciais e `NO_DATA` não baixam a nota; contados em `summary.optionalMet/optionalTotal/noData`. Formato existente preservado (campos só acrescentados).
- Lógica de comparação isolada em ficheiro puro (`position-requirements.evaluator.ts`) para teste unitário.

## 5. Frontend (repo `frontend/`)

- `PositionRequirementsTab` no detalhe/edição do cargo (`components/departments/`): seis secções, adicionar/editar/remover, toggle obrigatório/diferencial. Competências reutilizam o editor existente se houver; caso contrário, lista com nível e prioridade.
- Separador "Qualificações" no perfil do colaborador: habilitações, idiomas, certificações externas, anos de experiência anterior.
- Simulador de Carreira: painel "Requisitos do cargo" com estado por requisito e destaque do que falta.
- Seguir o design system existente (`components/ui/`); `useApiMutation`/toasts conforme convenção; sem `any`.

## 6. Testes

- Unitários do evaluator: escalas, `NO_DATA`, expiração, diferenciais fora do score.
- Serviços: autorização (dono vs. outro utilizador vs. RH).
- Integração contra Postgres real (`test/integration/*.integration-spec.ts`): CRUD de requisitos e perfil, `simulateNextRole` ponta a ponta; `afterAll` elimina filhos antes de pais.
- Frontend: vitest para o separador e o painel do simulador.
- Smoke ao vivo via curl dos novos endpoints (URL paths errados só o curl apanha).

## 7. Entrega

Commits locais Conventional Commits (BE e FE separados), `npx prettier --write` no backend, sem push/PR/CI sem pedido explícito. Verificar `npx prisma migrate status` após aplicar a migration.

## 8. Riscos

- Match por nome de idioma/certificação é textual (normalizado: minúsculas, sem acentos); pode falhar com sinónimos. Mitigação futura: catálogo.
- Drift schema↔código: confirmar campos no `schema.prisma` e cobrir com teste de integração.
- Dois processos Nest (dist obsoleto vs. watch) podem servir código antigo na porta 4000 — verificar antes do smoke.
