import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = TEST_DB_URL;

function createPrisma(pool: Pool) {
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter } as any);
}

// Todas as tabelas com uma FK RESTRICT/NO ACTION para "User"("id"), lidas
// directamente do catálogo do Postgres em vez de mantidas como lista fixa
// aqui. Uma lista fixa fica sistematicamente desactualizada à medida que
// módulos novos ganham relações com User — foi exactamente o que aconteceu
// nesta sessão: ContinuousFeedback (banco de feedback contínuo) chegou com
// duas FKs RESTRICT (giverId/userId) sem nenhum passo de limpeza, e o
// `user.deleteMany` final passou a falhar sempre que um teste desta sessão
// (ou de qualquer batch anterior, já que a BD é partilhada entre batches)
// criava uma linha em ContinuousFeedback para um dos 4 utilizadores fixos
// de teste. Ver também CalibrationLog/PdiApproval/etc. — dezenas de tabelas
// referenciam User, e cresce a cada módulo novo.
async function findUserReferencingTables(pool: Pool) {
  const { rows } = await pool.query<{ table_name: string; column_name: string }>(`
    SELECT DISTINCT tc.table_name, kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    JOIN information_schema.referential_constraints rc
      ON tc.constraint_name = rc.constraint_name AND tc.table_schema = rc.constraint_schema
    JOIN information_schema.constraint_column_usage ccu
      ON rc.unique_constraint_name = ccu.constraint_name AND rc.unique_constraint_schema = ccu.constraint_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND ccu.table_name = 'User'
      AND rc.delete_rule IN ('RESTRICT', 'NO ACTION')
  `);
  return rows;
}

export default async function globalTeardown() {
  console.log('\n🧹 Teardown — a limpar BD de teste...');

  const pool = new Pool({ connectionString: TEST_DB_URL });
  const prisma = createPrisma(pool);

  const testEmails = [
    'int.employee@innova-test.com',
    'int.manager@innova-test.com',
    'int.rh@innova-test.com',
    'int.admin@innova-test.com',
  ];

  const users = await prisma.user.findMany({
    where: { email: { in: testEmails } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);

  if (ids.length > 0) {
    try {
      const fkTables = await findUserReferencingTables(pool);
      // Múltiplas passagens: a ordem de dependência entre as próprias
      // tabelas filhas de User não é conhecida à partida (ex.: uma tabela
      // que referencia PerformanceReview, que por sua vez referencia User,
      // só liberta a linha de PerformanceReview numa passagem seguinte).
      // Cada DELETE é best-effort e silencioso — o objectivo aqui é só
      // desbloquear o `user.deleteMany` final, não é em si um teste.
      for (let pass = 0; pass < 4; pass++) {
        for (const { table_name, column_name } of fkTables) {
          try {
            await pool.query(
              `DELETE FROM "${table_name}" WHERE "${column_name}" = ANY($1::int[])`,
              [ids],
            );
          } catch {
            // Ainda bloqueado por uma dependência mais funda — tenta de
            // novo na próxima passagem.
          }
        }
      }
    } catch (e: any) {
      console.warn(
        `⚠️  Teardown: falha ao descobrir/limpar tabelas dependentes de User: ${String(e.message).split('\n')[0]}`,
      );
    }
  }

  // Passos nomeados finais — o que sobra depois do varrimento genérico
  // acima. Cada passo é best-effort: o teardown nunca deve mascarar testes
  // verdes com exit 1 — o setup usa upserts, por isso restos de dados não
  // partem a próxima run.
  const steps: Array<[string, () => Promise<unknown>]> = [
    ['user', () => prisma.user.deleteMany({ where: { email: { in: testEmails } } })],
    ['course', () => prisma.course.deleteMany({ where: { internalCode: 'INT-TEST-001' } })],
  ];

  for (const [name, run] of steps) {
    try {
      await run();
    } catch (e: any) {
      console.warn(`⚠️  Teardown: falha ao limpar ${name}: ${String(e.message).split('\n')[0]}`);
    }
  }

  await prisma.$disconnect();
  await pool.end();
  console.log('✅ BD de teste limpa\n');
}
