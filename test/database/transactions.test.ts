// test/database/transactions.test.ts
// Testes de transacções e rollbacks — BD innova_test (nunca innova)
import * as bcrypt from 'bcrypt';
import { createTestDb, closeTestDb, TestDb } from './prisma-test-client';

const ROLLBACK_EMAIL = 'transaction.test@innova-test.com';
const SUCCESS_EMAIL = 'transaction.success@innova-test.com';
const ENROLL_EMAIL = 'transaction.enroll@innova-test.com';

describe('Database Transactions', () => {
  let db: TestDb;

  beforeAll(async () => {
    db = createTestDb();
    await db.prisma.$connect();
    // Garante estado limpo de execuções anteriores
    await db.prisma.user.deleteMany({
      where: { email: { in: [ROLLBACK_EMAIL, SUCCESS_EMAIL, ENROLL_EMAIL] } },
    });
  });

  afterAll(async () => {
    await db.prisma.user.deleteMany({
      where: { email: { in: [ROLLBACK_EMAIL, SUCCESS_EMAIL, ENROLL_EMAIL] } },
    });
    await closeTestDb(db);
  });

  it('transacção com rollback funciona correctamente', async () => {
    await expect(
      db.prisma.$transaction(async (tx) => {
        // REGRA: fullName (não name); schema real: active (não isActive)
        await tx.user.create({
          data: {
            email: ROLLBACK_EMAIL,
            fullName: 'Transacção Teste',
            password: await bcrypt.hash('Test@1234', 10),
            active: true,
          },
        });

        // Força um erro para testar o rollback
        throw new Error('Rollback intencional para teste');
      }),
    ).rejects.toThrow('Rollback intencional');

    // Verifica que o user NÃO foi criado (rollback)
    const user = await db.prisma.user.findUnique({
      where: { email: ROLLBACK_EMAIL },
    });
    expect(user).toBeNull();
  });

  it('transacção com sucesso persiste os dados', async () => {
    // Cria role e department próprios (BD de teste pode estar vazia)
    const role = await db.prisma.role.upsert({
      where: { code: 'DB-TEST-ROLE' },
      update: {},
      create: { code: 'DB-TEST-ROLE', name: 'DB Test Role' },
    });
    const dept = await db.prisma.department.upsert({
      where: { code: 'DEPT-DB-TEST' },
      update: {},
      create: { code: 'DEPT-DB-TEST', name: 'Dept DB Test' },
    });

    await db.prisma.$transaction(async (tx) => {
      await tx.user.upsert({
        where: { email: SUCCESS_EMAIL },
        update: {},
        create: {
          email: SUCCESS_EMAIL,
          fullName: 'Transacção Sucesso',
          password: await bcrypt.hash('Test@1234', 10),
          roleId: role.id,
          departmentId: dept.id,
          active: true,
        },
      });
    });

    const user = await db.prisma.user.findUnique({
      where: { email: SUCCESS_EMAIL },
    });
    expect(user).not.toBeNull();
    expect(user?.fullName).toBe('Transacção Sucesso');
    expect(user?.roleId).toBe(role.id);

    // Limpeza
    await db.prisma.user.delete({ where: { email: SUCCESS_EMAIL } });
  });

  it('violação de FK dentro da transacção faz rollback de tudo', async () => {
    await expect(
      db.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email: ENROLL_EMAIL,
            fullName: 'Transacção Enroll',
            password: await bcrypt.hash('Test@1234', 10),
            active: true,
          },
        });

        // courseId inexistente → violação de FK → rollback total
        await tx.enrollment.create({
          data: {
            courseId: -999999,
            userId: user.id,
          },
        });
      }),
    ).rejects.toThrow();

    // O user criado antes da violação também não pode existir
    const user = await db.prisma.user.findUnique({
      where: { email: ENROLL_EMAIL },
    });
    expect(user).toBeNull();
  });

  it('violação do compound unique courseId_userId é rejeitada', async () => {
    // REGRA: compound unique [courseId, userId]
    const role = await db.prisma.role.upsert({
      where: { code: 'DB-TEST-ROLE' },
      update: {},
      create: { code: 'DB-TEST-ROLE', name: 'DB Test Role' },
    });

    const user = await db.prisma.user.create({
      data: {
        email: ENROLL_EMAIL,
        fullName: 'Transacção Enroll',
        password: await bcrypt.hash('Test@1234', 10),
        roleId: role.id,
        active: true,
      },
    });

    const course = await db.prisma.course.upsert({
      where: { internalCode: 'DB-TEST-COURSE-001' },
      update: {},
      create: {
        title: 'Curso DB Test',
        internalCode: 'DB-TEST-COURSE-001',
        description: 'Curso para testes de BD',
        status: 'PUBLISHED',
      },
    });

    await db.prisma.enrollment.create({
      data: { courseId: course.id, userId: user.id },
    });

    // Segunda inscrição idêntica deve violar o @@unique([courseId, userId])
    await expect(
      db.prisma.enrollment.create({
        data: { courseId: course.id, userId: user.id },
      }),
    ).rejects.toThrow();

    // Limpeza (ordem respeita FKs: enrollment → user → course)
    await db.prisma.enrollment.deleteMany({ where: { userId: user.id } });
    await db.prisma.user.delete({ where: { id: user.id } });
    await db.prisma.course.delete({ where: { id: course.id } });
  });
});
