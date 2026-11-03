import { NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ExternalCourseScopeGuard, EXTERNAL_COURSE_SCOPE_KEY } from './external-course-scope.guard';

const EXT = { id: 9, role: { name: 'INSTRUCTOR_EXTERNO' } };
const ADMIN = { id: 1, role: { name: 'ADMIN' } };

function build(opts: {
  specs?: unknown;
  user?: unknown;
  params?: Record<string, string>;
  body?: Record<string, unknown>;
  lookups?: Record<string, unknown>;
  ownsCourse?: boolean;
}) {
  const prisma = {
    courseModule: { findUnique: jest.fn().mockResolvedValue(opts.lookups?.courseModule ?? null) },
    lesson: { findUnique: jest.fn().mockResolvedValue(opts.lookups?.lesson ?? null) },
    moduleMaterial: {
      findUnique: jest.fn().mockResolvedValue(opts.lookups?.moduleMaterial ?? null),
    },
    lessonActivity: {
      findUnique: jest.fn().mockResolvedValue(opts.lookups?.lessonActivity ?? null),
    },
    lessonResource: {
      findUnique: jest.fn().mockResolvedValue(opts.lookups?.lessonResource ?? null),
    },
    course: { findFirst: jest.fn().mockResolvedValue(opts.ownsCourse ? { id: 1 } : null) },
  };
  const reflector = {
    getAllAndOverride: jest.fn((key: string) =>
      key === EXTERNAL_COURSE_SCOPE_KEY ? opts.specs : undefined,
    ),
  } as unknown as Reflector;
  const guard = new ExternalCourseScopeGuard(reflector, prisma as never);
  const ctx = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user: opts.user, params: opts.params ?? {}, body: opts.body ?? {} }),
    }),
  } as never;
  return { guard, prisma, ctx };
}

describe('ExternalCourseScopeGuard', () => {
  it('sem metadados ou para quem não é externo: deixa passar sem consultar a BD', async () => {
    const a = build({ specs: undefined, user: EXT });
    await expect(a.guard.canActivate(a.ctx)).resolves.toBe(true);
    const b = build({ specs: [{ kind: 'course', key: 'id' }], user: ADMIN, params: { id: '3' } });
    await expect(b.guard.canActivate(b.ctx)).resolves.toBe(true);
    expect(b.prisma.course.findFirst).not.toHaveBeenCalled();
  });

  it('curso: externo instrutor do curso passa; senão 404', async () => {
    const ok = build({
      specs: [{ kind: 'course', key: 'id' }],
      user: EXT,
      params: { id: '3' },
      ownsCourse: true,
    });
    await expect(ok.guard.canActivate(ok.ctx)).resolves.toBe(true);
    const no = build({
      specs: [{ kind: 'course', key: 'id' }],
      user: EXT,
      params: { id: '3' },
      ownsCourse: false,
    });
    await expect(no.guard.canActivate(no.ctx)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('módulo: resolve o curso do módulo e valida a posse', async () => {
    const t = build({
      specs: [{ kind: 'module', key: 'id' }],
      user: EXT,
      params: { id: '7' },
      lookups: { courseModule: { courseId: 3 } },
      ownsCourse: true,
    });
    await expect(t.guard.canActivate(t.ctx)).resolves.toBe(true);
    expect(t.prisma.courseModule.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 7 } }),
    );
    expect(t.prisma.course.findFirst.mock.calls[0][0].where.id).toBe(3);
  });

  it.each([
    ['lesson', 'lesson', { module: { courseId: 3 } }],
    ['moduleMaterial', 'moduleMaterial', { module: { courseId: 3 } }],
    ['lessonActivity', 'lessonActivity', { lesson: { module: { courseId: 3 } } }],
    ['lessonResource', 'lessonResource', { lesson: { module: { courseId: 3 } } }],
  ])('%s: resolve o curso através das relações', async (kind, model, row) => {
    const t = build({
      specs: [{ kind, key: 'id' }],
      user: EXT,
      params: { id: '5' },
      lookups: { [model]: row },
      ownsCourse: true,
    });
    await expect(t.guard.canActivate(t.ctx)).resolves.toBe(true);
    expect(t.prisma.course.findFirst.mock.calls[0][0].where.id).toBe(3);
  });

  it('id inexistente → 404', async () => {
    const t = build({ specs: [{ kind: 'lesson', key: 'id' }], user: EXT, params: { id: '5' } });
    await expect(t.guard.canActivate(t.ctx)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('id inválido (não numérico) → 404', async () => {
    const t = build({ specs: [{ kind: 'lesson', key: 'id' }], user: EXT, params: { id: 'abc' } });
    await expect(t.guard.canActivate(t.ctx)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lê o id do corpo quando from=body', async () => {
    const t = build({
      specs: [{ kind: 'course', key: 'courseId', from: 'body' }],
      user: EXT,
      body: { courseId: 4 },
      ownsCourse: true,
    });
    await expect(t.guard.canActivate(t.ctx)).resolves.toBe(true);
    expect(t.prisma.course.findFirst.mock.calls[0][0].where.id).toBe(4);
  });

  it('vários âmbitos: todos têm de passar (ex.: mover lição para módulo de outro curso)', async () => {
    const t = build({
      specs: [
        { kind: 'lesson', key: 'id' },
        { kind: 'module', key: 'targetModuleId', from: 'body' },
      ],
      user: EXT,
      params: { id: '5' },
      body: { targetModuleId: 8 },
      lookups: { lesson: { module: { courseId: 3 } }, courseModule: { courseId: 99 } },
    });
    t.prisma.course.findFirst.mockImplementation(async (a: { where: { id: number } }) =>
      a.where.id === 3 ? { id: 3 } : null,
    );
    await expect(t.guard.canActivate(t.ctx)).rejects.toBeInstanceOf(NotFoundException);
  });
});
