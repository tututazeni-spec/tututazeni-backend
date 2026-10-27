// Cifra User.nif / User.nib que ainda estão em claro (idempotente; `--dry-run` só conta).
// Correr com a app a correr é seguro: a leitura aceita claro e cifrado (ver pii-crypto.ts).
//   npx ts-node prisma/backfill-encrypt-user-pii.ts [--dry-run]
import { PrismaClient } from '@prisma/client';
import { encryptPii, isEncryptedPii } from '../src/common/security/pii-crypto';

const prisma = new PrismaClient();
const dryRun = process.argv.includes('--dry-run');

async function main() {
  const users = await prisma.user.findMany({
    where: { OR: [{ nif: { not: null } }, { nib: { not: null } }] },
    select: { id: true, nif: true, nib: true },
  });
  let changed = 0;
  for (const u of users) {
    const data: { nif?: string | null; nib?: string | null } = {};
    if (u.nif && !isEncryptedPii(u.nif)) data.nif = encryptPii(u.nif);
    if (u.nib && !isEncryptedPii(u.nib)) data.nib = encryptPii(u.nib);
    if (!Object.keys(data).length) continue;
    changed++;
    if (!dryRun) await prisma.user.update({ where: { id: u.id }, data });
  }
  console.log(`${dryRun ? '[dry-run] ' : ''}${changed} de ${users.length} utilizadores com NIF/NIB em claro`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
