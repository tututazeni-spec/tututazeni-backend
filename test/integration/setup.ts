import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';

const TEST_DB_URL = 'postgresql://postgres:Placido*7@127.0.0.1:5432/innova_test';

// Must set before globalSetup logic runs
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = TEST_DB_URL;
process.env.JWT_SECRET = 'test-secret-key-innova-2024';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-innova-2024';
process.env.JWT_EXPIRES_IN = '1h';

function createPrisma() {
  const pool = new Pool({ connectionString: TEST_DB_URL });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter } as any);
}

export default async function globalSetup() {
  console.log('\n🔧 Setup integração — a preparar BD de teste...');

  try {
    execSync('npx prisma migrate deploy', {
      env: { ...process.env },
      stdio: 'pipe',
    });
  } catch {
    // Migrations may already be applied or DB temporarily unreachable — continue
    console.log('ℹ️  migrate deploy skipped (already up to date)');
  }

  const prisma = createPrisma();
  const password = await bcrypt.hash('Test@1234', 10);

  // Roles — RolesGuard checks user.role.name
  const roleEntries = [
    { code: 'ADMIN', name: 'ADMIN' },
    { code: 'RH', name: 'RH' },
    { code: 'GESTOR', name: 'GESTOR' },
    { code: 'COLABORADOR', name: 'COLABORADOR' },
  ];
  const roleRecords: Record<string, any> = {};

  for (const r of roleEntries) {
    const role = await prisma.role.upsert({
      where: { code: r.code },
      update: {},
      create: { code: r.code, name: r.name },
    });
    roleRecords[r.code] = role;
  }

  // Department — unique by code (not name)
  const department = await prisma.department.upsert({
    where: { code: 'DEPT-INT-TEST' },
    update: {},
    create: { code: 'DEPT-INT-TEST', name: 'Dept Integração Teste' },
  });

  // Users — fullName (never name), active (never isActive)
  const users = [
    { email: 'int.employee@innova-test.com', fullName: 'Employee Int', roleCode: 'COLABORADOR' },
    { email: 'int.manager@innova-test.com', fullName: 'Manager Int', roleCode: 'GESTOR' },
    { email: 'int.rh@innova-test.com', fullName: 'RH Int', roleCode: 'RH' },
    { email: 'int.admin@innova-test.com', fullName: 'Admin Int', roleCode: 'ADMIN' },
  ];

  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        email: u.email,
        fullName: u.fullName,
        password,
        roleId: roleRecords[u.roleCode].id,
        departmentId: department.id,
        active: true,
      },
    });
  }

  // Course — title not unique, use internalCode as unique key
  await prisma.course.upsert({
    where: { internalCode: 'INT-TEST-001' },
    update: {},
    create: {
      title: 'Curso Integração Teste',
      internalCode: 'INT-TEST-001',
      description: 'Curso para testes de integração',
      status: 'PUBLISHED',
    },
  });

  await prisma.$disconnect();
  console.log('✅ BD de teste preparada\n');
}
