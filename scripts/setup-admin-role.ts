import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);

async function main() {
  const role = await prisma.role.upsert({
    where: { name: 'ADMIN' },
    update: {},
    create: { name: 'ADMIN', code: 'ADMIN', description: 'Administrador' },
  });
  console.log('Role ADMIN:', role.id);

  const updated = await prisma.user.update({
    where: { email: 'admin@innova.com' },
    data: { roleId: role.id },
  });
  console.log('Admin actualizado:', updated.email, 'roleId:', updated.roleId);
  await prisma.$disconnect();
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
