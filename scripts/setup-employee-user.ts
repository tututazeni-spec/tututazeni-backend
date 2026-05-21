import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);

async function main() {
  const role = await prisma.role.upsert({
    where: { name: 'COLABORADOR' },
    update: {},
    create: { name: 'COLABORADOR', code: 'COLABORADOR', description: 'Colaborador' },
  });

  const password = await bcrypt.hash('Employee@1234', 10);
  const user = await prisma.user.upsert({
    where: { email: 'test.employee@innova-test.com' },
    update: {},
    create: {
      fullName: 'Utilizador Employee Teste',
      email: 'test.employee@innova-test.com',
      password,
      roleId: role.id,
      active: true,
    },
  });

  console.log('Employee criado:', user.email, 'roleId:', user.roleId);
  await prisma.$disconnect();
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
