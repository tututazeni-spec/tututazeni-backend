// test/database/query-performance.test.ts
// Testes de performance de queries — BD innova_test (nunca innova)
import { createTestDb, closeTestDb, TestDb } from './prisma-test-client';

const SLOW_QUERY_THRESHOLD_MS = 100; // queries acima de 100ms são lentas

describe('Database Query Performance', () => {
  let db: TestDb;

  beforeAll(async () => {
    db = createTestDb();
    await db.prisma.$connect();
    // Warmup: estabelece ligação e compila o engine antes de medir
    await db.prisma.$queryRaw`SELECT 1`;
  });

  afterAll(async () => {
    await closeTestDb(db);
  });

  // ─── USER QUERIES ────────────────────────────────────────

  describe('User queries', () => {
    it('findMany users deve ser rápido', async () => {
      const start = Date.now();

      // REGRA: fullName (não name)
      await db.prisma.user.findMany({
        select: {
          id: true,
          fullName: true,
          email: true,
        },
        take: 100,
      });

      const duration = Date.now() - start;
      console.log(`findMany users: ${duration}ms`);
      expect(duration).toBeLessThan(SLOW_QUERY_THRESHOLD_MS);
    });

    it('findUnique user por email deve ser rápido', async () => {
      const start = Date.now();

      await db.prisma.user.findUnique({
        where: { email: 'int.rh@innova-test.com' },
      });

      const duration = Date.now() - start;
      console.log(`findUnique user by email: ${duration}ms`);
      expect(duration).toBeLessThan(SLOW_QUERY_THRESHOLD_MS);
    });

    it('findMany users por departamento deve ser rápido', async () => {
      const department = await db.prisma.department.findFirst();
      const departmentId = department ? department.id : -1;

      const start = Date.now();

      await db.prisma.user.findMany({
        where: { departmentId },
        select: { id: true, fullName: true },
      });

      const duration = Date.now() - start;
      console.log(`findMany users by department: ${duration}ms`);
      expect(duration).toBeLessThan(SLOW_QUERY_THRESHOLD_MS);
    });

    it('findMany users activos deve ser rápido', async () => {
      const start = Date.now();

      // Schema real: campo active (não isActive)
      await db.prisma.user.findMany({
        where: { active: true },
        select: { id: true, fullName: true },
        take: 100,
      });

      const duration = Date.now() - start;
      console.log(`findMany active users: ${duration}ms`);
      expect(duration).toBeLessThan(SLOW_QUERY_THRESHOLD_MS);
    });
  });

  // ─── ENROLLMENT QUERIES ───────────────────────────────────

  describe('Enrollment queries', () => {
    it('findMany enrollments por userId deve ser rápido', async () => {
      const user = await db.prisma.user.findFirst();
      const userId = user ? user.id : -1;

      const start = Date.now();

      await db.prisma.enrollment.findMany({
        where: { userId },
        include: { course: true },
      });

      const duration = Date.now() - start;
      console.log(`findMany enrollments by userId: ${duration}ms`);
      expect(duration).toBeLessThan(SLOW_QUERY_THRESHOLD_MS);
    });

    it('findUnique enrollment por compound key deve ser rápido', async () => {
      const enrollment = await db.prisma.enrollment.findFirst();
      const courseId = enrollment ? enrollment.courseId : -1;
      const userId = enrollment ? enrollment.userId : -1;

      const start = Date.now();

      // REGRA: compound unique [courseId, userId] → courseId_userId
      await db.prisma.enrollment.findUnique({
        where: {
          courseId_userId: { courseId, userId },
        },
      });

      const duration = Date.now() - start;
      console.log(`findUnique enrollment compound key: ${duration}ms`);
      expect(duration).toBeLessThan(SLOW_QUERY_THRESHOLD_MS);
    });

    it('findMany enrollments por status deve ser rápido', async () => {
      const start = Date.now();

      await db.prisma.enrollment.findMany({
        where: { status: 'IN_PROGRESS' },
        take: 50,
      });

      const duration = Date.now() - start;
      console.log(`findMany enrollments by status: ${duration}ms`);
      expect(duration).toBeLessThan(SLOW_QUERY_THRESHOLD_MS);
    });
  });

  // ─── COURSE QUERIES ───────────────────────────────────────

  describe('Course queries', () => {
    it('findMany cursos publicados deve ser rápido', async () => {
      const start = Date.now();

      // Schema real: Course usa status (não isActive)
      await db.prisma.course.findMany({
        where: { status: 'PUBLISHED' },
        take: 50,
      });

      const duration = Date.now() - start;
      console.log(`findMany published courses: ${duration}ms`);
      expect(duration).toBeLessThan(SLOW_QUERY_THRESHOLD_MS);
    });
  });

  // ─── AUDIT LOG QUERIES ────────────────────────────────────

  describe('AuditLog queries', () => {
    it('findMany auditLog por entity deve ser rápido', async () => {
      const start = Date.now();

      // REGRA: campo entity (não entityType)
      await db.prisma.auditLog.findMany({
        where: { entity: 'User' },
        take: 50,
        orderBy: { createdAt: 'desc' },
      });

      const duration = Date.now() - start;
      console.log(`findMany auditLog by entity: ${duration}ms`);
      expect(duration).toBeLessThan(SLOW_QUERY_THRESHOLD_MS);
    });

    it('findMany auditLog ordenado por createdAt deve ser rápido', async () => {
      const start = Date.now();

      await db.prisma.auditLog.findMany({
        take: 50,
        orderBy: { createdAt: 'desc' },
      });

      const duration = Date.now() - start;
      console.log(`findMany auditLog by createdAt: ${duration}ms`);
      expect(duration).toBeLessThan(SLOW_QUERY_THRESHOLD_MS);
    });
  });

  // ─── NOTIFICATION QUERIES ─────────────────────────────────

  describe('NotificationLog queries', () => {
    it('findMany notifications por userId deve ser rápido', async () => {
      const user = await db.prisma.user.findFirst();
      const userId = user ? user.id : -1;

      const start = Date.now();

      await db.prisma.notificationLog.findMany({
        where: { userId },
        take: 20,
        orderBy: { createdAt: 'desc' },
      });

      const duration = Date.now() - start;
      console.log(`findMany notifications by userId: ${duration}ms`);
      expect(duration).toBeLessThan(SLOW_QUERY_THRESHOLD_MS);
    });

    it('findMany notifications não lidas deve ser rápido', async () => {
      const start = Date.now();

      // Schema real: campo read (não isRead)
      await db.prisma.notificationLog.findMany({
        where: { read: false },
        take: 20,
      });

      const duration = Date.now() - start;
      console.log(`findMany unread notifications: ${duration}ms`);
      expect(duration).toBeLessThan(SLOW_QUERY_THRESHOLD_MS);
    });
  });

  // ─── LEGACY PDI / BADGE AWARD QUERIES ─────────────────────

  describe('LegacyPdi e BadgeAward queries', () => {
    it('findMany legacyPdi por employeeId deve ser rápido', async () => {
      const start = Date.now();

      // REGRA: modelo legacyPdi (não pdi); schema real usa employeeId
      await db.prisma.legacyPdi.findMany({
        where: { employeeId: -1 },
        take: 20,
      });

      const duration = Date.now() - start;
      console.log(`findMany legacyPdi by employeeId: ${duration}ms`);
      expect(duration).toBeLessThan(SLOW_QUERY_THRESHOLD_MS);
    });

    it('findMany badgeAwards por userId deve ser rápido', async () => {
      const start = Date.now();

      // REGRA: modelo badgeAward (não badge) para prémios por utilizador
      await db.prisma.badgeAward.findMany({
        where: { userId: -1 },
        take: 20,
      });

      const duration = Date.now() - start;
      console.log(`findMany badgeAwards by userId: ${duration}ms`);
      expect(duration).toBeLessThan(SLOW_QUERY_THRESHOLD_MS);
    });
  });

  // ─── ATTENDANCE QUERIES ───────────────────────────────────

  describe('AttendanceRecord queries', () => {
    it('findMany attendanceRecords por userId e date deve ser rápido', async () => {
      const start = Date.now();

      // REGRA: modelo AttendanceRecord (não Attendance)
      await db.prisma.attendanceRecord.findMany({
        where: { userId: -1, date: new Date('2026-01-01') },
        take: 20,
      });

      const duration = Date.now() - start;
      console.log(`findMany attendanceRecords by userId+date: ${duration}ms`);
      expect(duration).toBeLessThan(SLOW_QUERY_THRESHOLD_MS);
    });
  });
});
