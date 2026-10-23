// Migração do convite por senha temporária para o convite por link de uso único.
// Contas PENDING que ainda não definiram senha (convite INVITE_SENT, passwordChangedAt nulo)
// ficam com a senha temporária antiga gravada e enviada por email em claro. Este script apaga
// essa senha e envia um novo convite (link de uso único).
//
//   npx ts-node scripts/reissue-pending-invites.ts          # dry-run: só lista
//   npx ts-node scripts/reissue-pending-invites.ts --apply  # apaga senhas + enfileira emails
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) } as any);

async function main() {
  const apply = process.argv.includes('--apply');
  const pending = await prisma.user.findMany({
    where: {
      accountStatus: 'PENDING',
      passwordChangedAt: null,
      password: { not: null },
      notificationLogs: { some: { type: 'INVITE_SENT' } },
    },
    select: { id: true, email: true, fullName: true },
  });
  console.log(`${pending.length} convite(s) pendente(s) com senha temporária.`);
  if (!apply) {
    pending.forEach(u => console.log(` - ${u.id} ${u.email}`));
    console.log('Dry-run. Use --apply para invalidar as senhas e reenviar os convites.');
    return;
  }
  const { default: Bull } = await import('bull');
  const queue = new Bull('email', {
    redis: {
      host: process.env.REDIS_HOST ?? '127.0.0.1',
      port: Number(process.env.REDIS_PORT ?? 6379),
      password: process.env.REDIS_PASSWORD || undefined,
      db: Number(process.env.REDIS_DB ?? 0),
    },
  });
  for (const u of pending) {
    await prisma.user.update({ where: { id: u.id }, data: { password: null } });
    await queue.add(
      'userInvite',
      { userId: u.id, email: u.email, fullName: u.fullName },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: true },
    );
  }
  await queue.close();
  console.log(`${pending.length} convite(s) reenviado(s).`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
