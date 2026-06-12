// test/database/migrations.test.ts
// Testes de migrations — BD innova_test (nunca innova)
import * as fs from 'fs';
import * as path from 'path';
import { createTestDb, closeTestDb, TestDb } from './prisma-test-client';

describe('Database Migrations', () => {
  let db: TestDb;

  beforeAll(async () => {
    db = createTestDb();
    await db.prisma.$connect();
  });

  afterAll(async () => {
    await closeTestDb(db);
  });

  it('todas as migrations estão aplicadas', async () => {
    // Compara prisma/migrations com a tabela _prisma_migrations da BD
    // (equivalente ao `prisma migrate status`, sem spawn do CLI)
    const migrationsDir = path.join(process.cwd(), 'prisma', 'migrations');
    const localMigrations = fs
      .readdirSync(migrationsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    expect(localMigrations.length).toBeGreaterThan(0);

    const applied = (await db.prisma.$queryRaw`
      SELECT migration_name, finished_at, rolled_back_at
      FROM "_prisma_migrations"
    `) as any[];

    // Nenhuma migration em estado falhado (iniciada mas nunca terminada)
    const failed = applied.filter(
      (m: any) => !m.finished_at && !m.rolled_back_at,
    );
    expect(failed).toHaveLength(0);

    // Todas as migrations locais estão aplicadas na BD
    const appliedNames = applied
      .filter((m: any) => m.finished_at)
      .map((m: any) => m.migration_name);
    for (const local of localMigrations) {
      if (!appliedNames.includes(local)) {
        console.error(`❌ Migration não aplicada: ${local}`);
      }
      expect(appliedNames).toContain(local);
    }
  });

  it('tabelas críticas existem na BD', async () => {
    const tables = (await db.prisma.$queryRaw`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `) as any[];

    const tableNames = tables.map((t: any) => t.tablename);

    const requiredTables = [
      'User',
      'Course',
      'Enrollment',
      'Lesson',
      'AuditLog',
      'NotificationLog',
      'attendance_records', // REGRA: AttendanceRecord (não Attendance) — @@map("attendance_records")
      'BadgeAward', // REGRA: badgeAward (não badge)
      'LegacyPdi', // REGRA: legacyPdi (não pdi)
      'Role',
      'Department',
    ];

    for (const table of requiredTables) {
      const exists = tableNames.some(
        (t: string) => t.toLowerCase() === table.toLowerCase(),
      );
      if (!exists) {
        console.error(`❌ Tabela em falta: ${table}`);
      }
      expect(exists).toBe(true);
    }
  });

  it('índices críticos existem', async () => {
    const indexes = (await db.prisma.$queryRaw`
      SELECT indexname, tablename
      FROM pg_indexes
      WHERE schemaname = 'public'
    `) as any[];

    const indexNames = indexes.map((i: any) => i.indexname.toLowerCase());

    // Índices essenciais: email único (login) e compound unique do Enrollment
    expect(indexNames).toContain('user_email_key');
    expect(indexNames).toContain('enrollment_courseid_userid_key');

    console.log(`Total de índices encontrados: ${indexNames.length}`);
    expect(indexNames.length).toBeGreaterThan(5);
  });

  it('colunas com regras INNOVA existem com o nome correcto', async () => {
    const columns = (await db.prisma.$queryRaw`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (
          (table_name = 'User' AND column_name IN ('fullName', 'name')) OR
          (table_name = 'AuditLog' AND column_name IN ('entity', 'entityType')) OR
          (table_name = 'Lesson' AND column_name IN ('textContent', 'content')) OR
          (table_name = 'NotificationLog' AND column_name = 'metadata')
        )
    `) as any[];

    const has = (table: string, column: string) =>
      columns.some(
        (c: any) => c.table_name === table && c.column_name === column,
      );

    // REGRA: fullName (nunca name) no User
    expect(has('User', 'fullName')).toBe(true);
    expect(has('User', 'name')).toBe(false);

    // REGRA: entity (nunca entityType) no AuditLog
    expect(has('AuditLog', 'entity')).toBe(true);
    expect(has('AuditLog', 'entityType')).toBe(false);

    // REGRA: textContent (nunca content) nas Lesson — a coluna legacy
    // `content` ainda existe na BD, mas o código deve usar textContent
    expect(has('Lesson', 'textContent')).toBe(true);

    // REGRA: NotificationLog.metadata existe (String → JSON.stringify)
    expect(has('NotificationLog', 'metadata')).toBe(true);
  });

  it('unique index compound courseId_userId existe no Enrollment', async () => {
    // Prisma cria @@unique como CREATE UNIQUE INDEX (não constraint)
    const uniqueIndexes = (await db.prisma.$queryRaw`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'Enrollment'
        AND indexdef ILIKE '%UNIQUE%'
    `) as any[];

    const hasCompound = uniqueIndexes.some(
      (i: any) =>
        i.indexdef.includes('courseId') && i.indexdef.includes('userId'),
    );
    expect(hasCompound).toBe(true);
  });
});
