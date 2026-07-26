// Semeia as permissões built-in do ACL (idempotente — cria só as que faltam).
// Substitui o antigo endpoint HTTP POST /acl/seed-permissions, removido para
// reduzir a superfície administrativa exposta em produção.

import * as dotenv from 'dotenv';
dotenv.config();

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { BUILTIN_PERMISSIONS } from '../src/acl/acl.service';

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) } as any);

  // Permission.roleId é obrigatório no schema (resquício de um design anterior
  // à relação many-to-many via RolePermission, que é a que o ACL usa de facto
  // — ver assignPermissionToRole/revokePermissionFromRole). ADMIN é o dono
  // lógico de todas as permissões built-in (wildcard em getUserPermissions).
  const adminRole = await prisma.role.findFirst({ where: { name: 'ADMIN' } });
  if (!adminRole) {
    throw new Error("Role 'ADMIN' não encontrado — corre o seed principal primeiro (npm run db:seed)");
  }

  const created: string[] = [];
  for (const p of BUILTIN_PERMISSIONS) {
    const existing = await prisma.permission.findFirst({ where: { name: p.name } });
    if (!existing) {
      await prisma.permission.create({
        data: { name: p.name, action: p.action, subject: p.subject, roleId: adminRole.id },
      });
      created.push(p.name);
    }
  }

  console.log(`✅ ${created.length} permissões criadas`, created);
  await prisma.$disconnect();
  await pool.end();
}

main().catch(e => {
  console.error('❌ Erro ao semear permissões ACL:', e);
  process.exit(1);
});
