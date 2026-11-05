import { CoursesService } from './courses.service';

jest.mock('../common/helpers/notification.helper', () => ({
  createNotificationSafe: jest.fn(),
  notifyUsersSafe: jest.fn().mockResolvedValue(undefined),
}));
import { notifyUsersSafe } from '../common/helpers/notification.helper';

function build(course: Record<string, unknown> | null) {
  const prisma: any = {
    course: { findUnique: jest.fn().mockResolvedValue(course) },
    courseAudienceGroup: {
      findMany: jest.fn().mockResolvedValue([{ userIds: [1, 2, 3] }, { userIds: [3, 4] }]),
    },
    user: { findMany: jest.fn().mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]) },
    enrollment: {
      findMany: jest.fn().mockResolvedValue([{ userId: 2 }]),
      createMany: jest.fn().mockResolvedValue({ count: 2 }),
    },
    courseAnalytics: { updateMany: jest.fn() },
  };
  prisma.read = prisma;
  const svc: any = Object.create(CoursesService.prototype);
  svc.prisma = prisma;
  svc.logger = { warn: jest.fn() };
  return { svc: svc as CoursesService, prisma };
}

describe('CoursesService.enrollAudienceMembers', () => {
  const published = { id: 1, title: 'Curso', status: 'PUBLISHED', mandatory: true };

  it('matricula os membros activos dos grupos que ainda não têm matrícula', async () => {
    const { svc, prisma } = build(published);

    expect(await svc.enrollAudienceMembers(1)).toBe(2);
    expect(prisma.user.findMany.mock.calls[0][0].where).toEqual({
      id: { in: [1, 2, 3, 4] },
      accountStatus: 'ACTIVE',
    });
    expect(prisma.enrollment.createMany).toHaveBeenCalledWith({
      data: [
        { courseId: 1, userId: 1, status: 'NOT_STARTED', mandatory: true },
        { courseId: 1, userId: 3, status: 'NOT_STARTED', mandatory: true },
      ],
      skipDuplicates: true,
    });
    expect(prisma.courseAnalytics.updateMany).toHaveBeenCalledWith({
      where: { courseId: 1 },
      data: { totalEnrollments: { increment: 2 } },
    });
    expect(notifyUsersSafe).toHaveBeenCalled();
  });

  it('não matricula em cursos por publicar', async () => {
    const { svc, prisma } = build({ ...published, status: 'DRAFT' });
    expect(await svc.enrollAudienceMembers(1)).toBe(0);
    expect(prisma.enrollment.createMany).not.toHaveBeenCalled();
  });

  it('não notifica quando pedido (publicação já avisa)', async () => {
    (notifyUsersSafe as jest.Mock).mockClear();
    const { svc } = build(published);
    await svc.enrollAudienceMembers(1, { notify: false });
    expect(notifyUsersSafe).not.toHaveBeenCalled();
  });
});
