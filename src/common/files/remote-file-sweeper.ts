// src/common/files/remote-file-sweeper.ts
// Dois trabalhos em segundo plano para a verificação de ficheiros no storage:
//
//  1. Varrimento periódico (cron, por omissão 03:00): re-verifica os ficheiros JÁ registados.
//     Fecha o buraco "o ficheiro foi trocado no storage depois de registado" e volta a passar o
//     antivírus com as assinaturas actualizadas. É barato porque a revalidação é um GET condicional:
//     quase tudo responde 304 e só o que mudou (ou expirou em cache) é descarregado.
//  2. Fila de ficheiros grandes: o que passa de REMOTE_FILE_SYNC_MAX_BYTES não é descarregado no
//     pedido; é verificado aqui, em série, com o contexto (utilizador, pedido) de quem o enviou.
//
// Os registos não têm estado de "quarentena": um ficheiro recusado fica no AuditLog
// (STORED_FILE_FLAGGED, severidade HIGH para malware/executável) e no log de erros, para
// alguém o retirar. Cada ficheiro é assinalado no máximo uma vez por semana.
//
//  REMOTE_FILE_SWEEP=true|false (omissão: acompanha REMOTE_FILE_VERIFY)
//  REMOTE_FILE_SWEEP_CRON (0 3 * * *) · REMOTE_FILE_SWEEP_MAX_PER_RUN (2000)
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { runWithRequestContext } from '../logging/request-context';
import { AuditService } from '../services/audit.service';
import { antivirusConfig, AntivirusConfig } from './antivirus';
import {
  DeferredRequest,
  RemoteFileConfig,
  remoteFileConfig,
  setDeferredVerifier,
  verifyRemoteFile,
} from './remote-file';
import { entityNameOf, STORED_FILE_TARGETS, StoredFileTarget } from './stored-file-catalog';
import { CursorValue, getVerdictCache, VerdictCache, verdictKey } from './verdict-cache';

export const SWEEP_CRON = process.env.REMOTE_FILE_SWEEP_CRON || '0 3 * * *';
const DEFAULT_MAX_PER_RUN = 2000;
const BATCH = 100;
const PAUSE_BETWEEN_FILES_MS = 100;
const FLAG_DEDUPE_SECONDS = 7 * 24 * 3600;
const LOCK_SECONDS = 3 * 3600;
const MAX_DEFERRED = 500;

export function sweepEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = String(env.REMOTE_FILE_SWEEP ?? '')
    .trim()
    .toLowerCase();
  if (v === 'true') return true;
  if (v === 'false') return false;
  return remoteFileConfig(env).enabled;
}

export function sweepMaxPerRun(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.REMOTE_FILE_SWEEP_MAX_PER_RUN);
  return Number.isInteger(n) && n >= 1 ? n : DEFAULT_MAX_PER_RUN;
}

export interface SweepSummary {
  checked: number;
  flagged: number;
  skippedHosts: number;
  errors: number;
  perTarget: Record<string, number>;
}

interface Delegate {
  findMany(args: unknown): Promise<Array<Record<string, unknown>>>;
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

@Injectable()
export class RemoteFileSweeper implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RemoteFileSweeper.name);
  private readonly pending: DeferredRequest[] = [];
  private draining = false;
  private stopped = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  onModuleInit(): void {
    // Só se regista se a verificação remota está ligada: sem ninguém registado, a verificação
    // faz-se toda no pedido (comportamento mais simples e seguro).
    if (remoteFileConfig().enabled) setDeferredVerifier(req => this.enqueue(req));
  }

  onModuleDestroy(): void {
    this.stopped = true;
    setDeferredVerifier(undefined);
  }

  // ─── 1. Ficheiros grandes ──────────────────────────────────────────────────

  enqueue(req: DeferredRequest): void {
    if (this.pending.some(p => p.url === req.url)) return;
    if (this.pending.length >= MAX_DEFERRED) {
      // O varrimento diário apanha-o mais tarde: perder um aviso aqui não perde a verificação.
      this.logger.warn(
        'Fila de verificação de ficheiros grandes cheia: fica para o varrimento diário.',
      );
      return;
    }
    this.pending.push(req);
    void this.drain();
  }

  /** Processa a fila em série. Devolve quando esvazia (para os testes). */
  async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      for (let req = this.pending.shift(); req && !this.stopped; req = this.pending.shift()) {
        await this.verifyDeferred(req);
      }
    } finally {
      this.draining = false;
    }
  }

  private async verifyDeferred(req: DeferredRequest): Promise<void> {
    const cfg = this.backgroundConfig();
    const message = await runWithRequestContext(
      { reqId: req.reqId, userId: req.userId, action: 'RemoteFileSweeper.deferred' },
      () =>
        verifyRemoteFile(
          req.url,
          { declaredMime: req.declaredMime, background: true },
          cfg,
          antivirusConfig(),
        ),
    ).catch((): null => null);
    if (message) {
      // O registo já foi gravado: só dá para assinalar. O auditor de uploads já registou o motivo
      // com o utilizador (UPLOAD_REJECTED); isto deixa um erro visível para quem opera.
      this.logger.error({
        event: 'stored_file_flagged',
        origin: 'deferred',
        reason: message,
        msg: 'Ficheiro grande já registado foi recusado na verificação em segundo plano',
      });
    }
  }

  // ─── 2. Varrimento periódico ───────────────────────────────────────────────

  @Cron(SWEEP_CRON)
  async scheduled(): Promise<void> {
    if (!sweepEnabled()) return;
    const cache = getVerdictCache();
    const release = await cache.lock('sweep', LOCK_SECONDS); // uma só instância por execução
    if (!release) return;
    try {
      const summary = await this.runSweep();
      this.logger.log({
        event: 'stored_file_sweep',
        ...summary,
        msg: 'Varrimento de ficheiros concluído',
      });
    } catch (err) {
      this.logger.error({
        event: 'stored_file_sweep_failed',
        err: { message: err instanceof Error ? err.message : String(err) },
        msg: 'Falha no varrimento de ficheiros',
      });
    } finally {
      await release();
    }
  }

  /** Falhas de obtenção nunca são tratadas como ficheiro suspeito: failMode open. */
  private backgroundConfig(): RemoteFileConfig {
    return { ...remoteFileConfig(), enabled: true, failMode: 'open' };
  }

  async runSweep(
    opts: {
      targets?: readonly StoredFileTarget[];
      maxPerRun?: number;
      cache?: VerdictCache;
      av?: AntivirusConfig;
      pauseMs?: number;
    } = {},
  ): Promise<SweepSummary> {
    const targets = opts.targets ?? STORED_FILE_TARGETS;
    const cache = opts.cache ?? getVerdictCache();
    const av = opts.av ?? antivirusConfig();
    const pauseMs = opts.pauseMs ?? PAUSE_BETWEEN_FILES_MS;
    const budget = Math.max(20, Math.ceil((opts.maxPerRun ?? sweepMaxPerRun()) / targets.length));
    const cfg = this.backgroundConfig();
    const allowedHosts = (process.env.ALLOWED_FILE_HOST ?? '')
      .split(',')
      .map(h => h.trim().toLowerCase())
      .filter(Boolean);
    const summary: SweepSummary = {
      checked: 0,
      flagged: 0,
      skippedHosts: 0,
      errors: 0,
      perTarget: {},
    };

    for (const target of targets) {
      if (this.stopped) break;
      const label = `${target.model}.${target.field}`;
      const delegate = (this.prisma as unknown as Record<string, Delegate | undefined>)[
        target.model
      ];
      if (!delegate) continue; // divergência schema <-> cliente gerado: não pára o varrimento
      let cursor: CursorValue = await cache.getCursor(label);
      let done = 0;

      while (done < budget && !this.stopped) {
        let rows: Array<Record<string, unknown>>;
        try {
          rows = await delegate.findMany({
            // Sem cursor: do início. Com cursor: `gt` serve ids inteiros e de texto (cuid/uuid).
            where: {
              ...(cursor === null ? {} : { id: { gt: cursor } }),
              [target.field]: { startsWith: 'https://' },
            },
            select: {
              id: true,
              [target.field]: true,
              ...(target.mimeField ? { [target.mimeField]: true } : {}),
            },
            orderBy: { id: 'asc' },
            take: Math.min(BATCH, budget - done),
          });
        } catch {
          summary.errors++;
          break;
        }
        if (rows.length === 0) {
          await cache.setCursor(label, null); // fim da tabela: a próxima execução recomeça do início
          break;
        }
        for (const row of rows) {
          cursor = row.id as string | number;
          done++;
          const raw = row[target.field];
          const url = typeof raw === 'string' ? raw : '';
          if (!this.hostAllowed(url, allowedHosts)) {
            summary.skippedHosts++;
            continue;
          }
          summary.checked++;
          const mime = target.mimeField ? (row[target.mimeField] as string | undefined) : undefined;
          try {
            const message = await verifyRemoteFile(
              url,
              { declaredMime: mime, background: true },
              cfg,
              av,
            );
            if (message)
              await this.flag(target, row.id as string | number, url, message, cache, summary);
          } catch {
            summary.errors++;
          }
          if (pauseMs > 0) await sleep(pauseMs);
        }
        await cache.setCursor(label, cursor);
      }
      summary.perTarget[label] = done;
    }
    return summary;
  }

  private hostAllowed(url: string, allowedHosts: string[]): boolean {
    try {
      const host = new URL(url).hostname.toLowerCase();
      return allowedHosts.length === 0 || allowedHosts.includes(host);
    } catch {
      return false;
    }
  }

  private async flag(
    target: StoredFileTarget,
    id: string | number,
    url: string,
    message: string,
    cache: VerdictCache,
    summary: SweepSummary,
  ): Promise<void> {
    summary.flagged++;
    if (!(await cache.markOnce(`flag:${verdictKey(url)}`, FLAG_DEDUPE_SECONDS))) return;
    const severe = message.startsWith('Ficheiro rejeitado');
    this.logger.error({
      event: 'stored_file_flagged',
      origin: 'sweep',
      target: `${target.model}.${target.field}`,
      id,
      reason: message,
      msg: 'Ficheiro já registado foi recusado na re-verificação',
    });
    await this.audit
      .log({
        userId: 0, // SYSTEM: o AuditService grava userId NULL e actorType SYSTEM
        action: 'STORED_FILE_FLAGGED',
        entity: entityNameOf(target.model),
        // AuditLog.entityId é Int: ids de texto (cuid/uuid) vão só em metadata.
        entityId: typeof id === 'number' ? id : undefined,
        status: 'DENIED',
        severity: severe ? 'HIGH' : 'MEDIUM',
        actorType: 'SYSTEM',
        source: 'JOB',
        reason: message,
        // Nunca o URL (pode levar uma assinatura temporária): só onde procurar.
        metadata: { field: target.field, model: target.model, id },
      })
      .catch((): undefined => undefined);
  }
}
