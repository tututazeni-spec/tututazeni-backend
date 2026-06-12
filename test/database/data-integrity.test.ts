// test/database/data-integrity.test.ts
// Testes de integridade dos dados — BD innova_test (nunca innova)
import { createTestDb, closeTestDb, TestDb } from './prisma-test-client';

describe('Database Data Integrity', () => {
  let db: TestDb;

  beforeAll(async () => {
    db = createTestDb();
    await db.prisma.$connect();
  });

  afterAll(async () => {
    await closeTestDb(db);
  });

  // ─── FOREIGN KEYS ─────────────────────────────────────────

  describe('Foreign Keys', () => {
    it('todos os users activos têm role válida', async () => {
      // Schema real: roleId é nullable e campo de estado é active (não isActive)
      const usersWithoutRole = await db.prisma.user.findMany({
        where: { roleId: null, active: true },
        select: { id: true, email: true },
      });
      expect(usersWithoutRole).toHaveLength(0);
    });

    it('todos os enrollments têm course válido', async () => {
      const orphanEnrollments = await db.prisma.$queryRaw`
        SELECT e.id FROM "Enrollment" e
        LEFT JOIN "Course" c ON e."courseId" = c.id
        WHERE c.id IS NULL
      `;
      expect((orphanEnrollments as any[]).length).toBe(0);
    });

    it('todos os enrollments têm user válido', async () => {
      const orphanEnrollments = await db.prisma.$queryRaw`
        SELECT e.id FROM "Enrollment" e
        LEFT JOIN "User" u ON e."userId" = u.id
        WHERE u.id IS NULL
      `;
      expect((orphanEnrollments as any[]).length).toBe(0);
    });

    it('todos os badgeAwards têm user válido', async () => {
      // REGRA: modelo badgeAward (não badge)
      const orphanAwards = await db.prisma.$queryRaw`
        SELECT b.id FROM "BadgeAward" b
        LEFT JOIN "User" u ON b."userId" = u.id
        WHERE u.id IS NULL
      `;
      expect((orphanAwards as any[]).length).toBe(0);
    });

    it('todos os legacyPdi têm employee válido', async () => {
      // REGRA: modelo legacyPdi (não pdi); FK real é employeeId
      const orphanPdis = await db.prisma.$queryRaw`
        SELECT p.id FROM "LegacyPdi" p
        LEFT JOIN "Employee" e ON p."employeeId" = e.id
        WHERE e.id IS NULL
      `;
      expect((orphanPdis as any[]).length).toBe(0);
    });

    it('todos os attendanceRecords têm user válido', async () => {
      // REGRA: modelo AttendanceRecord (não Attendance) — @@map("attendance_records")
      const orphanRecords = await db.prisma.$queryRaw`
        SELECT a.id FROM "attendance_records" a
        LEFT JOIN "User" u ON a."userId" = u.id
        WHERE u.id IS NULL
      `;
      expect((orphanRecords as any[]).length).toBe(0);
    });
  });

  // ─── UNIQUE CONSTRAINTS ────────────────────────────────────

  describe('Unique Constraints', () => {
    it('não existem emails duplicados', async () => {
      const duplicates = await db.prisma.$queryRaw`
        SELECT email, COUNT(*) as count
        FROM "User"
        GROUP BY email
        HAVING COUNT(*) > 1
      `;
      expect((duplicates as any[]).length).toBe(0);
    });

    it('não existem enrollments duplicados (courseId_userId)', async () => {
      // REGRA: compound unique [courseId, userId]
      const duplicates = await db.prisma.$queryRaw`
        SELECT "courseId", "userId", COUNT(*) as count
        FROM "Enrollment"
        GROUP BY "courseId", "userId"
        HAVING COUNT(*) > 1
      `;
      expect((duplicates as any[]).length).toBe(0);
    });

    it('não existem attendanceRecords duplicados (userId, date, context)', async () => {
      const duplicates = await db.prisma.$queryRaw`
        SELECT "userId", "date", "context", COUNT(*) as count
        FROM "attendance_records"
        GROUP BY "userId", "date", "context"
        HAVING COUNT(*) > 1
      `;
      expect((duplicates as any[]).length).toBe(0);
    });
  });

  // ─── CAMPO fullName ────────────────────────────────────────

  describe('Campo fullName', () => {
    it('todos os users têm fullName preenchido', async () => {
      // REGRA: fullName (não name) — no schema é String non-nullable,
      // por isso só é possível existir string vazia, nunca null
      const usersWithoutName = await db.prisma.user.findMany({
        where: { fullName: '' },
        select: { id: true, email: true },
      });
      expect(usersWithoutName).toHaveLength(0);
    });
  });

  // ─── NOTIFICATIONLOG METADATA ──────────────────────────────

  describe('NotificationLog metadata', () => {
    it('metadata é sempre string JSON válida', async () => {
      // REGRA: metadata é String? → escrito sempre com JSON.stringify()
      const notifications = await db.prisma.notificationLog.findMany({
        where: { metadata: { not: null } },
        take: 50,
      });

      for (const notif of notifications) {
        if (notif.metadata) {
          expect(() => JSON.parse(notif.metadata!)).not.toThrow();
        }
      }
    });
  });

  // ─── AUDITLOG CAMPO ENTITY ─────────────────────────────────

  describe('AuditLog campo entity', () => {
    it('auditLog tem campo entity preenchido', async () => {
      // REGRA: campo entity (não entityType) — non-nullable no schema,
      // por isso só é possível existir string vazia, nunca null
      const logsWithoutEntity = await db.prisma.auditLog.findMany({
        where: { entity: '' },
        select: { id: true },
      });
      expect(logsWithoutEntity).toHaveLength(0);
    });
  });

  // ─── VALORES DE PROGRESSO ──────────────────────────────────

  describe('Valores de progresso', () => {
    it('progress dos enrollments está entre 0 e 100', async () => {
      const invalid = await db.prisma.enrollment.findMany({
        where: {
          OR: [{ progress: { lt: 0 } }, { progress: { gt: 100 } }],
        },
        select: { id: true, progress: true },
      });
      expect(invalid).toHaveLength(0);
    });

    it('progressPercent dos legacyPdi está entre 0 e 100', async () => {
      const invalid = await db.prisma.legacyPdi.findMany({
        where: {
          OR: [
            { progressPercent: { lt: 0 } },
            { progressPercent: { gt: 100 } },
          ],
        },
        select: { id: true, progressPercent: true },
      });
      expect(invalid).toHaveLength(0);
    });
  });
});
