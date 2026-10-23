/**
 * Auditoria SÓ DE LEITURA dos dados já gravados contra as regras novas de URL e nome de ficheiro
 * (safeFileUrlProblem / fileNameProblem). Serve para saber o que falharia ao editar registos
 * antigos antes de apertar a validação. Não escreve nem apaga nada: só `findMany`.
 *
 * Uso:
 *   npx ts-node -P tsconfig.json scripts/audit-upload-data.ts [--csv out.csv] [--limit 20]
 *
 * Os data URLs (`data:`) são ignorados aqui: o conteúdo inline é tratado na validação por bytes.
 * Credenciais embutidas em URLs são mascaradas na saída.
 */
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { safeFileUrlProblem } from '../src/common/validators/safe-file-url';
import { fileNameProblem } from '../src/common/files/sanitize-file-name';

dotenv.config();

type Kind = 'url' | 'fileName';
interface Target {
  model: string; // nome do delegate Prisma (minúscula inicial)
  field: string;
  kind: Kind;
  /** url: aplica ALLOWED_FILE_HOST (campos validados por @IsAllowedFileUrl). */
  allowedHosts?: boolean;
}

const url = (model: string, field: string, allowedHosts = false): Target => ({
  model,
  field,
  kind: 'url',
  allowedHosts,
});
const name = (model: string, field: string): Target => ({ model, field, kind: 'fileName' });

const TARGETS: Target[] = [
  // @IsUrlOrInlineFile / ligações livres
  url('contentAsset', 'url'),
  url('certificate', 'fileUrl'),
  url('absenceAttachment', 'fileUrl'),
  url('declarationAttachment', 'url'),
  // @IsAllowedFileUrl
  url('document', 'fileUrl', true),
  url('docVersion', 'fileUrl', true),
  url('employeeDocument', 'fileUrl', true),
  url('libraryItem', 'fileUrl', true),
  url('partnerDocument', 'fileUrl', true),
  url('partnerAgreementVersion', 'fileUrl', true),
  url('funderDocument', 'fileUrl', true),
  url('funderOpportunityDocument', 'fileUrl', true),
  url('funderReport', 'fileUrl', true),
  url('beneficiaryDocument', 'fileUrl', true),
  url('onboardingDocument', 'fileUrl', true),
  url('trainingDocument', 'fileUrl', true),
  url('leaveDocument', 'fileUrl', true),
  url('assessmentAttemptAnswer', 'fileUrl', true),
  url('internalAuditEvidence', 'url', true),
  url('partner', 'logoUrl', true),
  url('funder', 'logoUrl', true),
  url('declarationTenantConfig', 'logoUrl', true),
  url('declarationSignature', 'signatureUrl', true),
  // nomes de ficheiro
  name('document', 'fileName'),
  name('docVersion', 'fileName'),
  name('partnerAgreementVersion', 'fileName'),
  name('auditExport', 'fileName'),
  name('processDocumentVersion', 'fileName'),
];

const BATCH = 500;

const argValue = (flag: string): string | undefined => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

/** Esconde `user:pass@` para o relatório não espalhar segredos. */
const mask = (v: string): string => v.replace(/\/\/[^/@\s]+@/, '//***@').slice(0, 200);

interface Finding {
  target: string;
  id: unknown;
  problem: string;
  value: string;
}

async function scan(prisma: PrismaClient, t: Target, allowedHosts: string[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const delegate = (prisma as any)[t.model];
  if (!delegate) throw new Error('modelo inexistente no cliente Prisma');
  const findings: Finding[] = [];
  let scanned = 0;
  let cursor: unknown;
  for (;;) {
    const rows: Array<Record<string, unknown>> = await delegate.findMany({
      // NOT startsWith também exclui NULL (comparação SQL), por isso serve campos obrigatórios e opcionais.
      where: { NOT: { [t.field]: { startsWith: 'data:' } } },
      select: { id: true, [t.field]: true },
      orderBy: { id: 'asc' },
      take: BATCH,
      ...(cursor === undefined ? {} : { cursor: { id: cursor }, skip: 1 }),
    });
    if (rows.length === 0) break;
    for (const row of rows) {
      scanned++;
      const value = String(row[t.field] ?? '');
      const problem =
        t.kind === 'url'
          ? safeFileUrlProblem(value, t.allowedHosts ? { allowedHosts } : {})
          : fileNameProblem(value);
      if (problem) {
        findings.push({ target: `${t.model}.${t.field}`, id: row.id, problem, value: mask(value) });
      }
    }
    cursor = rows[rows.length - 1].id;
    if (rows.length < BATCH) break;
  }
  return { scanned, findings };
}

async function main() {
  const limit = Number(argValue('--limit') ?? 20);
  const csvPath = argValue('--csv');
  const allowedHosts = (process.env.ALLOWED_FILE_HOST ?? '')
    .split(',')
    .map(h => h.trim())
    .filter(Boolean);
  if (allowedHosts.length === 0) {
    console.warn('! ALLOWED_FILE_HOST vazio: a lista de hosts não será aplicada.');
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) } as any);
  const all: Finding[] = [];
  const summary: Array<{ alvo: string; analisados: number | string; problemas: number | string }> =
    [];
  try {
    for (const t of TARGETS) {
      const label = `${t.model}.${t.field}`;
      try {
        const { scanned, findings } = await scan(prisma, t, allowedHosts);
        all.push(...findings);
        summary.push({ alvo: label, analisados: scanned, problemas: findings.length });
        findings.slice(0, limit).forEach(f => {
          console.log(`[${f.target}] id=${String(f.id)} -> ${f.problem} :: ${f.value}`);
        });
      } catch (err) {
        // Divergência schema <-> cliente gerado: regista e continua.
        summary.push({
          alvo: label,
          analisados: 'n/d',
          problemas: `erro: ${(err as Error).message.split('\n')[0]}`,
        });
      }
    }
  } finally {
    await prisma.$disconnect();
    await pool.end().catch(() => undefined);
  }

  console.log('\n=== Resumo ===');
  console.table(summary);
  console.log(`Total de registos com problemas: ${all.length}`);

  if (csvPath) {
    const esc = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`;
    const lines = [
      'alvo,id,problema,valor',
      ...all.map(f => [f.target, f.id, f.problem, f.value].map(esc).join(',')),
    ];
    fs.writeFileSync(csvPath, lines.join('\n'), 'utf8');
    console.log(`CSV escrito em ${csvPath}`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
