# Fase A — Consolidar "concluir curso" num `CourseCompletionService` — Plano de Implementação

> **Para agentes de execução:** SUB-SKILL OBRIGATÓRIA: usar `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans` para executar este plano tarefa a tarefa. Os passos usam checkbox (`- [ ]`) para acompanhamento.

**Goal:** Existe uma única implementação de "marcar aula concluída → decidir se o curso está completo → aplicar todos os efeitos (estado, certificado, pontos, analytics, notificação)", consumida por `courses`, `course-modules` e `enrollments`, eliminando as 3 cópias divergentes actuais.

**Architecture:** Novo módulo `CourseCompletionModule` (dono do conceito "conclusão de curso" no domínio 6 — Academia) com `CourseCompletionService`, que acede directamente por Prisma às tabelas do próprio domínio (`Enrollment`, `LessonProgress`, `CourseModule`, `Lesson`, `Certificate`, `CourseAnalytics`, `UserPoints`, `Quiz`, `QuizAttempt`, `NotificationLog`). Os 3 services existentes passam a **delegar** neste serviço em vez de terem lógica própria de conclusão. Não há ciclo de módulos: `courses`/`course-modules`/`enrollments` → `course-completion` → (só Prisma). A forma de resposta HTTP dos endpoints afectados mantém-se; muda o **comportamento**: qualquer caminho de conclusão passa a emitir certificado **e** pontos **e** notificação (hoje cada caminho faz só um subconjunto).

**Tech Stack:** NestJS, Prisma, Jest (unit + integração com Postgres real via `test/jest-integration.json`), `class-validator`.

**Spec:** `docs/arquitetura-modular-analise.md` (§2.3 item 4, §2.5, §3–4 domínio 6, §5 item 1, §11 item 2, §13 fase A) e `docs/arquitetura-modular.md` (documento-fonte, Fases 3–5).

## Global Constraints

- **Não alterar o visual/contrato de resposta do frontend** (`docs/arquitetura-modular.md` §12). Os endpoints afectados mantêm rota, verbo e forma de resposta:
  - `POST /courses/lessons/:lessonId/complete` → `{ progress, courseProgress }` (adiciona campo `courseCompleted: boolean`, não remove nada).
  - `POST /course-modules/lessons/progress` → `{ progress, moduleCompleted, courseId }` (inalterado).
  - `POST /enrollments/my/:id/certificate` e `POST /enrollments/:id/certificate` → objecto `Certificate` (inalterado).
  - `PUT /enrollments/:id/status` → objecto `Enrollment` (inalterado).
  - `GET /courses/:id/progress` → forma inalterada.
  - `GET /course-modules/modules/:id/completed` → `{ completed: boolean }` (inalterado).
- **Mudança de comportamento deliberada (é o objectivo desta fase, não um efeito colateral):**
  1. Concluir um curso pelo caminho `course-modules` passa a **emitir certificado** (hoje só dá 100 pontos + notificação).
  2. Concluir um curso pelo caminho `courses` (flat, 100% das aulas) passa a **atribuir 100 pontos + notificação `COURSE_COMPLETED`** (hoje só emite certificado + notificação `CERTIFICATE_ISSUED`).
  3. `PUT /enrollments/:id/status` com `status: COMPLETED` (admin) passa a **emitir certificado + pontos + notificação + incrementar `CourseAnalytics.totalCompleted`** (hoje só muda o estado).
  4. O critério de "curso completo" passa a ser **module-aware em todos os caminhos**: se o curso tem módulos `PUBLISHED`, conta-se a conclusão dos módulos `mandatory` (ou de todos os `PUBLISHED` se nenhum estiver marcado `mandatory`), cada um pela sua `completionRule` (`ALL_LESSONS` / `MIN_PERCENT` / `QUIZ_PASS` / `COMBINED`). Só quando o curso **não tem nenhum módulo `PUBLISHED`** é que se usa a regra plana legada "100% das aulas do curso". Consequência: um curso com módulos opcionais + obrigatórios passa a poder concluir sem 100% das aulas (antes, o caminho `courses` exigia 100%). Os testes de integração desta fase fixam esse comportamento explicitamente.
- **Notificação única:** a conclusão gera **uma** notificação `COURSE_COMPLETED` (mensagem menciona o certificado). Deixa de existir a notificação separada `CERTIFICATE_ISSUED` na conclusão automática. A geração **manual** de certificado (`POST /enrollments/.../certificate`) sobre um curso já concluído continua a devolver o certificado existente sem notificar de novo (idempotente).
- **Idempotência:** `Certificate.enrollmentId` é `@unique` (`prisma/schema.prisma:1995`). O código apanha `Prisma.PrismaClientKnownRequestError` com `code === 'P2002'` e devolve o certificado existente. `finalizeCompletion` é no-op se `enrollment.status === 'COMPLETED'`.
- **Ownership:** `issueCertificateFor` mantém `assertCanAccess(enrollment, enrollment.userId, user, [Role.ADMIN, Role.RH])` — a verificação que `enrollments.generateCertificate` já fazia via `findOne(enrollmentId, user)` (A10-16).
- `prisma`/`queue`/`cache` são `@Global()` (`src/prisma/prisma.module.ts:4`) — o novo módulo não precisa de os importar; os 3 módulos consumidores só precisam de adicionar `CourseCompletionModule` a `imports`.
- **Eventos de domínio ficam fora do âmbito desta fase.** Existe um listener `@OnEvent('course.completed')` em `src/scalability/scalability.events.ts:57` que hoje nada dispara; ligá-lo exige mover `EventEmitterModule.forRoot()` de `scalability.module.ts` para global — trabalho da Fase §9 do roteiro, não desta. Anotar como follow-up, não implementar.
- `prettier`/`eslint`/`tsc` limpos antes de cada commit. `format:check` do CI corre só `prettier --check "src/**/*.ts"` (`package.json:34`) — **não** correr prettier em `prisma/**` nem noutros paths fora de `src/**` (expande arrays hand-written e polui o diff). Lint com `--config eslint.config.staged.mjs` quando necessário (per `CLAUDE.md`).
- Suite de integração corre em lotes (`node scripts/run-integration-batched.js`) contra `postgresql://postgres:postgres@127.0.0.1:5432/innova_test`, `--runInBand`, com Redis local a correr e `DB_POOL_MAX=5` em `.env.test` (memória de projecto "innova integration test infra"). `courses`, `course-modules` e `enrollments` são lotes distintos.

---

## File Structure

**Novos:**
- `src/course-completion/course-completion.module.ts` — módulo, exporta `CourseCompletionService`.
- `src/course-completion/course-completion.service.ts` — toda a lógica de conclusão. Responsabilidade única: dado um `enrollmentId` (ou `userId`+`lessonId`), decidir e aplicar a conclusão de curso.
- `src/course-completion/course-completion.service.spec.ts` — unit tests (mock `PrismaService`).

**Modificados:**
- `src/courses/courses.module.ts` — `imports: [CourseCompletionModule]`.
- `src/courses/courses.service.ts` — `markLessonComplete` e `getCourseProgress` delegam; remover `calculateCourseProgress`, `completeCourse`, `issueCertificate` (privados).
- `src/courses/courses.service.spec.ts`, `src/courses/courses.service.progress.spec.ts` — adaptar ao novo provider + delegação.
- `src/course-modules/course-modules.module.ts` — `imports: [CourseCompletionModule]`.
- `src/course-modules/course-modules.service.ts` — `markLessonComplete` delega (mantendo `isLessonAccessible` + `notifyNextModuleUnlock`); `isModuleCompleted` passa a delegar; remover `checkAndCompleteCourse`.
- `src/course-modules/course-modules.service.spec.ts`, `src/course-modules/course-modules.service.progress.spec.ts` — adaptar.
- `src/enrollments/enrollments.module.ts` — `imports: [CourseCompletionModule]`.
- `src/enrollments/enrollments.service.ts` — `generateCertificate` delega; `updateStatus` ramo `COMPLETED` chama `finalizeCompletion`.
- `src/enrollments/enrollments.service.spec.ts`, `src/enrollments/enrollments.service.additional.spec.ts` — adaptar.
- `test/integration/courses/courses.integration-spec.ts`, `test/integration/course-modules/course-modules.integration-spec.ts`, `test/integration/enrollments/enrollments.integration-spec.ts` — novos testes que fixam o comportamento unificado.
- `docs/arquitetura-modular-analise.md` — marcar Fase A concluída (§13) e o item 1 de §5.

---

### Task 1: Scaffold do `CourseCompletionModule` + esqueleto do serviço

**Files:**
- Create: `src/course-completion/course-completion.module.ts`
- Create: `src/course-completion/course-completion.service.ts`
- Create: `src/course-completion/course-completion.service.spec.ts`

**Interfaces:**
- Produces: `CourseCompletionService` (provider exportado por `CourseCompletionModule`). Nesta tarefa só o construtor (`constructor(private prisma: PrismaService) {}`) + `private readonly logger = new Logger(CourseCompletionService.name)`. Os métodos públicos entram nas tarefas 2–5.

- [ ] **Step 1: Criar o módulo**

`src/course-completion/course-completion.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { CourseCompletionService } from './course-completion.service';

@Module({
  providers: [CourseCompletionService],
  exports: [CourseCompletionService],
})
export class CourseCompletionModule {}
```

- [ ] **Step 2: Criar o esqueleto do serviço**

`src/course-completion/course-completion.service.ts`:

```ts
import { Injectable, Logger, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { CertificateType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { createNotificationSafe } from '../common/helpers/notification.helper';
import { assertCanAccess } from '../common/helpers/ownership.helper';
import { Role } from '../common/enums/role.enum';
import { CurrentUserData } from '../common/decorators/current-user.decorator';

/** Entrada mínima de progresso de aula — os controllers mantêm os seus próprios DTOs validados. */
export interface MarkLessonProgressInput {
  watchedSeconds?: number;
  resumePosition?: number;
}

@Injectable()
export class CourseCompletionService {
  private readonly logger = new Logger(CourseCompletionService.name);

  constructor(private prisma: PrismaService) {}
}
```

> Antes de escrever os imports, confirmar os paths reais: `grep -rn "assertCanAccess" src/enrollments/enrollments.service.ts` (mostra o import exacto a copiar), idem para `Role` e `CurrentUserData`. Ajustar se divergirem do acima.

- [ ] **Step 3: Escrever o teste de scaffolding**

`src/course-completion/course-completion.service.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { CourseCompletionService } from './course-completion.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  enrollment: { findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
  read: {
    courseModule: { findMany: jest.fn(), findUnique: jest.fn() },
    lesson: { count: jest.fn(), findUnique: jest.fn() },
    lessonProgress: { count: jest.fn() },
    quiz: { findFirst: jest.fn() },
    quizAttempt: { findFirst: jest.fn() },
  },
  lessonProgress: { upsert: jest.fn() },
  courseModule: { findUnique: jest.fn() },
  certificate: { findFirst: jest.fn(), create: jest.fn() },
  courseAnalytics: { updateMany: jest.fn() },
  userPoints: { upsert: jest.fn() },
  notificationLog: { create: jest.fn() },
};

describe('CourseCompletionService', () => {
  let service: CourseCompletionService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        CourseCompletionService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = moduleRef.get(CourseCompletionService);
  });

  it('está definido', () => {
    expect(service).toBeDefined();
  });
});
```

- [ ] **Step 4: Correr o teste**

```bash
npx jest src/course-completion/course-completion.service.spec.ts
```

Esperado: PASS (1 teste).

- [ ] **Step 5: `tsc` limpo**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add src/course-completion/
git commit -m "feat(course-completion): scaffold do CourseCompletionModule + serviço vazio"
```

---

### Task 2: `evaluateCompletion` + `isModuleCompleted` (a regra única de "curso completo")

**Files:**
- Modify: `src/course-completion/course-completion.service.ts`
- Test: `src/course-completion/course-completion.service.spec.ts`

**Interfaces:**
- Produces:
  - `isModuleCompleted(moduleId: number, userId: number): Promise<boolean>` — lógica movida verbatim de `course-modules.service.ts` (respeita `completionRule` ALL_LESSONS/MIN_PERCENT/QUIZ_PASS/COMBINED + `minCompletionPercent`).
  - `evaluateCompletion(enrollmentId: number): Promise<{ complete: boolean; reason: string }>` — module-aware, com fallback plano quando não há módulos `PUBLISHED`.
- Consumes: nada de tarefas anteriores além do esqueleto.

- [ ] **Step 1: Escrever os testes (devem falhar)**

Adicionar ao `describe('CourseCompletionService', ...)`:

```ts
  describe('isModuleCompleted', () => {
    it('ALL_LESSONS: true só quando todas as aulas estão concluídas', async () => {
      mockPrisma.read.courseModule.findUnique.mockResolvedValue({
        id: 5, completionRule: 'ALL_LESSONS', minCompletionPercent: null,
        lessons: [{ id: 1 }, { id: 2 }, { id: 3 }],
      });
      mockPrisma.read.lessonProgress.count.mockResolvedValue(2);
      expect(await service.isModuleCompleted(5, 10)).toBe(false);
      mockPrisma.read.lessonProgress.count.mockResolvedValue(3);
      expect(await service.isModuleCompleted(5, 10)).toBe(true);
    });

    it('módulo sem aulas → true (nada a completar)', async () => {
      mockPrisma.read.courseModule.findUnique.mockResolvedValue({ id: 6, completionRule: 'ALL_LESSONS', lessons: [] });
      expect(await service.isModuleCompleted(6, 10)).toBe(true);
    });

    it('MIN_PERCENT: usa minCompletionPercent', async () => {
      mockPrisma.read.courseModule.findUnique.mockResolvedValue({
        id: 7, completionRule: 'MIN_PERCENT', minCompletionPercent: 50,
        lessons: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }],
      });
      mockPrisma.read.lessonProgress.count.mockResolvedValue(2);
      expect(await service.isModuleCompleted(7, 10)).toBe(true);
    });

    it('módulo inexistente → false', async () => {
      mockPrisma.read.courseModule.findUnique.mockResolvedValue(null);
      expect(await service.isModuleCompleted(999, 10)).toBe(false);
    });
  });

  describe('evaluateCompletion', () => {
    it('sem módulos PUBLISHED → fallback plano: 100% das aulas do curso', async () => {
      mockPrisma.enrollment.findUnique.mockResolvedValue({ id: 1, userId: 10, courseId: 20, status: 'IN_PROGRESS' });
      mockPrisma.read.courseModule.findMany.mockResolvedValue([]);
      mockPrisma.read.lesson.count.mockResolvedValue(4);
      mockPrisma.read.lessonProgress.count.mockResolvedValue(3);
      expect(await service.evaluateCompletion(1)).toEqual({ complete: false, reason: 'all-lessons' });
      mockPrisma.read.lessonProgress.count.mockResolvedValue(4);
      expect(await service.evaluateCompletion(1)).toEqual({ complete: true, reason: 'all-lessons' });
    });

    it('curso vazio (0 aulas, 0 módulos) → nunca completo', async () => {
      mockPrisma.enrollment.findUnique.mockResolvedValue({ id: 1, userId: 10, courseId: 20, status: 'IN_PROGRESS' });
      mockPrisma.read.courseModule.findMany.mockResolvedValue([]);
      mockPrisma.read.lesson.count.mockResolvedValue(0);
      mockPrisma.read.lessonProgress.count.mockResolvedValue(0);
      expect(await service.evaluateCompletion(1)).toEqual({ complete: false, reason: 'empty-course' });
    });

    it('com módulos mandatory → só conta os mandatory', async () => {
      mockPrisma.enrollment.findUnique.mockResolvedValue({ id: 1, userId: 10, courseId: 20, status: 'IN_PROGRESS' });
      mockPrisma.read.courseModule.findMany.mockResolvedValue([
        { id: 100, mandatory: true }, { id: 101, mandatory: true }, { id: 102, mandatory: false },
      ]);
      const spy = jest.spyOn(service, 'isModuleCompleted').mockImplementation(async (id) => id === 100 || id === 101);
      expect(await service.evaluateCompletion(1)).toEqual({ complete: true, reason: 'mandatory-modules' });
      expect(spy).toHaveBeenCalledWith(100, 10);
      expect(spy).toHaveBeenCalledWith(101, 10);
      expect(spy).not.toHaveBeenCalledWith(102, 10);
    });

    it('sem módulos mandatory → conta todos os PUBLISHED', async () => {
      mockPrisma.enrollment.findUnique.mockResolvedValue({ id: 1, userId: 10, courseId: 20, status: 'IN_PROGRESS' });
      mockPrisma.read.courseModule.findMany.mockResolvedValue([{ id: 100, mandatory: false }, { id: 101, mandatory: false }]);
      jest.spyOn(service, 'isModuleCompleted').mockImplementation(async (id) => id === 100);
      expect(await service.evaluateCompletion(1)).toEqual({ complete: false, reason: 'module-101-incomplete' });
    });

    it('matrícula inexistente → não completo', async () => {
      mockPrisma.enrollment.findUnique.mockResolvedValue(null);
      expect(await service.evaluateCompletion(999)).toEqual({ complete: false, reason: 'no-enrollment' });
    });
  });
```

- [ ] **Step 2: Correr e confirmar FAIL**

```bash
npx jest src/course-completion/course-completion.service.spec.ts -t "isModuleCompleted|evaluateCompletion"
```

Esperado: FAIL — métodos não existem.

- [ ] **Step 3: Implementar**

Adicionar ao `CourseCompletionService` (copiar a lógica de `isModuleCompleted` de `src/course-modules/course-modules.service.ts` — abrir esse ficheiro e transcrever o corpo do método actual, mudando só `this.prisma` → `this.prisma`, que é igual):

```ts
  async isModuleCompleted(moduleId: number, userId: number): Promise<boolean> {
    const mod = await this.prisma.read.courseModule.findUnique({
      where: { id: moduleId },
      include: { lessons: true },
    });
    if (!mod) return false;

    const lessons = mod.lessons;
    const totalLessons = lessons.length;
    if (totalLessons === 0) return true;

    const completedCount = await this.prisma.read.lessonProgress.count({
      where: { userId, completed: true, lessonId: { in: lessons.map(l => l.id) } },
    });

    const rule = mod.completionRule ?? 'ALL_LESSONS';

    if (rule === 'ALL_LESSONS') {
      return completedCount >= totalLessons;
    }
    if (rule === 'MIN_PERCENT') {
      const pct = mod.minCompletionPercent ?? 100;
      return (completedCount / totalLessons) * 100 >= pct;
    }
    if (rule === 'QUIZ_PASS') {
      const quiz = await this.prisma.read.quiz.findFirst({ where: { lesson: { moduleId } } });
      if (!quiz) return completedCount >= totalLessons;
      const passed = await this.prisma.read.quizAttempt.findFirst({
        where: { quizId: quiz.id, userId, passed: true },
      });
      return !!passed;
    }
    if (rule === 'COMBINED') {
      const pct = mod.minCompletionPercent ?? 80;
      const lessonOk = (completedCount / totalLessons) * 100 >= pct;
      const quiz = await this.prisma.read.quiz.findFirst({ where: { lesson: { moduleId } } });
      const quizOk = quiz
        ? !!(await this.prisma.read.quizAttempt.findFirst({ where: { quizId: quiz.id, userId, passed: true } }))
        : true;
      return lessonOk && quizOk;
    }
    return false;
  }

  async evaluateCompletion(enrollmentId: number): Promise<{ complete: boolean; reason: string }> {
    const enrollment = await this.prisma.enrollment.findUnique({ where: { id: enrollmentId } });
    if (!enrollment) return { complete: false, reason: 'no-enrollment' };

    const publishedModules = await this.prisma.read.courseModule.findMany({
      where: { courseId: enrollment.courseId, status: 'PUBLISHED' },
      select: { id: true, mandatory: true },
    });

    if (publishedModules.length === 0) {
      const [total, done] = await Promise.all([
        this.prisma.read.lesson.count({ where: { module: { courseId: enrollment.courseId } } }),
        this.prisma.read.lessonProgress.count({
          where: {
            userId: enrollment.userId,
            completed: true,
            lesson: { module: { courseId: enrollment.courseId } },
          },
        }),
      ]);
      if (total === 0) return { complete: false, reason: 'empty-course' };
      return { complete: done >= total, reason: 'all-lessons' };
    }

    const mandatory = publishedModules.filter(m => m.mandatory);
    const toCheck = mandatory.length > 0 ? mandatory : publishedModules;

    for (const mod of toCheck) {
      if (!(await this.isModuleCompleted(mod.id, enrollment.userId))) {
        return { complete: false, reason: `module-${mod.id}-incomplete` };
      }
    }
    return { complete: true, reason: mandatory.length > 0 ? 'mandatory-modules' : 'all-modules' };
  }
```

- [ ] **Step 4: Correr e confirmar PASS**

```bash
npx jest src/course-completion/course-completion.service.spec.ts
```

- [ ] **Step 5: prettier + tsc**

```bash
npx prettier --write src/course-completion/
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add src/course-completion/
git commit -m "feat(course-completion): evaluateCompletion module-aware + isModuleCompleted (regra única de conclusão)"
```

---

### Task 3: `finalizeCompletion` — bloco único de efeitos secundários (idempotente)

**Files:**
- Modify: `src/course-completion/course-completion.service.ts`
- Test: `src/course-completion/course-completion.service.spec.ts`

**Interfaces:**
- Produces:
  - `finalizeCompletion(enrollmentId: number): Promise<{ finalized: boolean }>` — se `enrollment.status !== 'COMPLETED'`: marca `COMPLETED`+`completedAt`, `CourseAnalytics.totalCompleted++`, emite certificado (idempotente), atribui 100 `UserPoints`, cria **uma** notificação `COURSE_COMPLETED`. Devolve `{ finalized: true }`. Se já estava `COMPLETED` (ou matrícula inexistente): `{ finalized: false }`, sem efeitos.
  - `private issueCertificateInternal(enrollment)` — cria `Certificate` (`type: COURSE`), devolve o existente em `P2002`.
  - `private awardCompletionPoints(userId)` — `userPoints.upsert` (+100), nunca lança.
- Consumes: nada.

- [ ] **Step 1: Escrever os testes (devem falhar)**

```ts
  describe('finalizeCompletion', () => {
    const baseEnrollment = {
      id: 1, userId: 10, courseId: 20, status: 'IN_PROGRESS',
      course: { id: 20, title: 'Curso X', certificateValidityDays: null },
    };

    it('primeira chamada aplica os 5 efeitos e devolve finalized:true', async () => {
      mockPrisma.enrollment.findUnique.mockResolvedValue({ ...baseEnrollment });
      mockPrisma.certificate.findFirst.mockResolvedValue(null);
      mockPrisma.certificate.create.mockResolvedValue({ id: 500, enrollmentId: 1 });
      mockPrisma.userPoints.upsert.mockResolvedValue({});
      mockPrisma.notificationLog.create.mockResolvedValue({});

      const res = await service.finalizeCompletion(1);

      expect(res).toEqual({ finalized: true });
      expect(mockPrisma.enrollment.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { status: 'COMPLETED', completedAt: expect.any(Date) },
      });
      expect(mockPrisma.courseAnalytics.updateMany).toHaveBeenCalledWith({
        where: { courseId: 20 },
        data: { totalCompleted: { increment: 1 } },
      });
      expect(mockPrisma.certificate.create).toHaveBeenCalled();
      expect(mockPrisma.userPoints.upsert).toHaveBeenCalledWith({
        where: { userId: 10 },
        create: { userId: 10, points: 100 },
        update: { points: { increment: 100 } },
      });
      expect(mockPrisma.notificationLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: 'COURSE_COMPLETED', userId: 10 }) }),
      );
    });

    it('idempotente: se já COMPLETED, não faz nada e devolve finalized:false', async () => {
      mockPrisma.enrollment.findUnique.mockResolvedValue({ ...baseEnrollment, status: 'COMPLETED' });
      const res = await service.finalizeCompletion(1);
      expect(res).toEqual({ finalized: false });
      expect(mockPrisma.enrollment.update).not.toHaveBeenCalled();
      expect(mockPrisma.certificate.create).not.toHaveBeenCalled();
      expect(mockPrisma.userPoints.upsert).not.toHaveBeenCalled();
    });

    it('certificado já existe → não volta a criar, mas os outros efeitos aplicam-se na mesma', async () => {
      mockPrisma.enrollment.findUnique.mockResolvedValue({ ...baseEnrollment });
      mockPrisma.certificate.findFirst.mockResolvedValue({ id: 500, enrollmentId: 1 });
      mockPrisma.userPoints.upsert.mockResolvedValue({});
      mockPrisma.notificationLog.create.mockResolvedValue({});

      await service.finalizeCompletion(1);

      expect(mockPrisma.certificate.create).not.toHaveBeenCalled();
      expect(mockPrisma.enrollment.update).toHaveBeenCalled();
      expect(mockPrisma.userPoints.upsert).toHaveBeenCalled();
    });

    it('P2002 ao criar certificado é engolido (corrida) e a conclusão prossegue', async () => {
      mockPrisma.enrollment.findUnique.mockResolvedValue({ ...baseEnrollment });
      mockPrisma.certificate.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 501, enrollmentId: 1 });
      const p2002 = Object.assign(new Error('unique'), { code: 'P2002' });
      Object.setPrototypeOf(p2002, require('@prisma/client').Prisma.PrismaClientKnownRequestError.prototype);
      mockPrisma.certificate.create.mockRejectedValue(p2002);
      mockPrisma.userPoints.upsert.mockResolvedValue({});
      mockPrisma.notificationLog.create.mockResolvedValue({});

      const res = await service.finalizeCompletion(1);
      expect(res).toEqual({ finalized: true });
    });

    it('falha ao atribuir pontos não faz a conclusão falhar', async () => {
      mockPrisma.enrollment.findUnique.mockResolvedValue({ ...baseEnrollment });
      mockPrisma.certificate.findFirst.mockResolvedValue(null);
      mockPrisma.certificate.create.mockResolvedValue({ id: 500 });
      mockPrisma.userPoints.upsert.mockRejectedValue(new Error('db down'));
      mockPrisma.notificationLog.create.mockResolvedValue({});

      const res = await service.finalizeCompletion(1);
      expect(res).toEqual({ finalized: true });
    });
  });
```

- [ ] **Step 2: Correr e confirmar FAIL**

```bash
npx jest src/course-completion/course-completion.service.spec.ts -t "finalizeCompletion"
```

- [ ] **Step 3: Implementar**

```ts
  async finalizeCompletion(enrollmentId: number): Promise<{ finalized: boolean }> {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      include: { course: { select: { id: true, title: true, certificateValidityDays: true } } },
    });
    if (!enrollment) return { finalized: false };
    if (enrollment.status === 'COMPLETED') return { finalized: false };

    await this.prisma.enrollment.update({
      where: { id: enrollmentId },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });

    await this.prisma.courseAnalytics.updateMany({
      where: { courseId: enrollment.courseId },
      data: { totalCompleted: { increment: 1 } },
    });

    await this.issueCertificateInternal(enrollment);
    await this.awardCompletionPoints(enrollment.userId);

    await createNotificationSafe(this.prisma, this.logger, {
      userId: enrollment.userId,
      type: 'COURSE_COMPLETED',
      message: `Concluíste o curso "${enrollment.course?.title}"! Certificado emitido. 🎉`,
      metadata: { courseId: enrollment.courseId, enrollmentId },
    });

    return { finalized: true };
  }

  private async issueCertificateInternal(enrollment: {
    id: number;
    userId: number;
    courseId: number;
    course: { certificateValidityDays: number | null } | null;
  }) {
    const existing = await this.prisma.certificate.findFirst({ where: { enrollmentId: enrollment.id } });
    if (existing) return existing;

    const validityDays = enrollment.course?.certificateValidityDays ?? null;
    const expiresAt = validityDays ? new Date(Date.now() + validityDays * 86400 * 1000) : null;

    try {
      return await this.prisma.certificate.create({
        data: {
          enrollmentId: enrollment.id,
          userId: enrollment.userId,
          courseId: enrollment.courseId,
          type: CertificateType.COURSE,
          validationCode: `CERT-${enrollment.courseId}-${enrollment.userId}-${Date.now()}`,
          issuedAt: new Date(),
          expiresAt,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return this.prisma.certificate.findFirst({ where: { enrollmentId: enrollment.id } });
      }
      throw e;
    }
  }

  private async awardCompletionPoints(userId: number) {
    try {
      await this.prisma.userPoints.upsert({
        where: { userId },
        create: { userId, points: 100 },
        update: { points: { increment: 100 } },
      });
    } catch (e: unknown) {
      this.logger.warn(
        `Falha ao atribuir pontos de conclusão (não bloqueante) — userId=${userId}: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
  }
```

- [ ] **Step 4: Correr e confirmar PASS**

```bash
npx jest src/course-completion/course-completion.service.spec.ts
```

- [ ] **Step 5: prettier + tsc**

```bash
npx prettier --write src/course-completion/
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add src/course-completion/
git commit -m "feat(course-completion): finalizeCompletion — bloco único e idempotente de efeitos de conclusão"
```

---

### Task 4: `issueCertificateFor` — caminho manual/idempotente do certificado

**Files:**
- Modify: `src/course-completion/course-completion.service.ts`
- Test: `src/course-completion/course-completion.service.spec.ts`

**Interfaces:**
- Produces: `issueCertificateFor(enrollmentId: number, user: CurrentUserData): Promise<Certificate>` — para `POST /enrollments/my/:id/certificate` e `POST /enrollments/:id/certificate`. Faz `assertCanAccess([ADMIN, RH])`, exige `status === 'COMPLETED'` (senão `BadRequestException`), devolve o certificado existente ou cria um novo via `issueCertificateInternal`. **Não** notifica se o certificado já existia; notifica (`CERTIFICATE_ISSUED`? não — ver Global Constraints) — cria uma notificação `COURSE_COMPLETED` só se o certificado foi agora criado.
- Consumes: `issueCertificateInternal` (Task 3).

- [ ] **Step 1: Escrever os testes (devem falhar)**

```ts
  describe('issueCertificateFor', () => {
    const adminUser = { id: 99, role: { name: 'ADMIN' } } as any;
    const ownerUser = { id: 10, role: { name: 'COLABORADOR' } } as any;
    const strangerUser = { id: 77, role: { name: 'COLABORADOR' } } as any;

    const completed = {
      id: 1, userId: 10, courseId: 20, status: 'COMPLETED',
      course: { id: 20, title: 'Curso X', certificateValidityDays: null },
    };

    it('curso não concluído → BadRequestException', async () => {
      mockPrisma.enrollment.findUnique.mockResolvedValue({ ...completed, status: 'IN_PROGRESS' });
      await expect(service.issueCertificateFor(1, ownerUser)).rejects.toThrow(BadRequestException);
    });

    it('utilizador que não é dono nem ADMIN/RH → ForbiddenException', async () => {
      mockPrisma.enrollment.findUnique.mockResolvedValue({ ...completed });
      await expect(service.issueCertificateFor(1, strangerUser)).rejects.toThrow(ForbiddenException);
    });

    it('dono, curso concluído, sem certificado → cria e devolve', async () => {
      mockPrisma.enrollment.findUnique.mockResolvedValue({ ...completed });
      mockPrisma.certificate.findFirst.mockResolvedValue(null);
      mockPrisma.certificate.create.mockResolvedValue({ id: 500, enrollmentId: 1 });
      const cert = await service.issueCertificateFor(1, ownerUser);
      expect(cert).toEqual({ id: 500, enrollmentId: 1 });
    });

    it('certificado já existe → devolve o existente, sem criar nem notificar', async () => {
      mockPrisma.enrollment.findUnique.mockResolvedValue({ ...completed });
      mockPrisma.certificate.findFirst.mockResolvedValue({ id: 500, enrollmentId: 1 });
      const cert = await service.issueCertificateFor(1, adminUser);
      expect(cert).toEqual({ id: 500, enrollmentId: 1 });
      expect(mockPrisma.certificate.create).not.toHaveBeenCalled();
      expect(mockPrisma.notificationLog.create).not.toHaveBeenCalled();
    });

    it('matrícula inexistente → NotFoundException', async () => {
      mockPrisma.enrollment.findUnique.mockResolvedValue(null);
      await expect(service.issueCertificateFor(999, adminUser)).rejects.toThrow(NotFoundException);
    });
  });
```

> Confirmar como `assertCanAccess` lê o role: `sed -n '1,40p' src/common/helpers/ownership.helper.ts`. Ajustar os objectos `*User` do teste ao shape real de `CurrentUserData` (provável: `{ id, role: { name } }` ou `{ id, roleCode }`).

- [ ] **Step 2: Correr e confirmar FAIL**

```bash
npx jest src/course-completion/course-completion.service.spec.ts -t "issueCertificateFor"
```

- [ ] **Step 3: Implementar**

```ts
  async issueCertificateFor(enrollmentId: number, user: CurrentUserData) {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      include: { course: { select: { id: true, title: true, certificateValidityDays: true } } },
    });
    if (!enrollment) throw new NotFoundException('Matrícula não encontrada');

    assertCanAccess(enrollment, enrollment.userId, user, [Role.ADMIN, Role.RH]);

    if (enrollment.status !== 'COMPLETED') {
      throw new BadRequestException('Curso ainda não concluído');
    }

    const before = await this.prisma.certificate.findFirst({ where: { enrollmentId } });
    const cert = await this.issueCertificateInternal(enrollment);

    if (!before && cert) {
      await createNotificationSafe(this.prisma, this.logger, {
        userId: enrollment.userId,
        type: 'COURSE_COMPLETED',
        message: `Certificado emitido para o curso "${enrollment.course?.title}".`,
        metadata: { courseId: enrollment.courseId, enrollmentId },
      });
    }

    return cert;
  }
```

- [ ] **Step 4: Correr e confirmar PASS**

```bash
npx jest src/course-completion/course-completion.service.spec.ts
```

- [ ] **Step 5: prettier + tsc**

```bash
npx prettier --write src/course-completion/
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add src/course-completion/
git commit -m "feat(course-completion): issueCertificateFor — emissão manual idempotente com ownership"
```

---

### Task 5: `markLessonComplete` — orquestrador único de progresso + conclusão

**Files:**
- Modify: `src/course-completion/course-completion.service.ts`
- Test: `src/course-completion/course-completion.service.spec.ts`

**Interfaces:**
- Produces:
  - `markLessonComplete(userId: number, lessonId: number, dto: MarkLessonProgressInput): Promise<{ progress: LessonProgress; courseProgress: { totalLessons: number; completedLessons: number; pct: number }; courseCompleted: boolean }>`.
  - `getCourseProgressNumbers(courseId: number, userId: number): Promise<{ totalLessons: number; completedLessons: number; pct: number }>` — a antiga `calculateCourseProgress` de `courses.service.ts`, pública (usada por `GET /courses/:id/progress`).
- Consumes: `evaluateCompletion` (Task 2), `finalizeCompletion` (Task 3).

- [ ] **Step 1: Escrever os testes (devem falhar)**

```ts
  describe('getCourseProgressNumbers', () => {
    it('pct = round(completed / total * 100)', async () => {
      mockPrisma.read.lesson.count.mockResolvedValue(8);
      mockPrisma.read.lessonProgress.count.mockResolvedValue(2);
      expect(await service.getCourseProgressNumbers(20, 10)).toEqual({
        totalLessons: 8, completedLessons: 2, pct: 25,
      });
    });
    it('curso sem aulas → pct 0', async () => {
      mockPrisma.read.lesson.count.mockResolvedValue(0);
      mockPrisma.read.lessonProgress.count.mockResolvedValue(0);
      expect(await service.getCourseProgressNumbers(20, 10)).toEqual({
        totalLessons: 0, completedLessons: 0, pct: 0,
      });
    });
  });

  describe('markLessonComplete', () => {
    it('aula inexistente → NotFoundException', async () => {
      mockPrisma.read.lesson.findUnique.mockResolvedValue(null);
      await expect(service.markLessonComplete(10, 999, {})).rejects.toThrow(NotFoundException);
    });

    it('não matriculado → ForbiddenException', async () => {
      mockPrisma.read.lesson.findUnique.mockResolvedValue({ id: 1, moduleId: 5, module: { courseId: 20 } });
      mockPrisma.enrollment.findFirst.mockResolvedValue(null);
      await expect(service.markLessonComplete(10, 1, {})).rejects.toThrow(ForbiddenException);
    });

    it('upsert do progresso + NOT_STARTED → IN_PROGRESS + não completa se evaluateCompletion=false', async () => {
      mockPrisma.read.lesson.findUnique.mockResolvedValue({ id: 1, moduleId: 5, module: { courseId: 20 } });
      mockPrisma.enrollment.findFirst.mockResolvedValue({ id: 7, userId: 10, courseId: 20, status: 'NOT_STARTED' });
      mockPrisma.lessonProgress.upsert.mockResolvedValue({ id: 1, completed: true });
      jest.spyOn(service, 'evaluateCompletion').mockResolvedValue({ complete: false, reason: 'all-lessons' });
      mockPrisma.read.lesson.count.mockResolvedValue(4);
      mockPrisma.read.lessonProgress.count.mockResolvedValue(1);

      const res = await service.markLessonComplete(10, 1, { watchedSeconds: 30 });

      expect(mockPrisma.lessonProgress.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { lessonId_userId: { lessonId: 1, userId: 10 } } }),
      );
      expect(mockPrisma.enrollment.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: { status: 'IN_PROGRESS', startedAt: expect.any(Date) },
      });
      expect(res.courseCompleted).toBe(false);
      expect(res.courseProgress).toEqual({ totalLessons: 4, completedLessons: 1, pct: 25 });
    });

    it('evaluateCompletion=true → chama finalizeCompletion e devolve courseCompleted:true', async () => {
      mockPrisma.read.lesson.findUnique.mockResolvedValue({ id: 1, moduleId: 5, module: { courseId: 20 } });
      mockPrisma.enrollment.findFirst.mockResolvedValue({ id: 7, userId: 10, courseId: 20, status: 'IN_PROGRESS' });
      mockPrisma.lessonProgress.upsert.mockResolvedValue({ id: 1, completed: true });
      jest.spyOn(service, 'evaluateCompletion').mockResolvedValue({ complete: true, reason: 'all-modules' });
      const finalizeSpy = jest.spyOn(service, 'finalizeCompletion').mockResolvedValue({ finalized: true });
      mockPrisma.read.lesson.count.mockResolvedValue(4);
      mockPrisma.read.lessonProgress.count.mockResolvedValue(4);

      const res = await service.markLessonComplete(10, 1, {});

      expect(finalizeSpy).toHaveBeenCalledWith(7);
      expect(res.courseCompleted).toBe(true);
    });

    it('idempotente: se finalizeCompletion devolve finalized:false mas o curso já está COMPLETED, courseCompleted:true', async () => {
      mockPrisma.read.lesson.findUnique.mockResolvedValue({ id: 1, moduleId: 5, module: { courseId: 20 } });
      mockPrisma.enrollment.findFirst.mockResolvedValue({ id: 7, userId: 10, courseId: 20, status: 'COMPLETED' });
      mockPrisma.lessonProgress.upsert.mockResolvedValue({ id: 1, completed: true });
      jest.spyOn(service, 'evaluateCompletion').mockResolvedValue({ complete: true, reason: 'all-modules' });
      jest.spyOn(service, 'finalizeCompletion').mockResolvedValue({ finalized: false });
      mockPrisma.read.lesson.count.mockResolvedValue(4);
      mockPrisma.read.lessonProgress.count.mockResolvedValue(4);

      const res = await service.markLessonComplete(10, 1, {});
      expect(res.courseCompleted).toBe(true);
      expect(mockPrisma.enrollment.update).not.toHaveBeenCalled(); // não re-flipa NOT_STARTED
    });
  });
```

- [ ] **Step 2: Correr e confirmar FAIL**

```bash
npx jest src/course-completion/course-completion.service.spec.ts -t "markLessonComplete|getCourseProgressNumbers"
```

- [ ] **Step 3: Implementar**

```ts
  async getCourseProgressNumbers(courseId: number, userId: number) {
    const [totalLessons, completedLessons] = await Promise.all([
      this.prisma.read.lesson.count({ where: { module: { courseId } } }),
      this.prisma.read.lessonProgress.count({
        where: { userId, completed: true, lesson: { module: { courseId } } },
      }),
    ]);
    const pct = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;
    return { totalLessons, completedLessons, pct };
  }

  async markLessonComplete(userId: number, lessonId: number, dto: MarkLessonProgressInput) {
    const lesson = await this.prisma.read.lesson.findUnique({
      where: { id: lessonId },
      include: { module: { select: { courseId: true } } },
    });
    if (!lesson) throw new NotFoundException('Aula não encontrada');
    const courseId = lesson.module.courseId;

    const enrollment = await this.prisma.enrollment.findFirst({ where: { userId, courseId } });
    if (!enrollment) throw new ForbiddenException('Não está matriculado neste curso');

    const progress = await this.prisma.lessonProgress.upsert({
      where: { lessonId_userId: { lessonId, userId } },
      create: {
        lessonId,
        userId,
        completed: true,
        completedAt: new Date(),
        watchedSeconds: dto.watchedSeconds,
        resumePosition: dto.resumePosition,
      },
      update: {
        completed: true,
        completedAt: new Date(),
        watchedSeconds: dto.watchedSeconds,
        resumePosition: dto.resumePosition,
      },
    });

    if (enrollment.status === 'NOT_STARTED') {
      await this.prisma.enrollment.update({
        where: { id: enrollment.id },
        data: { status: 'IN_PROGRESS', startedAt: new Date() },
      });
    }

    const courseProgress = await this.getCourseProgressNumbers(courseId, userId);

    let courseCompleted = enrollment.status === 'COMPLETED';
    const evalResult = await this.evaluateCompletion(enrollment.id);
    if (evalResult.complete) {
      const { finalized } = await this.finalizeCompletion(enrollment.id);
      courseCompleted = courseCompleted || finalized;
    }

    return { progress, courseProgress, courseCompleted };
  }
```

- [ ] **Step 4: Correr toda a spec do serviço e confirmar PASS**

```bash
npx jest src/course-completion/course-completion.service.spec.ts
```

- [ ] **Step 5: prettier + tsc**

```bash
npx prettier --write src/course-completion/
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add src/course-completion/
git commit -m "feat(course-completion): markLessonComplete — orquestrador único progresso→conclusão"
```

---

### Task 6: `courses` delega no `CourseCompletionService`

**Files:**
- Modify: `src/courses/courses.module.ts`
- Modify: `src/courses/courses.service.ts`
- Test: `src/courses/courses.service.spec.ts`, `src/courses/courses.service.progress.spec.ts`

**Interfaces:**
- Consumes: `CourseCompletionService.markLessonComplete`, `.getCourseProgressNumbers`.

- [ ] **Step 1: Adaptar os testes existentes (devem falhar)**

Em `src/courses/courses.service.progress.spec.ts` (e `courses.service.spec.ts` se lá houver testes de `markLessonComplete`/`getCourseProgress`): adicionar o mock do novo provider ao `TestingModule`:

```ts
import { CourseCompletionService } from '../course-completion/course-completion.service';

const mockCourseCompletion = {
  markLessonComplete: jest.fn(),
  getCourseProgressNumbers: jest.fn(),
};
// no providers[]:
{ provide: CourseCompletionService, useValue: mockCourseCompletion },
```

Substituir o(s) teste(s) de `markLessonComplete` por um que verifica delegação:

```ts
describe('markLessonComplete', () => {
  it('delega em CourseCompletionService.markLessonComplete(userId, lessonId, {watchedSeconds, resumePosition})', async () => {
    mockCourseCompletion.markLessonComplete.mockResolvedValue({
      progress: { id: 1 }, courseProgress: { totalLessons: 2, completedLessons: 1, pct: 50 }, courseCompleted: false,
    });

    const res = await service.markLessonComplete(1, 10, { watchedSeconds: 30, resumePosition: 5 } as any);

    expect(mockCourseCompletion.markLessonComplete).toHaveBeenCalledWith(10, 1, {
      watchedSeconds: 30, resumePosition: 5,
    });
    expect(res.courseProgress.pct).toBe(50);
  });
});
```

> Nota: a assinatura pública actual é `markLessonComplete(lessonId, userId, dto)` (ordem lessonId, userId — ver `courses.controller.ts:255`). Manter essa ordem no `courses.service`; só inverter ao chamar o novo serviço.

- [ ] **Step 2: Correr e confirmar FAIL**

```bash
npx jest src/courses/courses.service.progress.spec.ts
```

- [ ] **Step 3: Implementar a delegação**

`src/courses/courses.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { CoursesService } from './courses.service';
import { CoursesController } from './courses.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { CourseCompletionModule } from '../course-completion/course-completion.module';

@Module({
  imports: [PrismaModule, CourseCompletionModule],
  providers: [CoursesService],
  controllers: [CoursesController],
  exports: [CoursesService],
})
export class CoursesModule {}
```

`src/courses/courses.service.ts`:
- Adicionar ao construtor: `private readonly courseCompletion: CourseCompletionService` (import de `../course-completion/course-completion.service`).
- Substituir `markLessonComplete`:

```ts
  async markLessonComplete(lessonId: number, userId: number, dto: MarkLessonCompleteDto) {
    return this.courseCompletion.markLessonComplete(userId, lessonId, {
      watchedSeconds: dto.watchedSeconds,
      resumePosition: dto.resumePosition,
    });
  }
```

- Em `getCourseProgress`, trocar `const courseProgress = await this.calculateCourseProgress(courseId, userId);` por `const courseProgress = await this.courseCompletion.getCourseProgressNumbers(courseId, userId);`.
- **Remover** os métodos privados `calculateCourseProgress`, `completeCourse`, `issueCertificate`.
- Manter `getMyCertificates` e `verifyCertificate` (leitura pura, fora do âmbito).
- Se `CertificateType` deixar de ser usado no ficheiro, remover do import.

- [ ] **Step 4: Correr e confirmar PASS**

```bash
npx jest src/courses/
```

- [ ] **Step 5: prettier + tsc + eslint**

```bash
npx prettier --write src/courses/ src/course-completion/
npx tsc --noEmit
npx eslint src/courses/courses.service.ts --config eslint.config.staged.mjs
```

- [ ] **Step 6: Commit**

```bash
git add src/courses/ src/course-completion/
git commit -m "refactor(courses): markLessonComplete/getCourseProgress delegam em CourseCompletionService"
```

---

### Task 7: `course-modules` delega no `CourseCompletionService`

**Files:**
- Modify: `src/course-modules/course-modules.module.ts`
- Modify: `src/course-modules/course-modules.service.ts`
- Test: `src/course-modules/course-modules.service.spec.ts`, `src/course-modules/course-modules.service.progress.spec.ts`

**Interfaces:**
- Consumes: `CourseCompletionService.markLessonComplete`, `.isModuleCompleted`.
- Preserva: `isLessonAccessible` (gate de progressão sequencial) e `notifyNextModuleUnlock` (efeito próprio de `course-modules`, inalterado).

- [ ] **Step 1: Adaptar os testes existentes (devem falhar)**

Em `course-modules.service.progress.spec.ts` (+ `.spec.ts` conforme onde estejam os testes de `markLessonComplete`):

```ts
import { CourseCompletionService } from '../course-completion/course-completion.service';

const mockCourseCompletion = {
  markLessonComplete: jest.fn(),
  isModuleCompleted: jest.fn(),
};
// providers[]:
{ provide: CourseCompletionService, useValue: mockCourseCompletion },
```

Reescrever o `describe('markLessonComplete', ...)`:

```ts
describe('markLessonComplete', () => {
  it('bloqueia se a aula não está acessível (progressão sequencial) — não delega', async () => {
    jest.spyOn(service, 'isLessonAccessible').mockResolvedValue({ accessible: false, reason: 'Módulo bloqueado' });
    await expect(service.markLessonComplete(10, { lessonId: 1 } as any)).rejects.toThrow(ForbiddenException);
    expect(mockCourseCompletion.markLessonComplete).not.toHaveBeenCalled();
  });

  it('acessível → delega em CourseCompletionService e devolve {progress, moduleCompleted, courseId}', async () => {
    jest.spyOn(service, 'isLessonAccessible').mockResolvedValue({ accessible: true });
    mockCourseCompletion.markLessonComplete.mockResolvedValue({
      progress: { id: 1, completed: true }, courseProgress: {}, courseCompleted: false,
    });
    mockPrisma.read.lesson.findUnique.mockResolvedValue({ id: 1, moduleId: 5, module: { courseId: 20 } });
    mockCourseCompletion.isModuleCompleted.mockResolvedValue(true);
    jest.spyOn(service, 'notifyNextModuleUnlock').mockResolvedValue(undefined as any);

    const res = await service.markLessonComplete(10, { lessonId: 1, watchedSeconds: 5 } as any);

    expect(mockCourseCompletion.markLessonComplete).toHaveBeenCalledWith(10, 1, { watchedSeconds: 5, resumePosition: undefined });
    expect(res).toEqual({ progress: { id: 1, completed: true }, moduleCompleted: true, courseId: 20 });
    expect(service.notifyNextModuleUnlock).toHaveBeenCalledWith(5, 10, 20);
  });

  it('módulo não concluído → não notifica desbloqueio', async () => {
    jest.spyOn(service, 'isLessonAccessible').mockResolvedValue({ accessible: true });
    mockCourseCompletion.markLessonComplete.mockResolvedValue({ progress: { id: 1 }, courseProgress: {}, courseCompleted: false });
    mockPrisma.read.lesson.findUnique.mockResolvedValue({ id: 1, moduleId: 5, module: { courseId: 20 } });
    mockCourseCompletion.isModuleCompleted.mockResolvedValue(false);
    const notifySpy = jest.spyOn(service, 'notifyNextModuleUnlock').mockResolvedValue(undefined as any);

    await service.markLessonComplete(10, { lessonId: 1 } as any);
    expect(notifySpy).not.toHaveBeenCalled();
  });
});
```

Se houver um teste directo de `isModuleCompleted` neste ficheiro, mudá-lo para verificar delegação: `expect(mockCourseCompletion.isModuleCompleted).toHaveBeenCalledWith(id, userId)`.

- [ ] **Step 2: Correr e confirmar FAIL**

```bash
npx jest src/course-modules/course-modules.service.progress.spec.ts
```

- [ ] **Step 3: Implementar**

`src/course-modules/course-modules.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { CourseModulesService } from './course-modules.service';
import { CourseModulesController } from './course-modules.controller';
import { CourseCompletionModule } from '../course-completion/course-completion.module';

@Module({
  imports: [CourseCompletionModule],
  providers: [CourseModulesService],
  controllers: [CourseModulesController],
  exports: [CourseModulesService],
})
export class CourseModulesModule {}
```

`src/course-modules/course-modules.service.ts`:
- Construtor: adicionar `private readonly courseCompletion: CourseCompletionService`.
- Substituir `markLessonComplete`:

```ts
  async markLessonComplete(userId: number, dto: MarkModuleLessonCompleteDto) {
    const access = await this.isLessonAccessible(dto.lessonId, userId);
    if (!access.accessible) {
      throw new ForbiddenException(access.reason ?? 'Aula não acessível');
    }

    const { progress } = await this.courseCompletion.markLessonComplete(userId, dto.lessonId, {
      watchedSeconds: dto.watchedSeconds,
      resumePosition: dto.resumePosition,
    });

    const lesson = await this.prisma.read.lesson.findUnique({
      where: { id: dto.lessonId },
      include: { module: { select: { courseId: true } } },
    });
    if (!lesson) throw new NotFoundException('Aula não encontrada');
    const moduleId = lesson.moduleId;
    const courseId = lesson.module.courseId;

    const moduleCompleted = await this.courseCompletion.isModuleCompleted(moduleId, userId);
    if (moduleCompleted) {
      await this.notifyNextModuleUnlock(moduleId, userId, courseId);
    }

    return { progress, moduleCompleted, courseId };
  }
```

- Substituir o corpo de `isModuleCompleted` por delegação:

```ts
  async isModuleCompleted(moduleId: number, userId: number): Promise<boolean> {
    return this.courseCompletion.isModuleCompleted(moduleId, userId);
  }
```

- **Remover** o método privado `checkAndCompleteCourse`.
- Remover imports que fiquem sem uso (verificar com eslint no Step 5).

- [ ] **Step 4: Correr e confirmar PASS**

```bash
npx jest src/course-modules/
```

- [ ] **Step 5: prettier + tsc + eslint**

```bash
npx prettier --write src/course-modules/
npx tsc --noEmit
npx eslint src/course-modules/course-modules.service.ts --config eslint.config.staged.mjs
```

- [ ] **Step 6: Commit**

```bash
git add src/course-modules/
git commit -m "refactor(course-modules): markLessonComplete/isModuleCompleted delegam em CourseCompletionService; remove checkAndCompleteCourse"
```

---

### Task 8: `enrollments` delega no `CourseCompletionService`

**Files:**
- Modify: `src/enrollments/enrollments.module.ts`
- Modify: `src/enrollments/enrollments.service.ts`
- Test: `src/enrollments/enrollments.service.spec.ts`, `src/enrollments/enrollments.service.additional.spec.ts`

**Interfaces:**
- Consumes: `CourseCompletionService.issueCertificateFor`, `.finalizeCompletion`.

- [ ] **Step 1: Adaptar os testes existentes (devem falhar)**

Nos specs de `enrollments` que testam `generateCertificate` e `updateStatus`, adicionar:

```ts
import { CourseCompletionService } from '../course-completion/course-completion.service';

const mockCourseCompletion = {
  issueCertificateFor: jest.fn(),
  finalizeCompletion: jest.fn(),
};
// providers[]:
{ provide: CourseCompletionService, useValue: mockCourseCompletion },
```

Reescrever:

```ts
describe('generateCertificate', () => {
  it('delega em CourseCompletionService.issueCertificateFor(enrollmentId, user)', async () => {
    mockCourseCompletion.issueCertificateFor.mockResolvedValue({ id: 500, enrollmentId: 7 });
    const user = { id: 10 } as any;
    const res = await service.generateCertificate(7, user);
    expect(mockCourseCompletion.issueCertificateFor).toHaveBeenCalledWith(7, user);
    expect(res).toEqual({ id: 500, enrollmentId: 7 });
  });
});

describe('updateStatus', () => {
  it('status COMPLETED → chama finalizeCompletion e devolve a matrícula recarregada', async () => {
    mockPrisma.enrollment.findUnique.mockResolvedValue({ id: 7, status: 'IN_PROGRESS', completedAt: null });
    mockCourseCompletion.finalizeCompletion.mockResolvedValue({ finalized: true });
    // findOne recarrega no fim:
    mockPrisma.enrollment.findUnique.mockResolvedValueOnce({ id: 7, status: 'IN_PROGRESS', completedAt: null })
                                    .mockResolvedValueOnce({ id: 7, status: 'COMPLETED', completedAt: new Date() });

    const res = await service.updateStatus(7, { status: 'COMPLETED' } as any);

    expect(mockCourseCompletion.finalizeCompletion).toHaveBeenCalledWith(7);
    expect(res.status).toBe('COMPLETED');
    expect(mockPrisma.enrollment.update).not.toHaveBeenCalled(); // finalizeCompletion já faz o update
  });

  it('transição inválida COMPLETED → NOT_STARTED continua a lançar BadRequestException', async () => {
    mockPrisma.enrollment.findUnique.mockResolvedValue({ id: 7, status: 'COMPLETED', completedAt: new Date() });
    await expect(service.updateStatus(7, { status: 'NOT_STARTED' } as any)).rejects.toThrow(BadRequestException);
    expect(mockCourseCompletion.finalizeCompletion).not.toHaveBeenCalled();
  });

  it('status não-COMPLETED (ex. CANCELLED) → update directo, sem finalizeCompletion', async () => {
    mockPrisma.enrollment.findUnique.mockResolvedValue({ id: 7, status: 'IN_PROGRESS', completedAt: null });
    mockPrisma.enrollment.update.mockResolvedValue({ id: 7, status: 'CANCELLED' });
    await service.updateStatus(7, { status: 'CANCELLED' } as any);
    expect(mockCourseCompletion.finalizeCompletion).not.toHaveBeenCalled();
    expect(mockPrisma.enrollment.update).toHaveBeenCalled();
  });
});
```

> Confirmar o nome real do método de recarga (`findOne`) e a sua assinatura em `enrollments.service.ts` antes de escrever o teste; ajustar mocks conforme.

- [ ] **Step 2: Correr e confirmar FAIL**

```bash
npx jest src/enrollments/
```

- [ ] **Step 3: Implementar**

`src/enrollments/enrollments.module.ts` — adicionar `CourseCompletionModule` a `imports`.

`src/enrollments/enrollments.service.ts`:
- Construtor: `private readonly courseCompletion: CourseCompletionService`.
- Substituir `generateCertificate`:

```ts
  async generateCertificate(enrollmentId: number, user: CurrentUserData) {
    return this.courseCompletion.issueCertificateFor(enrollmentId, user);
  }
```

- Em `updateStatus`, depois da guarda de `invalidTransitions` e antes do `this.prisma.enrollment.update` final:

```ts
    if (dto.status === 'COMPLETED') {
      await this.courseCompletion.finalizeCompletion(id);
      return this.findOne(id);
    }

    const data: Prisma.EnrollmentUpdateInput = { status: dto.status };
    return this.prisma.enrollment.update({ where: { id }, data });
```

  (Remove-se o ramo `if (dto.status === 'COMPLETED' && !e.completedAt) data.completedAt = new Date();` — `finalizeCompletion` já trata `completedAt`.)

- Remover `CertificateType` do import se ficar sem uso; idem para outros símbolos.

- [ ] **Step 4: Correr e confirmar PASS**

```bash
npx jest src/enrollments/
```

- [ ] **Step 5: prettier + tsc + eslint**

```bash
npx prettier --write src/enrollments/
npx tsc --noEmit
npx eslint src/enrollments/enrollments.service.ts --config eslint.config.staged.mjs
```

- [ ] **Step 6: Commit**

```bash
git add src/enrollments/
git commit -m "refactor(enrollments): generateCertificate + updateStatus(COMPLETED) delegam em CourseCompletionService"
```

---

### Task 9: Testes de integração — fixar o comportamento unificado

**Files:**
- Modify: `test/integration/courses/courses.integration-spec.ts`
- Modify: `test/integration/course-modules/course-modules.integration-spec.ts`
- Modify: `test/integration/enrollments/enrollments.integration-spec.ts`

**Interfaces:** nenhuma nova — só cobertura.

- [ ] **Step 1: `courses` — concluir pelo caminho flat agora dá certificado + pontos + notificação**

Adicionar ao spec de `courses` um `describe('conclusão consolidada (Fase A)')`:

```ts
it('completar a última aula de um curso sem módulos publicados → COMPLETED + certificado + pontos + notificação COURSE_COMPLETED', async () => {
  // pré-condição: seed cria (ou o teste cria) um curso com N aulas, todas menos 1 já concluídas pelo employee.
  // Completar a última via POST /courses/lessons/:lessonId/complete.
  const before = await prisma.userPoints.findUnique({ where: { userId: employeeId } });

  const res = await request(app.getHttpServer())
    .post(`/courses/lessons/${lastLessonId}/complete`)
    .set('Authorization', `Bearer ${employeeToken}`)
    .send({ watchedSeconds: 10 })
    .expect(201);

  expect(res.body.courseCompleted).toBe(true);

  const enr = await prisma.enrollment.findFirst({ where: { userId: employeeId, courseId } });
  expect(enr!.status).toBe('COMPLETED');

  const cert = await prisma.certificate.findFirst({ where: { enrollmentId: enr!.id } });
  expect(cert).not.toBeNull();
  expect(cert!.type).toBe('COURSE');

  const after = await prisma.userPoints.findUnique({ where: { userId: employeeId } });
  expect((after?.points ?? 0)).toBeGreaterThan(before?.points ?? 0);

  const notif = await prisma.notificationLog.findFirst({
    where: { userId: employeeId, type: 'COURSE_COMPLETED' }, orderBy: { id: 'desc' },
  });
  expect(notif).not.toBeNull();
});

it('re-completar uma aula de um curso já concluído → idempotente, não cria 2º certificado nem 2ª ronda de pontos', async () => {
  const enr = await prisma.enrollment.findFirst({ where: { userId: employeeId, courseId } });
  const certsBefore = await prisma.certificate.count({ where: { enrollmentId: enr!.id } });
  const pointsBefore = (await prisma.userPoints.findUnique({ where: { userId: employeeId } }))?.points ?? 0;

  await request(app.getHttpServer())
    .post(`/courses/lessons/${lastLessonId}/complete`)
    .set('Authorization', `Bearer ${employeeToken}`)
    .send({ watchedSeconds: 10 })
    .expect(201);

  expect(await prisma.certificate.count({ where: { enrollmentId: enr!.id } })).toBe(certsBefore);
  expect((await prisma.userPoints.findUnique({ where: { userId: employeeId } }))?.points ?? 0).toBe(pointsBefore);
});
```

> Adaptar `employeeId`/`employeeToken`/`courseId`/`lastLessonId` aos helpers e ao seed já usados neste ficheiro. Se o spec não tiver hoje um curso com aulas para o employee, criar no `beforeAll` do novo `describe` (curso + módulo `DRAFT`/sem módulos publicados + aulas + enrollment).

- [ ] **Step 2: `course-modules` — concluir pelo caminho de módulos agora também dá certificado**

```ts
it('completar o módulo mandatory final via /course-modules/lessons/progress → curso COMPLETED + certificado emitido (antes: só pontos)', async () => {
  const res = await request(app.getHttpServer())
    .post('/course-modules/lessons/progress')
    .set('Authorization', `Bearer ${employeeToken}`)
    .send({ lessonId: finalMandatoryLessonId })
    .expect(201);

  expect(res.body.moduleCompleted).toBe(true);

  const enr = await prisma.enrollment.findFirst({ where: { userId: employeeId, courseId: modCourseId } });
  expect(enr!.status).toBe('COMPLETED');
  const cert = await prisma.certificate.findFirst({ where: { enrollmentId: enr!.id } });
  expect(cert).not.toBeNull();
});
```

- [ ] **Step 3: `enrollments` — admin forçar COMPLETED agora emite certificado + pontos**

```ts
it('PUT /enrollments/:id/status {COMPLETED} (admin) → certificado + pontos + analytics, não só o estado', async () => {
  const pointsBefore = (await prisma.userPoints.findUnique({ where: { userId: targetUserId } }))?.points ?? 0;

  await request(app.getHttpServer())
    .put(`/enrollments/${enrollmentId}/status`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ status: 'COMPLETED' })
    .expect(200);

  const enr = await prisma.enrollment.findUnique({ where: { id: enrollmentId } });
  expect(enr!.status).toBe('COMPLETED');
  expect(enr!.completedAt).not.toBeNull();

  const cert = await prisma.certificate.findFirst({ where: { enrollmentId } });
  expect(cert).not.toBeNull();

  expect((await prisma.userPoints.findUnique({ where: { userId: targetUserId } }))?.points ?? 0)
    .toBeGreaterThan(pointsBefore);
});

it('POST /enrollments/my/:id/certificate sobre curso já concluído → devolve o mesmo certificado (idempotente)', async () => {
  const first = await request(app.getHttpServer())
    .post(`/enrollments/my/${enrollmentId}/certificate`)
    .set('Authorization', `Bearer ${targetUserToken}`)
    .expect(201);
  const second = await request(app.getHttpServer())
    .post(`/enrollments/my/${enrollmentId}/certificate`)
    .set('Authorization', `Bearer ${targetUserToken}`)
    .expect(201);
  expect(second.body.id).toBe(first.body.id);
});
```

> O teste existente `enrollments.integration-spec.ts:368` (`'gerar certificado para matrícula COMPLETED → 200'`) deve continuar a passar sem alteração. O teste `:273` (transições de estado) também — confirmar que `PUT .../status {COMPLETED}` continua a devolver 200 e um corpo com `status: 'COMPLETED'`.

- [ ] **Step 4: prettier**

```bash
npx prettier --write test/integration/courses/ test/integration/course-modules/ test/integration/enrollments/
```

- [ ] **Step 5: Commit**

```bash
git add test/integration/
git commit -m "test(integration): fixar conclusão de curso unificada (certificado+pontos+notificação em todos os caminhos)"
```

(A corrida real dos lotes de integração é a Task 10.)

---

### Task 10: Verificação completa + actualizar o documento de arquitectura

**Files:**
- Modify: `docs/arquitetura-modular-analise.md`

- [ ] **Step 1: Suites unitárias dos 4 módulos**

```bash
npx jest src/course-completion src/courses src/course-modules src/enrollments
```

Esperado: PASS em todos os ficheiros (incl. `*.additional.spec.ts`, `*.controller.spec.ts` não tocados — confirmar que continuam verdes).

- [ ] **Step 2: Suite unitária completa (zero regressão fora do âmbito)**

```bash
npm test
```

- [ ] **Step 3: Integração — garantir Redis local a correr, depois os 3 lotes**

```bash
# Redis: se não estiver a correr, arrancar (Windows: redis-server via chocolatey; ou docker)
npx cross-env NODE_ENV=test jest --config test/jest-integration.json --forceExit --runInBand --testPathPatterns "test/integration/(courses)/"
npx cross-env NODE_ENV=test jest --config test/jest-integration.json --forceExit --runInBand --testPathPatterns "test/integration/(course-modules)/"
npx cross-env NODE_ENV=test jest --config test/jest-integration.json --forceExit --runInBand --testPathPatterns "test/integration/(enrollments)/"
```

Se `--testPathPatterns` não corresponder a nada no Windows (colisão com o path absoluto `C:\Users\...`), tentar `--testPathPattern` (singular) ou correr `npm run test:integration` (todos os lotes, mais lento).

Esperado: PASS nos 3 lotes, incluindo os testes novos da Task 9 e os pré-existentes de conclusão/certificado.

- [ ] **Step 4: prettier (só `src/**` no CI) + eslint dos ficheiros tocados**

```bash
npx prettier --check "src/**/*.ts"
npx eslint src/course-completion src/courses/courses.service.ts src/course-modules/course-modules.service.ts src/enrollments/enrollments.service.ts --config eslint.config.staged.mjs
```

- [ ] **Step 5: `tsc` limpo**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Actualizar `docs/arquitetura-modular-analise.md`**

Na tabela §13, substituir a linha da Fase A:

```
| A | Consolidar "concluir curso" num `CourseCompletionService` | 6 | Médio (muda comportamento visível — certificado vs pontos) | Bug de consistência de dados activo, maior impacto por utilizador afectado |
```

por:

```
| A | ~~Consolidar "concluir curso" num `CourseCompletionService`~~ — **concluída**: `src/course-completion/` é agora o dono único de progresso→conclusão→certificado+pontos+notificação; `courses`/`course-modules`/`enrollments` delegam; critério de conclusão passou a module-aware em todos os caminhos (fallback plano só sem módulos publicados) | 6 | — | Ver `docs/superpowers/plans/2026-09-05-fase-a-course-completion-consolidation.md` |
```

Em §5, no item 1 (`CourseCompletionService`), acrescentar no fim da linha: ` — **feito** (Fase A, 2026-09-05).`

- [ ] **Step 7: Commit**

```bash
git add docs/arquitetura-modular-analise.md
git commit -m "docs: marcar Fase A (CourseCompletionService) como concluída"
```

---

### Task 11: PR e CI

- [ ] **Step 1: Branch + push**

```bash
git push -u origin <branch-desta-fase>:fix/course-completion-consolidation
```

- [ ] **Step 2: Abrir PR**

```bash
gh pr create --base main --title "fix(academia): consolidar conclusão de curso num CourseCompletionService (Fase A)" --body "$(cat <<'EOF'
## Resumo
Fase A do roteiro em `docs/arquitetura-modular-analise.md` §13. Havia 3 implementações divergentes de "concluir curso": `courses` (100% das aulas → certificado), `course-modules` (módulos obrigatórios → 100 pontos, sem certificado), `enrollments.generateCertificate` (3ª cópia da emissão) + `enrollments.updateStatus` (força COMPLETED sem efeitos). Consoante o endpoint, o utilizador recebia certificado OU pontos, nunca ambos.

## Mudanças
- Novo `src/course-completion/CourseCompletionService` — dono único de: upsert de progresso → decisão de conclusão (module-aware) → efeitos (estado, `CourseAnalytics`, certificado idempotente, +100 pontos, notificação `COURSE_COMPLETED`).
- `courses`, `course-modules`, `enrollments` delegam neste serviço; removidos `calculateCourseProgress`/`completeCourse`/`issueCertificate` (courses) e `checkAndCompleteCourse` (course-modules).
- **Mudança de comportamento deliberada:** qualquer caminho de conclusão passa a emitir certificado **e** pontos **e** notificação; `PUT /enrollments/:id/status {COMPLETED}` (admin) idem. Critério de "curso completo" agora module-aware em todos os caminhos (fallback "100% das aulas" só quando o curso não tem módulos `PUBLISHED`).
- Sem alteração de rota/verbo/forma de resposta (apenas `+courseCompleted` no corpo de `POST /courses/lessons/:id/complete`).

## Testes
- Unit: `src/course-completion/course-completion.service.spec.ts` (novo) + specs adaptados dos 3 módulos.
- Integração: novos testes em `courses`/`course-modules`/`enrollments` que fixam certificado+pontos+notificação em todos os caminhos e a idempotência.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Aguardar o check `quality` verde** (`main` protegida, `enforce_admins`, sem bypass — per `CLAUDE.md`).

- [ ] **Step 4: Merge squash após CI verde**

```bash
gh pr merge --squash --auto
```

---

## Self-Review

**1. Cobertura da spec (§2.3 item 4 + §5 item 1 + §13 fase A):**
- "ponto único de marcar lição/módulo como concluído" → Task 5 (`markLessonComplete`). ✔
- "decidir se o curso está completo" → Task 2 (`evaluateCompletion`). ✔
- "emitir certificado + pontos + notificação" → Task 3 (`finalizeCompletion`). ✔
- "consumido por `courses`, `course-modules`, `enrollments`" → Tasks 6, 7, 8. ✔
- §2.5 "`enrollments.updateStatus` força COMPLETED sem efeitos" → Task 8 Step 3 (ramo COMPLETED chama `finalizeCompletion`). ✔
- §11 item 2 "escrever testes de integração que capturem o comportamento actual de cada uma antes de unificar" → parcialmente: este plano fixa o comportamento **novo/unificado** (Task 9) em vez de caracterizar cada divergência antiga primeiro. Trade-off assumido: as 3 divergências estão documentadas na spec e nas Global Constraints; a unificação é deliberada. Se o revisor quiser o passo de caracterização, é um `describe.skip` a adicionar antes da Task 6 — anotado aqui, não bloqueante.

**2. Placeholders:** sem "TBD"/"handle edge cases"/"similar to Task N". Código real em cada step. ✔

**3. Consistência de tipos:**
- `markLessonComplete(userId, lessonId, dto)` — ordem `(userId, lessonId)` no serviço novo; `courses.service` mantém `(lessonId, userId)` e inverte na chamada (Task 6 Step 3). `course-modules.service` usa `(userId, dto)` e passa `(userId, dto.lessonId)`. Consistente. ✔
- `evaluateCompletion(enrollmentId) → { complete, reason }`, `finalizeCompletion(enrollmentId) → { finalized }`, `isModuleCompleted(moduleId, userId) → boolean`, `issueCertificateFor(enrollmentId, user) → Certificate`, `getCourseProgressNumbers(courseId, userId) → { totalLessons, completedLessons, pct }` — usados com estas assinaturas em todas as tarefas consumidoras. ✔
- `finalizeCompletion` devolve `finalized:false` quando já `COMPLETED`; os consumidores (Task 5, Task 8) tratam esse caso. ✔

**4. Riscos anotados:** ciclo de módulos (não há — verificado na secção Architecture); `assertCanAccess`/`Role`/`CurrentUserData` import paths (Task 1 Step 2 manda confirmar); `--testPathPatterns` no Windows (Task 10 Step 3 dá alternativa); `course.completed` event listener órfão em `scalability` (Global Constraints — follow-up, fora do âmbito).
