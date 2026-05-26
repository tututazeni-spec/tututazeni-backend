import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false,
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);

async function main() {
  console.log('🌱 A iniciar seed...');

  // 1. Criar roles necessárias
  const roleNames = ['ADMIN', 'RH', 'GESTOR', 'COLABORADOR'];
  const roleMap: Record<string, any> = {};

  for (const name of roleNames) {
    const role = await prisma.role.upsert({
      where: { name },
      update: {},
      create: { name, code: name },
    });
    roleMap[name] = role;
  }
  console.log('✅ Roles criadas:', roleNames.join(', '));

  // 2. Criar / actualizar utilizador admin com role ADMIN
  const adminPassword = await bcrypt.hash('Admin@1234', 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@innova.com' },
    update: { roleId: roleMap['ADMIN'].id },
    create: {
      fullName: 'Administrador',
      email: 'admin@innova.com',
      password: adminPassword,
      active: true,
      roleId: roleMap['ADMIN'].id,
    },
  });
  console.log('✅ Admin criado/actualizado:', admin.email, '→ role ADMIN');

  // 3. Criar utilizador employee para testes Bruno
  const employeePassword = await bcrypt.hash('Employee@1234', 10);
  const employee = await prisma.user.upsert({
    where: { email: 'test.employee@innova-test.com' },
    update: { roleId: roleMap['COLABORADOR'].id },
    create: {
      fullName: 'Test Employee',
      email: 'test.employee@innova-test.com',
      password: employeePassword,
      active: true,
      roleId: roleMap['COLABORADOR'].id,
    },
  });
  console.log('✅ Employee criado/actualizado:', employee.email, '→ role COLABORADOR');

  console.log('🎉 Seed concluído!');
}

main()
  .catch((e) => {
    console.error('❌ Erro:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
