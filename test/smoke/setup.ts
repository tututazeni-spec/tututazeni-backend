// Setup da suite de regressão (regra 8).
// SMOKE_SEED=false (modo pós-deploy) → não toca na BD.
// Caso contrário: migrate deploy tolerante + seed idempotente + limpa a
// matrícula usada pelo teste de escrita + grava o courseId para a suite.
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';

const TEST_DB_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:Placido*7@127.0.0.1:5432/innova_test';

const SEED_STATE_FILE = path.join(__dirname, '.seed-state.json');

export default async function globalSetup() {
  if (process.env.SMOKE_SEED === 'false') {
    console.log('\n🔧 Smoke setup: SMOKE_SEED=false — sem seed (modo pós-deploy)');
    return;
  }

  console.log('\n🔧 Smoke setup — a preparar BD de teste...');
  process.env.DATABASE_URL = TEST_DB_URL;

  try {
    execSync('npx prisma migrate deploy', { env: { ...process.env }, stdio: 'pipe' });
  } catch {
    console.log('ℹ️  migrate deploy skipped (já aplicado ou BD indisponível)');
  }

  const pool = new Pool({ connectionString: TEST_DB_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) } as any);
  const password = await bcrypt.hash('Test@1234', 10);

  const roleEntries = [
    { code: 'RH', name: 'RH' },
    { code: 'COLABORADOR', name: 'COLABORADOR' },
  ];
  const roleRecords: Record<string, any> = {};
  for (const r of roleEntries) {
    roleRecords[r.code] = await prisma.role.upsert({
      where: { code: r.code },
      update: {},
      create: { code: r.code, name: r.name },
    });
  }

  const department = await prisma.department.upsert({
    where: { code: 'DEPT-SMOKE' },
    update: {},
    create: { code: 'DEPT-SMOKE', name: 'Dept Smoke Teste' },
  });

  const users = [
    {
      email: 'smoke.employee@innova-test.com',
      fullName: 'Employee Smoke',
      roleCode: 'COLABORADOR',
    },
    { email: 'smoke.rh@innova-test.com', fullName: 'RH Smoke', roleCode: 'RH' },
  ];
  const userRecords: Record<string, any> = {};
  for (const u of users) {
    userRecords[u.roleCode] = await prisma.user.upsert({
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

  const course = await prisma.course.upsert({
    where: { internalCode: 'SMOKE-001' },
    update: {},
    create: {
      title: 'Curso Smoke Teste',
      internalCode: 'SMOKE-001',
      description: 'Curso para a suite de regressão de fluxos críticos',
      status: 'PUBLISHED',
    },
  });

  // O teste de escrita faz POST /courses/:id/enroll e espera 201 na primeira e
  // 409 na repetida — remover matrículas antigas torna-o determinístico.
  await prisma.enrollment.deleteMany({
    where: { userId: userRecords['COLABORADOR'].id, courseId: course.id },
  });

  fs.writeFileSync(SEED_STATE_FILE, JSON.stringify({ courseId: course.id }));

  await prisma.$disconnect();
  await pool.end();
  console.log('✅ BD de teste preparada para a regressão\n');
}
