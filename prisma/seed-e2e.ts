// prisma/seed-e2e.ts
// Cria utilizadores E2E na BD principal (innova_dev) para testes Playwright.
// Seguro de correr múltiplas vezes (upsert). NÃO usar em produção.

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';

const DB_URL = process.env.DATABASE_URL || 'postgresql://postgres:Placido*7@127.0.0.1:5432/innova_dev';

async function main() {
  const pool = new Pool({ connectionString: DB_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);

  console.log('🌱 A criar utilizadores E2E em:', DB_URL.replace(/:[^:@]+@/, ':***@'));

  const password = await bcrypt.hash('Test@1234', 10);

  const roleEntries = [
    { code: 'ADMIN', name: 'ADMIN' },
    { code: 'RH', name: 'RH' },
    { code: 'GESTOR', name: 'GESTOR' },
    { code: 'COLABORADOR', name: 'COLABORADOR' },
  ];
  const roleRecords: Record<string, any> = {};

  for (const r of roleEntries) {
    // upsert by name (@unique) — code is nullable so may not exist in existing rows
    const role = await prisma.role.upsert({
      where: { name: r.name },
      update: { code: r.code },
      create: { code: r.code, name: r.name },
    });
    roleRecords[r.code] = role;
  }

  let department = await prisma.department.findFirst({ where: { code: 'DEPT-INT-TEST' } });
  if (!department) {
    department = await prisma.department.create({
      data: { code: 'DEPT-INT-TEST', name: 'Dept E2E Teste' },
    });
  }

  const users = [
    { email: 'int.employee@innova-test.com', fullName: 'Employee Int', roleCode: 'COLABORADOR' },
    { email: 'int.manager@innova-test.com',  fullName: 'Manager Int',  roleCode: 'GESTOR' },
    { email: 'int.rh@innova-test.com',       fullName: 'RH Int',       roleCode: 'RH' },
    { email: 'int.admin@innova-test.com',     fullName: 'Admin Int',    roleCode: 'ADMIN' },
  ];

  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: { password, active: true },
      create: {
        email: u.email,
        fullName: u.fullName,
        password,
        roleId: roleRecords[u.roleCode].id,
        departmentId: department.id,
        active: true,
      },
    });
    console.log(`  ✅ ${u.email}`);
  }

  await prisma.$disconnect();
  await pool.end();
  console.log('✅ Utilizadores E2E criados com sucesso');
}

main().catch((e) => { console.error('❌', e); process.exit(1); });
