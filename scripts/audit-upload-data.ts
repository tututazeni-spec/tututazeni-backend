/**
 * Auditoria SÓ DE LEITURA dos dados já gravados contra as regras novas de URL e nome de ficheiro
 * (safeFileUrlProblem / fileNameProblem). Serve para saber o que falharia ao editar registos
 * antigos antes de apertar a validação. Não escreve nem apaga nada: só `findMany`.
 *
 * Uso:
 *   npx ts-node -P tsconfig.json scripts/audit-upload-data.ts [--csv out.csv] [--limit 20]
 *
 * Duas passagens:
 *  1. Ligações e nomes de ficheiro (colunas com URL externa ou fileName).
 *  2. Ficheiros INLINE (`data:`): cada um é inspeccionado pelos bytes com a mesma política que o
 *     DTO aplicaria (inspectInlineFile, modo enforce). Diz quantos registos existentes seriam
 *     recusados ao serem reenviados/editados: correr isto em produção ANTES de passar de
 *     UPLOAD_VALIDATION_MODE=warn para enforce.
 *  3. Com --remote: os ficheiros guardados no storage (`fileUrl` HTTPS). Cada um é descarregado e
 *     verificado como o seria num pedido (tipo real, estrutura, antivírus se CLAMAV_ENABLED=true).
 *     Mede o que a verificação remota (REMOTE_FILE_VERIFY) recusaria nos registos que já existem.
 *     Faz pedidos ao storage: usar --remote-limit N (por coluna, por omissão 200) e correr fora
 *     de horas. Continua só de leitura: o cache fica em memória e nada é gravado na BD nem no Redis.
 * O conteúdo dos ficheiros nunca é impresso (só tipo declarado, tamanho e motivo). Credenciais
 * embutidas em URLs são mascaradas na saída; o CSV é escrito com csvCell (sem injecção de fórmulas).
 */
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { safeFileUrlProblem } from '../src/common/validators/safe-file-url';
import { fileNameProblem } from '../src/common/files/sanitize-file-name';
import { FILE_POLICIES, FilePolicy } from '../src/common/files/file-policies';
import { inspectInlineFile } from '../src/common/files/inspect-inline-file';
import { csvCell } from '../src/common/utils/csv-safe.util';
import { antivirusConfig } from '../src/common/files/antivirus';
import { remoteFileConfig, verifyRemoteFile } from '../src/common/files/remote-file';
import { STORED_FILE_TARGETS, StoredFileTarget } from '../src/common/files/stored-file-catalog';
import { addUploadRejectionSink } from '../src/common/files/upload-validation';
import { MemoryVerdictCache, setVerdictCache } from '../src/common/files/verdict-cache';

dotenv.config();
// A auditoria mede o que o modo enforce recusaria, seja qual for o modo configurado no ambiente.
process.env.UPLOAD_VALIDATION_MODE = 'enforce';

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
/** Ficheiros inline podem ter vários MB por linha: lotes pequenos para não esgotar a memória. */
const INLINE_BATCH = 10;

interface InlineTarget {
  model: string;
  field: string;
  policy: FilePolicy;
}
const inline = (model: string, field: string, policy: FilePolicy): InlineTarget => ({
  model,
  field,
  policy,
});

// Mesmas políticas que os DTOs aplicam a estes campos (ver FILE_POLICIES).
const INLINE_TARGETS: InlineTarget[] = [
  inline('user', 'avatarUrl', FILE_POLICIES.AVATAR),
  inline('course', 'thumbnailUrl', FILE_POLICIES.CARD_IMAGE),
  inline('developmentPlan', 'imageUrl', FILE_POLICIES.CARD_IMAGE),
  inline('trainingPlan', 'imageUrl', FILE_POLICIES.CARD_IMAGE),
  inline('lesson', 'contentUrl', FILE_POLICIES.PDF),
  inline('contentAsset', 'url', FILE_POLICIES.DOCUMENT),
  inline('certificate', 'fileUrl', FILE_POLICIES.PDF),
  inline('leaveDocument', 'fileUrl', FILE_POLICIES.ATTACHMENT),
  inline('absenceAttachment', 'fileUrl', FILE_POLICIES.ATTACHMENT),
  inline('trainingDocument', 'fileUrl', FILE_POLICIES.ATTACHMENT),
  inline('onboardingDocument', 'fileUrl', FILE_POLICIES.ONBOARDING_PDF),
  inline('trainingAvatar', 'imageUrl', FILE_POLICIES.TRAINING_AVATAR_IMAGE),
];

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

const REMOTE_BATCH = 50;

/** Só o id e o motivo: o URL pode levar uma assinatura temporária. */
async function scanRemote(
  prisma: PrismaClient,
  t: StoredFileTarget,
  limit: number,
  hosts: string[],
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const delegate = (prisma as any)[t.model];
  if (!delegate) throw new Error('modelo inexistente no cliente Prisma');
  const cfg = { ...remoteFileConfig(), enabled: true, failMode: 'open' as const };
  const av = antivirusConfig();
  const findings: Finding[] = [];
  let scanned = 0;
  let unverified = 0;
  let outsideAllowlist = 0;
  let cursor: string | number | null = null;
  let softFailure = false;
  const off = addUploadRejectionSink(e => {
    if (e.stage === 'remote' && !e.enforced) softFailure = true;
  });
  try {
    while (scanned + outsideAllowlist < limit) {
      const rows: Array<Record<string, unknown>> = await delegate.findMany({
        where: {
          ...(cursor === null ? {} : { id: { gt: cursor } }),
          [t.field]: { startsWith: 'https://' },
        },
        select: { id: true, [t.field]: true, ...(t.mimeField ? { [t.mimeField]: true } : {}) },
        orderBy: { id: 'asc' },
        take: Math.min(REMOTE_BATCH, limit - scanned - outsideAllowlist),
      });
      if (rows.length === 0) break;
      for (const row of rows) {
        cursor = row.id as string | number;
        const value = String(row[t.field] ?? '');
        let host = '';
        try {
          host = new URL(value).hostname.toLowerCase();
        } catch {
          /* URL inválido: conta como fora da allowlist */
        }
        if (hosts.length > 0 && !hosts.includes(host)) {
          outsideAllowlist++;
          continue;
        }
        scanned++;
        softFailure = false;
        const mime = t.mimeField ? (row[t.mimeField] as string | undefined) : undefined;
        const message = await verifyRemoteFile(
          value,
          { declaredMime: mime, background: true },
          cfg,
          av,
        );
        if (message) {
          findings.push({
            target: `${t.model}.${t.field} [remoto]`,
            id: row.id,
            problem: message,
            value: host,
          });
        } else if (softFailure) {
          unverified++;
        }
      }
    }
  } finally {
    off();
  }
  return { scanned, unverified, outsideAllowlist, findings };
}

/** Só o cabeçalho (tipo declarado) e o tamanho: nunca o conteúdo. */
const describeInline = (v: string): string => {
  const head = v.slice(0, 60);
  const comma = head.indexOf(',');
  return `${comma > 0 ? head.slice(0, comma) : head.slice(0, 30)} (${v.length} caracteres)`;
};

async function scanInline(prisma: PrismaClient, t: InlineTarget) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const delegate = (prisma as any)[t.model];
  if (!delegate) throw new Error('modelo inexistente no cliente Prisma');
  const findings: Finding[] = [];
  let scanned = 0;
  let cursor: unknown;
  for (;;) {
    const rows: Array<Record<string, unknown>> = await delegate.findMany({
      where: { [t.field]: { startsWith: 'data:' } },
      select: { id: true, [t.field]: true },
      orderBy: { id: 'asc' },
      take: INLINE_BATCH,
      ...(cursor === undefined ? {} : { cursor: { id: cursor }, skip: 1 }),
    });
    if (rows.length === 0) break;
    for (const row of rows) {
      scanned++;
      const value = String(row[t.field] ?? '');
      const result = inspectInlineFile(value, t.policy, { report: false });
      if (result.ok === false) {
        findings.push({
          target: `${t.model}.${t.field} [${t.policy.name}]`,
          id: row.id,
          problem: result.error,
          value: describeInline(value),
        });
      }
    }
    cursor = rows[rows.length - 1].id;
    if (rows.length < INLINE_BATCH) break;
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

    console.log('\n--- Ficheiros inline (data:) contra as políticas de conteúdo ---');
    for (const t of INLINE_TARGETS) {
      const label = `${t.model}.${t.field} [${t.policy.name}]`;
      try {
        const { scanned, findings } = await scanInline(prisma, t);
        all.push(...findings);
        summary.push({ alvo: label, analisados: scanned, problemas: findings.length });
        findings.slice(0, limit).forEach(f => {
          console.log(`[${f.target}] id=${String(f.id)} -> ${f.problem} :: ${f.value}`);
        });
      } catch (err) {
        summary.push({
          alvo: label,
          analisados: 'n/d',
          problemas: `erro: ${(err as Error).message.trim().split('\n').pop()}`,
        });
      }
    }

    if (process.argv.includes('--remote')) {
      const remoteLimit = Number(argValue('--remote-limit') ?? 200);
      // Sem efeitos laterais: cache em memória, nada de Redis.
      setVerdictCache(new MemoryVerdictCache());
      console.log(
        `\n--- Ficheiros no storage (https), até ${remoteLimit} por coluna${antivirusConfig().enabled ? ', com antivírus' : ', sem antivírus (CLAMAV_ENABLED=false)'} ---`,
      );
      for (const t of STORED_FILE_TARGETS) {
        const label = `${t.model}.${t.field} [remoto]`;
        try {
          const { scanned, unverified, outsideAllowlist, findings } = await scanRemote(
            prisma,
            t,
            remoteLimit,
            allowedHosts,
          );
          all.push(...findings);
          summary.push({
            alvo: label,
            analisados: scanned,
            problemas: `${findings.length}${unverified ? ` (+${unverified} não verificados)` : ''}${outsideAllowlist ? ` (${outsideAllowlist} fora da allowlist)` : ''}`,
          });
          findings.slice(0, limit).forEach(f => {
            console.log(`[${f.target}] id=${String(f.id)} -> ${f.problem} :: host=${f.value}`);
          });
        } catch (err) {
          summary.push({
            alvo: label,
            analisados: 'n/d',
            problemas: `erro: ${(err as Error).message.trim().split('\n').pop()}`,
          });
        }
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
    const lines = [
      'alvo,id,problema,valor',
      ...all.map(f => [f.target, f.id, f.problem, f.value].map(csvCell).join(',')),
    ];
    fs.writeFileSync(csvPath, lines.join('\n'), 'utf8');
    console.log(`CSV escrito em ${csvPath}`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
