// src/settings/backup-settings.service.ts
// Definições de Backups (docs/modulo_settings.md §14): periodicidade, retenção,
// destino, execução manual/agendada, restauração e estado. Backup = `pg_dump
// --format=custom` para uma pasta local (o destino remoto — S3/FTP — fica fora
// de âmbito: monte-se a partilha/volume nessa pasta).
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { BadRequestException, Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { Redis } from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { CACHE_REDIS } from '../cache/cache.constants';
import { writeChainedAuditLog } from '../common/helpers/audit-chain';
import { resolveDefaultTenantId } from '../common/helpers/tenant.helper';
import { RestoreBackupDto, UpdateBackupSettingsDto } from './settings.dto';
import {
  BACKUP_FREQUENCIES,
  BackupSettings,
  backupFileName,
  frequencyMs,
  isBackupDue,
  isSafeBackupDir,
  nextScheduledSlot,
  parseBackupSettings,
  selectExpired,
} from './backup-settings';

const run = promisify(execFile);
const LOCK_KEY = 'innova:backup:lock';
const LOCK_TTL_S = 2 * 3600;
const RESTORE_CONFIRMATION = 'RESTAURAR';
const SCALABILITY_SETTINGS_ID = 'default';

/** `?schema=` (Prisma) não é aceite por pg_dump/pg_restore. */
function pgConnectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new BadRequestException('DATABASE_URL não definido');
  const u = new URL(url);
  u.searchParams.delete('schema');
  return u.toString();
}

@Injectable()
export class BackupSettingsService {
  private readonly logger = new Logger(BackupSettingsService.name);
  // Fallback por processo, só se o Redis não existir.
  private localLock = false;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(CACHE_REDIS) private readonly redis?: Redis,
  ) {}

  private async load(): Promise<BackupSettings> {
    const id = await resolveDefaultTenantId(this.prisma);
    const row = await this.prisma.tenantConfig.findUnique({
      where: { id },
      select: { backupSettingsJson: true },
    });
    return parseBackupSettings(row?.backupSettingsJson);
  }

  private pgTool(name: 'pg_dump' | 'pg_restore'): string {
    return (name === 'pg_dump' ? process.env.PG_DUMP_PATH : process.env.PG_RESTORE_PATH) || name;
  }

  private async toolAvailable(name: 'pg_dump' | 'pg_restore'): Promise<boolean> {
    try {
      await run(this.pgTool(name), ['--version'], { timeout: 10_000 });
      return true;
    } catch {
      return false;
    }
  }

  // ─── Leitura / escrita ────────────────────────────────────────────────────

  async get() {
    const settings = await this.load();
    const now = new Date();
    const [runs, lastSuccess, lastRun, stored, pgDump, pgRestore] = await Promise.all([
      this.prisma.read.backupRun.findMany({ orderBy: { startedAt: 'desc' }, take: 20 }),
      this.prisma.read.backupRun.findFirst({
        where: { status: 'SUCCESS' },
        orderBy: { startedAt: 'desc' },
      }),
      this.prisma.read.backupRun.findFirst({ orderBy: { startedAt: 'desc' } }),
      this.prisma.read.backupRun.aggregate({
        where: { status: 'SUCCESS', deletedAt: null },
        _count: { _all: true },
        _sum: { sizeBytes: true },
      }),
      this.toolAvailable('pg_dump'),
      this.toolAvailable('pg_restore'),
    ]);

    let health: 'DISABLED' | 'NEVER' | 'HEALTHY' | 'STALE' | 'FAILED' = 'HEALTHY';
    if (!lastSuccess) health = lastRun?.status === 'FAILED' ? 'FAILED' : 'NEVER';
    else if (lastRun?.status === 'FAILED') health = 'FAILED';
    else if (
      now.getTime() - lastSuccess.startedAt.getTime() >
      frequencyMs(settings.frequency) * 2
    ) {
      health = 'STALE';
    }
    if (!settings.enabled && health === 'HEALTHY') health = 'DISABLED';

    return {
      settings,
      frequencyOptions: BACKUP_FREQUENCIES,
      nextRunAt:
        settings.enabled && settings.destinationDir ? nextScheduledSlot(settings, now) : null,
      health,
      lastSuccessAt: lastSuccess?.startedAt ?? null,
      storedCopies: stored._count._all,
      storedBytes: Number(stored._sum.sizeBytes ?? 0),
      tools: { pgDump, pgRestore },
      restoreEnabled: process.env.BACKUP_RESTORE_ENABLED === 'true',
      runs: runs.map(r => ({ ...r, sizeBytes: r.sizeBytes === null ? null : Number(r.sizeBytes) })),
    };
  }

  async update(dto: UpdateBackupSettingsDto, actorId?: number) {
    const id = await resolveDefaultTenantId(this.prisma);
    const cur = await this.load();
    const next: BackupSettings = {
      ...cur,
      ...(Object.fromEntries(
        Object.entries(dto).filter(([, v]) => v !== undefined),
      ) as Partial<BackupSettings>),
    };
    if (next.destinationDir && !isSafeBackupDir(next.destinationDir)) {
      throw new BadRequestException('A pasta de destino tem de ser um caminho absoluto, sem ".."');
    }
    if (next.enabled && !next.destinationDir) {
      throw new BadRequestException('Indique a pasta de destino para activar os backups');
    }
    if (next.destinationDir) {
      try {
        await fs.mkdir(next.destinationDir, { recursive: true });
        await fs.access(next.destinationDir, fs.constants.W_OK);
      } catch {
        throw new BadRequestException('Sem permissão de escrita na pasta de destino');
      }
    }
    await this.prisma.tenantConfig.update({
      where: { id },
      data: { backupSettingsJson: JSON.stringify(next) },
    });
    await writeChainedAuditLog(this.prisma, {
      userId: actorId,
      action: 'SETTINGS_BACKUP_UPDATE',
      entity: 'Settings',
      severity: 'HIGH',
      metadata: JSON.stringify({ before: cur, after: next }),
    }).catch(() => undefined);
    return this.get();
  }

  // ─── Execução ─────────────────────────────────────────────────────────────

  private async acquireLock(): Promise<boolean> {
    if (this.redis) {
      try {
        return (await this.redis.set(LOCK_KEY, '1', 'EX', LOCK_TTL_S, 'NX')) === 'OK';
      } catch {
        // cai para o lock local
      }
    }
    if (this.localLock) return false;
    this.localLock = true;
    return true;
  }

  private async releaseLock() {
    this.localLock = false;
    await this.redis?.del(LOCK_KEY).catch(() => undefined);
  }

  /** Corre um backup completo; devolve o registo da execução (SUCCESS ou FAILED). */
  async runBackup(trigger: 'MANUAL' | 'SCHEDULED' | 'PRE_RESTORE', actorId?: number) {
    const settings = await this.load();
    if (!settings.destinationDir) {
      throw new BadRequestException('Defina primeiro a pasta de destino dos backups');
    }
    if (!(await this.acquireLock())) {
      throw new BadRequestException('Já existe um backup ou restauração em curso');
    }
    const started = new Date();
    const record = await this.prisma.backupRun.create({
      data: { trigger, status: 'RUNNING', triggeredById: actorId ?? null, startedAt: started },
    });
    try {
      await fs.mkdir(settings.destinationDir, { recursive: true });
      const file = path.join(settings.destinationDir, backupFileName(started));
      await run(
        this.pgTool('pg_dump'),
        ['--format=custom', '--no-owner', `--file=${file}`, `--dbname=${pgConnectionString()}`],
        { timeout: 3_600_000, maxBuffer: 10 * 1024 * 1024 },
      );
      const { size } = await fs.stat(file);
      const done = await this.prisma.backupRun.update({
        where: { id: record.id },
        data: {
          status: 'SUCCESS',
          filePath: file,
          sizeBytes: BigInt(size),
          finishedAt: new Date(),
        },
      });
      // Alimenta o indicador "último backup" do módulo de escalabilidade (Resiliência).
      await this.prisma.scalabilityInfraSettings
        .upsert({
          where: { id: SCALABILITY_SETTINGS_ID },
          update: { lastBackupAt: done.finishedAt },
          create: { id: SCALABILITY_SETTINGS_ID, lastBackupAt: done.finishedAt },
        })
        .catch(() => undefined);
      await this.audit(actorId, 'SETTINGS_BACKUP_RUN', 'LOW', { id: done.id, trigger, size });
      await this.applyRetention(settings).catch(err =>
        this.logger.warn({ err: { message: String(err) }, msg: 'Falha ao aplicar a retenção' }),
      );
      return { ...done, sizeBytes: Number(done.sizeBytes) };
    } catch (err: unknown) {
      // stderr do pg_dump é a mensagem útil; nunca inclui a password.
      const message = (
        (err as { stderr?: string }).stderr || (err instanceof Error ? err.message : String(err))
      )
        .replace(/postgres(ql)?:\/\/[^\s@]*@/gi, 'postgresql://***@')
        .slice(0, 1000);
      const failed = await this.prisma.backupRun.update({
        where: { id: record.id },
        data: { status: 'FAILED', error: message, finishedAt: new Date() },
      });
      this.logger.error({ err: { message }, msg: 'Backup falhou' });
      await this.audit(actorId, 'SETTINGS_BACKUP_RUN', 'HIGH', {
        id: failed.id,
        trigger,
        error: message,
      });
      return { ...failed, sizeBytes: null };
    } finally {
      await this.releaseLock();
    }
  }

  async applyRetention(settings?: BackupSettings): Promise<number> {
    const s = settings ?? (await this.load());
    const live = await this.prisma.backupRun.findMany({
      where: { status: 'SUCCESS', deletedAt: null, filePath: { not: null } },
      select: { id: true, startedAt: true, filePath: true },
    });
    const expired = new Set(selectExpired(live, s, new Date()));
    let removed = 0;
    for (const r of live.filter(x => expired.has(x.id))) {
      await fs.rm(r.filePath as string, { force: true }).catch(() => undefined);
      await this.prisma.backupRun.update({ where: { id: r.id }, data: { deletedAt: new Date() } });
      removed++;
    }
    return removed;
  }

  /** Verificação horária: corre o backup agendado se estiver em atraso. */
  @Cron('5 * * * *')
  async scheduledTick() {
    try {
      const settings = await this.load();
      if (!settings.enabled) return;
      const last = await this.prisma.backupRun.findFirst({
        where: { status: 'SUCCESS' },
        orderBy: { startedAt: 'desc' },
        select: { startedAt: true },
      });
      if (!isBackupDue(settings, last?.startedAt ?? null, new Date())) return;
      await this.runBackup('SCHEDULED');
    } catch (err: unknown) {
      // Outro nó já tem o lock, ou BD indisponível — tenta na próxima hora.
      this.logger.warn({
        err: { message: err instanceof Error ? err.message : String(err) },
        msg: 'Tick de backup agendado não correu',
      });
    }
  }

  // ─── Restauração ──────────────────────────────────────────────────────────

  async restore(id: number, dto: RestoreBackupDto, actorId: number) {
    if (process.env.BACKUP_RESTORE_ENABLED !== 'true') {
      throw new BadRequestException(
        'A restauração está desactivada neste ambiente (BACKUP_RESTORE_ENABLED=true)',
      );
    }
    if (dto.confirmation !== RESTORE_CONFIRMATION) {
      throw new BadRequestException(`Confirme escrevendo "${RESTORE_CONFIRMATION}"`);
    }
    const target = await this.prisma.backupRun.findUnique({ where: { id } });
    if (!target || target.status !== 'SUCCESS' || target.deletedAt || !target.filePath) {
      throw new BadRequestException('Backup inexistente, falhado ou já eliminado');
    }
    try {
      await fs.access(target.filePath);
    } catch {
      throw new BadRequestException('O ficheiro deste backup já não existe na pasta de destino');
    }

    // Rede de segurança: copia do estado actual antes de sobrescrever.
    const safety = await this.runBackup('PRE_RESTORE', actorId);
    if (safety.status !== 'SUCCESS') {
      throw new BadRequestException(
        'Não foi possível criar a cópia de segurança prévia — restauração cancelada',
      );
    }
    if (!(await this.acquireLock())) {
      throw new BadRequestException('Já existe um backup ou restauração em curso');
    }
    try {
      await this.audit(actorId, 'SETTINGS_BACKUP_RESTORE_START', 'CRITICAL', {
        id,
        safetyBackupId: safety.id,
      });
      await run(
        this.pgTool('pg_restore'),
        [
          '--clean',
          '--if-exists',
          '--no-owner',
          `--dbname=${pgConnectionString()}`,
          target.filePath,
        ],
        { timeout: 3_600_000, maxBuffer: 10 * 1024 * 1024 },
      );
      // A BD volta ao estado do snapshot: a linha pode já não existir — best-effort.
      await this.prisma.backupRun
        .updateMany({ where: { id }, data: { restoredAt: new Date(), restoredById: actorId } })
        .catch(() => undefined);
      await this.audit(actorId, 'SETTINGS_BACKUP_RESTORE_DONE', 'CRITICAL', { id });
      return { ok: true, safetyBackupId: safety.id };
    } catch (err: unknown) {
      const message = (
        (err as { stderr?: string }).stderr || (err instanceof Error ? err.message : String(err))
      )
        .replace(/postgres(ql)?:\/\/[^\s@]*@/gi, 'postgresql://***@')
        .slice(0, 1000);
      await this.audit(actorId, 'SETTINGS_BACKUP_RESTORE_FAILED', 'CRITICAL', {
        id,
        error: message,
      });
      return { ok: false, error: message, safetyBackupId: safety.id };
    } finally {
      await this.releaseLock();
    }
  }

  private audit(
    userId: number | undefined,
    action: string,
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
    metadata: unknown,
  ) {
    return writeChainedAuditLog(this.prisma, {
      userId,
      action,
      entity: 'Settings',
      severity,
      metadata: JSON.stringify(metadata),
    }).catch(() => undefined);
  }
}
