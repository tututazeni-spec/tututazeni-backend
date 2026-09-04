import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';

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
  } catch (e: any) {
    // `migrate deploy` exits 0 (no throw) when there's simply nothing pending —
    // any throw here is a real problem (e.g. a previously failed migration
    // blocking new ones, per P3009) and must not be swallowed: doing so lets
    // the suite run against a stale/incomplete schema and fail confusingly
    // downstream instead of here, with a clear cause.
    console.error('❌ prisma migrate deploy falhou:');
    console.error(e.stdout?.toString?.() ?? e.stdout);
    console.error(e.stderr?.toString?.() ?? e.stderr);
    throw e;
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

  // Leave types — necessário para o Lote 1 (attendance), que corre antes do
  // Lote 5 (leave-management) e delega em LeaveManagementService.create()
  // desde a consolidação Fase B (docs/arquitetura-modular-analise.md §13).
  // `update` força reset a cada corrida do globalSetup (uma vez por lote) —
  // sem isto, uma BD de teste reutilizada entre execuções ia acumular saldo
  // gasto de corridas anteriores até ficar insuficiente (flakiness).
  const leaveTypesForTests: {
    code: string;
    name: string;
    category: string;
    isPaid: boolean;
    annualLimit?: number;
    countWorkDaysOnly: boolean;
  }[] = [
    {
      code: 'VACATION',
      name: 'Férias',
      category: 'STATUTORY',
      isPaid: true,
      annualLimit: 22,
      countWorkDaysOnly: true,
    },
    {
      code: 'SICK',
      name: 'Baixa Médica',
      category: 'MEDICAL',
      isPaid: true,
      countWorkDaysOnly: true,
    },
    {
      code: 'MATERNITY',
      name: 'Licença de Maternidade',
      category: 'FAMILY',
      isPaid: true,
      annualLimit: 120,
      countWorkDaysOnly: true,
    },
    {
      code: 'PATERNITY',
      name: 'Licença de Paternidade',
      category: 'FAMILY',
      isPaid: true,
      annualLimit: 28,
      countWorkDaysOnly: true,
    },
    {
      code: 'BEREAVEMENT',
      name: 'Luto',
      category: 'FAMILY',
      isPaid: true,
      annualLimit: 5,
      countWorkDaysOnly: true,
    },
    {
      code: 'TRAINING',
      name: 'Formação',
      category: 'TRAINING',
      isPaid: true,
      countWorkDaysOnly: true,
    },
    {
      code: 'JUSTIFIED_ABSENCE',
      name: 'Ausência Justificada',
      category: 'OTHER',
      isPaid: true,
      annualLimit: 6,
      countWorkDaysOnly: true,
    },
    {
      code: 'UNJUSTIFIED_ABSENCE',
      name: 'Ausência Injustificada',
      category: 'DISCIPLINARY',
      isPaid: false,
      countWorkDaysOnly: true,
    },
    {
      code: 'PUBLIC_DUTY',
      name: 'Dever Cívico',
      category: 'OTHER',
      isPaid: true,
      countWorkDaysOnly: true,
    },
    { code: 'OTHER', name: 'Outra', category: 'OTHER', isPaid: false, countWorkDaysOnly: true },
  ];

  for (const lt of leaveTypesForTests) {
    await prisma.leaveTypeConfig.upsert({
      where: { code: lt.code },
      update: {
        name: lt.name,
        category: lt.category,
        isPaid: lt.isPaid,
        annualLimit: lt.annualLimit ?? null,
        active: true,
      },
      create: { ...lt, active: true },
    });
  }

  // Saldo inicial de int.employee para os tipos com annualLimit — simula um
  // colaborador já onboardado (LeaveManagementService.initializeUserBalances
  // faria o mesmo). `update` reposiciona ao valor cheio a cada lote, para os
  // testes do Lote 1 (attendance) partirem sempre do mesmo estado.
  const employeeForBalances = await prisma.user.findUnique({
    where: { email: 'int.employee@innova-test.com' },
  });
  if (employeeForBalances) {
    for (const lt of leaveTypesForTests) {
      if (!lt.annualLimit) continue;
      await prisma.leaveBalance.upsert({
        where: {
          userId_leaveTypeCode: { userId: employeeForBalances.id, leaveTypeCode: lt.code },
        },
        update: { balance: lt.annualLimit, used: 0 },
        create: {
          userId: employeeForBalances.id,
          leaveTypeCode: lt.code,
          balance: lt.annualLimit,
          used: 0,
        },
      });
    }
  }

  await prisma.$disconnect();
  console.log('✅ BD de teste preparada\n');
}
