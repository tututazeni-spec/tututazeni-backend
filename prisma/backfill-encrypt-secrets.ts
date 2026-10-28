// Cifra EmployeeCompensation.iban/accountNumber e Webhook.secret que ainda estão em claro
// (idempotente; `--dry-run` só conta). Seguro com a app a correr: a leitura aceita claro e cifrado.
//   npx ts-node prisma/backfill-encrypt-secrets.ts [--dry-run]
import { PrismaClient } from '@prisma/client';
import { encryptPii, isEncryptedPii } from '../src/common/security/pii-crypto';

const prisma = new PrismaClient();
const dryRun = process.argv.includes('--dry-run');

async function main() {
  const comps = await prisma.employeeCompensation.findMany({
    where: { OR: [{ iban: { not: null } }, { accountNumber: { not: null } }] },
    select: { id: true, iban: true, accountNumber: true },
  });
  let compChanged = 0;
  for (const c of comps) {
    const data: { iban?: string | null; accountNumber?: string | null } = {};
    if (c.iban && !isEncryptedPii(c.iban)) data.iban = encryptPii(c.iban);
    if (c.accountNumber && !isEncryptedPii(c.accountNumber)) {
      data.accountNumber = encryptPii(c.accountNumber);
    }
    if (!Object.keys(data).length) continue;
    compChanged++;
    if (!dryRun) await prisma.employeeCompensation.update({ where: { id: c.id }, data });
  }

  const hooks = await prisma.webhook.findMany({ select: { id: true, secret: true } });
  let hookChanged = 0;
  for (const h of hooks) {
    if (!h.secret || isEncryptedPii(h.secret)) continue;
    hookChanged++;
    if (!dryRun) {
      await prisma.webhook.update({ where: { id: h.id }, data: { secret: encryptPii(h.secret)! } });
    }
  }

  const tag = dryRun ? '[dry-run] ' : '';
  console.log(`${tag}${compChanged} de ${comps.length} compensações com IBAN/conta em claro`);
  console.log(`${tag}${hookChanged} de ${hooks.length} webhooks com segredo em claro`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
