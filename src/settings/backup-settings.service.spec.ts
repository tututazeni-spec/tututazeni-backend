import { BadRequestException } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { BackupSettingsService } from './backup-settings.service';
import { writeChainedAuditLog } from '../common/helpers/audit-chain';

jest.mock('node:child_process', () => ({ execFile: jest.fn() }));
jest.mock('node:fs', () => ({
  promises: {
    mkdir: jest.fn(),
    access: jest.fn(),
    stat: jest.fn(),
    rm: jest.fn(),
    constants: { W_OK: 2 },
  },
}));
jest.mock('../common/helpers/audit-chain', () => ({
  writeChainedAuditLog: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../common/helpers/tenant.helper', () => ({
  resolveDefaultTenantId: jest.fn().mockResolvedValue(1),
}));

const exec = execFile as unknown as jest.Mock;
const fsm = fs as unknown as Record<string, jest.Mock>;
const audit = writeChainedAuditLog as jest.Mock;

type ExecCb = (err: unknown, res?: { stdout: string; stderr: string }) => void;
/** Faz o execFile responder de acordo com `handler(cmd, args)`; lançar = falha do processo. */
const onExec = (handler: (cmd: string, args: string[]) => void) =>
  exec.mockImplementation((cmd: string, args: string[], _o: unknown, cb: ExecCb) => {
    try {
      handler(cmd, args);
      cb(null, { stdout: '', stderr: '' });
    } catch (e) {
      cb(e);
    }
  });

const settingsJson = (over: object = {}) =>
  JSON.stringify({ enabled: true, destinationDir: '/backups', frequency: 'DAILY', ...over });

describe('BackupSettingsService', () => {
  let prisma: any;
  let redis: { set: jest.Mock; del: jest.Mock } | undefined;
  let service: BackupSettingsService;
  const env = { ...process.env };

  const build = (withRedis = true) => {
    redis = withRedis
      ? { set: jest.fn().mockResolvedValue('OK'), del: jest.fn().mockResolvedValue(1) }
      : undefined;
    service = new BackupSettingsService(prisma, redis as never);
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.DATABASE_URL = 'postgresql://app:s3cretpw@db:5432/innova?schema=public';
    delete process.env.BACKUP_RESTORE_ENABLED;
    delete process.env.PG_DUMP_PATH;
    delete process.env.PG_RESTORE_PATH;

    prisma = {
      tenantConfig: {
        findUnique: jest.fn().mockResolvedValue({ backupSettingsJson: settingsJson() }),
        update: jest.fn().mockResolvedValue({}),
      },
      backupRun: {
        create: jest.fn().mockResolvedValue({ id: 100 }),
        update: jest
          .fn()
          .mockImplementation(async ({ data }) => ({ id: 100, finishedAt: new Date(), ...data })),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn(),
        aggregate: jest.fn().mockResolvedValue({ _count: { _all: 0 }, _sum: { sizeBytes: null } }),
      },
      scalabilityInfraSettings: { upsert: jest.fn().mockResolvedValue({}) },
    };
    prisma.read = prisma;
    fsm.mkdir.mockResolvedValue(undefined);
    fsm.access.mockResolvedValue(undefined);
    fsm.stat.mockResolvedValue({ size: 2048 });
    fsm.rm.mockResolvedValue(undefined);
    onExec(() => undefined);
    build();
  });

  afterAll(() => {
    process.env = env;
  });

  describe('update', () => {
    it('recusa pasta relativa ou com ".."', async () => {
      await expect(service.update({ destinationDir: 'relativa' } as never)).rejects.toThrow(
        /caminho absoluto/,
      );
      await expect(service.update({ destinationDir: '/a/../etc' } as never)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.tenantConfig.update).not.toHaveBeenCalled();
    });

    it('não deixa activar sem pasta de destino', async () => {
      prisma.tenantConfig.findUnique.mockResolvedValue({ backupSettingsJson: null });
      await expect(service.update({ enabled: true } as never)).rejects.toThrow(/pasta de destino/);
    });

    it('recusa pasta onde não é possível escrever', async () => {
      fsm.access.mockRejectedValue(new Error('EACCES'));
      await expect(service.update({ destinationDir: '/ro' } as never)).rejects.toThrow(
        /permissão de escrita/,
      );
      expect(prisma.tenantConfig.update).not.toHaveBeenCalled();
    });

    it('cria a pasta, ignora campos undefined e preserva os restantes', async () => {
      await service.update({ retentionDays: 10, hour: undefined } as never, 3);
      expect(fsm.mkdir).toHaveBeenCalledWith('/backups', { recursive: true });
      const saved = JSON.parse(prisma.tenantConfig.update.mock.calls[0][0].data.backupSettingsJson);
      expect(saved).toMatchObject({ retentionDays: 10, destinationDir: '/backups', hour: 2 });
    });

    it('audita com severidade HIGH e a falha da auditoria não impede a gravação', async () => {
      audit.mockRejectedValueOnce(new Error('audit down'));
      await expect(service.update({ retentionDays: 5 } as never, 3)).resolves.toBeDefined();
      expect(audit).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({ action: 'SETTINGS_BACKUP_UPDATE', severity: 'HIGH', userId: 3 }),
      );
      expect(prisma.tenantConfig.update).toHaveBeenCalled();
    });
  });

  describe('runBackup', () => {
    it('exige pasta de destino', async () => {
      prisma.tenantConfig.findUnique.mockResolvedValue({ backupSettingsJson: null });
      await expect(service.runBackup('MANUAL')).rejects.toThrow(/pasta de destino/);
      expect(prisma.backupRun.create).not.toHaveBeenCalled();
    });

    it('recusa quando o lock está ocupado e não cria registo nem corre pg_dump', async () => {
      redis!.set.mockResolvedValue(null);
      await expect(service.runBackup('MANUAL')).rejects.toThrow(/em curso/);
      expect(prisma.backupRun.create).not.toHaveBeenCalled();
      expect(exec).not.toHaveBeenCalled();
    });

    it('sucesso: corre pg_dump em formato custom, sem o parâmetro ?schema= da URL', async () => {
      const calls: string[][] = [];
      onExec((_c, args) => void calls.push(args));

      const res = await service.runBackup('MANUAL', 4);

      const dump = calls.find(a => a.includes('--format=custom'))!;
      expect(dump).toEqual(
        expect.arrayContaining([
          '--no-owner',
          expect.stringMatching(/^--file=[\\/]backups[\\/]innova-.*\.dump$/),
        ]),
      );
      const dbname = dump.find(a => a.startsWith('--dbname='))!;
      expect(dbname).not.toContain('schema=');
      expect(res).toMatchObject({ status: 'SUCCESS', sizeBytes: 2048 });
      expect(prisma.backupRun.create.mock.calls[0][0].data).toMatchObject({
        trigger: 'MANUAL',
        status: 'RUNNING',
        triggeredById: 4,
      });
    });

    it('usa PG_DUMP_PATH quando definido', async () => {
      process.env.PG_DUMP_PATH = '/opt/pg/bin/pg_dump';
      await service.runBackup('MANUAL');
      expect(exec.mock.calls.find(c => c[1].includes('--format=custom'))![0]).toBe(
        '/opt/pg/bin/pg_dump',
      );
    });

    it('sucesso: actualiza o indicador de escalabilidade, aplica retenção e liberta o lock', async () => {
      await service.runBackup('SCHEDULED');
      expect(prisma.scalabilityInfraSettings.upsert).toHaveBeenCalled();
      expect(prisma.backupRun.findMany).toHaveBeenCalled(); // applyRetention
      expect(redis!.del).toHaveBeenCalled();
    });

    it('falha do pg_dump: devolve FAILED (não lança), regista erro e liberta o lock', async () => {
      onExec(() => {
        throw Object.assign(new Error('boom'), { stderr: 'pg_dump: connection refused' });
      });
      const res = await service.runBackup('MANUAL');
      expect(res).toMatchObject({ status: 'FAILED', sizeBytes: null });
      expect(prisma.backupRun.update.mock.calls.at(-1)[0].data).toMatchObject({
        status: 'FAILED',
        error: 'pg_dump: connection refused',
      });
      expect(redis!.del).toHaveBeenCalled();
      expect(audit).toHaveBeenCalledWith(prisma, expect.objectContaining({ severity: 'HIGH' }));
    });

    it('a password da base de dados nunca fica gravada na mensagem de erro', async () => {
      onExec(() => {
        throw Object.assign(new Error('x'), {
          stderr: 'failed: postgresql://app:s3cretpw@db:5432/innova and postgres://u:p2@h/d',
        });
      });
      await service.runBackup('MANUAL');
      const stored = prisma.backupRun.update.mock.calls.at(-1)[0].data.error as string;
      expect(stored).not.toContain('s3cretpw');
      expect(stored).not.toContain('p2');
      expect(stored).toContain('postgresql://***@');
    });

    it('a mensagem de erro é truncada a 1000 caracteres', async () => {
      onExec(() => {
        throw Object.assign(new Error('x'), { stderr: 'e'.repeat(5000) });
      });
      await service.runBackup('MANUAL');
      expect(prisma.backupRun.update.mock.calls.at(-1)[0].data.error).toHaveLength(1000);
    });

    it('sem DATABASE_URL falha de forma controlada (FAILED) e liberta o lock', async () => {
      delete process.env.DATABASE_URL;
      const res = await service.runBackup('MANUAL');
      expect(res.status).toBe('FAILED');
      expect(redis!.del).toHaveBeenCalled();
    });

    it('sem Redis, o lock local impede duas execuções em simultâneo', async () => {
      build(false);
      let release!: () => void;
      const gate = new Promise<void>(r => (release = r));
      exec.mockImplementation((_c: string, _a: string[], _o: unknown, cb: ExecCb) => {
        void gate.then(() => cb(null, { stdout: '', stderr: '' }));
      });

      const first = service.runBackup('MANUAL');
      await new Promise(r => setImmediate(r));
      await expect(service.runBackup('MANUAL')).rejects.toThrow(/em curso/);

      release();
      await first;
      await expect(service.runBackup('MANUAL')).resolves.toBeDefined(); // lock libertado
    });

    it('se o Redis falhar, cai para o lock local em vez de bloquear os backups', async () => {
      redis!.set.mockRejectedValue(new Error('redis down'));
      await expect(service.runBackup('MANUAL')).resolves.toMatchObject({ status: 'SUCCESS' });
    });
  });

  describe('applyRetention', () => {
    const day = 86_400_000;
    const live = [
      { id: 1, startedAt: new Date(Date.now() - 100 * day), filePath: '/backups/old1.dump' },
      { id: 2, startedAt: new Date(Date.now() - 90 * day), filePath: '/backups/old2.dump' },
      { id: 3, startedAt: new Date(Date.now() - 1 * day), filePath: '/backups/new.dump' },
    ];

    it('apaga ficheiro e marca deletedAt só dos expirados, devolvendo quantos', async () => {
      prisma.backupRun.findMany.mockResolvedValue(live);
      const n = await service.applyRetention({ retentionDays: 30, minCopies: 1 } as never);
      expect(n).toBe(2);
      expect(fsm.rm).toHaveBeenCalledWith('/backups/old1.dump', { force: true });
      expect(fsm.rm).not.toHaveBeenCalledWith('/backups/new.dump', expect.anything());
      expect(prisma.backupRun.update).toHaveBeenCalledTimes(2);
    });

    it('um ficheiro que não se consegue apagar não impede de marcar os restantes', async () => {
      prisma.backupRun.findMany.mockResolvedValue(live);
      fsm.rm.mockRejectedValueOnce(new Error('EBUSY'));
      await expect(
        service.applyRetention({ retentionDays: 30, minCopies: 1 } as never),
      ).resolves.toBe(2);
    });

    it('só considera backups com sucesso, não apagados e com ficheiro', async () => {
      await service.applyRetention({ retentionDays: 30, minCopies: 1 } as never);
      expect(prisma.backupRun.findMany.mock.calls[0][0].where).toEqual({
        status: 'SUCCESS',
        deletedAt: null,
        filePath: { not: null },
      });
    });
  });

  describe('scheduledTick', () => {
    let runSpy: jest.SpyInstance;
    beforeEach(() => {
      runSpy = jest.spyOn(service, 'runBackup').mockResolvedValue({} as never);
    });

    it('desactivado → não corre', async () => {
      prisma.tenantConfig.findUnique.mockResolvedValue({
        backupSettingsJson: settingsJson({ enabled: false }),
      });
      await service.scheduledTick();
      expect(runSpy).not.toHaveBeenCalled();
    });

    it('em dia → não corre', async () => {
      prisma.backupRun.findFirst.mockResolvedValue({ startedAt: new Date() });
      await service.scheduledTick();
      expect(runSpy).not.toHaveBeenCalled();
    });

    it('em atraso (ou nunca correu) → corre com trigger SCHEDULED', async () => {
      await service.scheduledTick();
      expect(runSpy).toHaveBeenCalledWith('SCHEDULED');
    });

    it('nunca lança: outro nó com o lock ou BD em baixo ficam para a próxima hora', async () => {
      runSpy.mockRejectedValue(new BadRequestException('em curso'));
      await expect(service.scheduledTick()).resolves.toBeUndefined();
      prisma.tenantConfig.findUnique.mockRejectedValue(new Error('db down'));
      await expect(service.scheduledTick()).resolves.toBeUndefined();
    });
  });

  describe('restore', () => {
    const good = { id: 7, status: 'SUCCESS', deletedAt: null, filePath: '/backups/x.dump' };
    const dto = { confirmation: 'RESTAURAR' } as never;

    beforeEach(() => {
      process.env.BACKUP_RESTORE_ENABLED = 'true';
      prisma.backupRun.findUnique.mockResolvedValue(good);
    });

    it('está desactivado por omissão em qualquer ambiente', async () => {
      delete process.env.BACKUP_RESTORE_ENABLED;
      await expect(service.restore(7, dto, 1)).rejects.toThrow(/desactivada/);
      expect(exec).not.toHaveBeenCalled();
    });

    it.each(['true ', 'TRUE', '1', 'yes'])(
      'BACKUP_RESTORE_ENABLED=%j não conta como activo',
      async v => {
        process.env.BACKUP_RESTORE_ENABLED = v;
        await expect(service.restore(7, dto, 1)).rejects.toThrow(/desactivada/);
      },
    );

    it.each(['restaurar', 'RESTAURAR ', '', 'SIM'])(
      'confirmação %j é recusada',
      async confirmation => {
        await expect(service.restore(7, { confirmation } as never, 1)).rejects.toThrow(/Confirme/);
        expect(exec).not.toHaveBeenCalled();
      },
    );

    it.each([
      ['inexistente', null],
      ['falhado', { ...good, status: 'FAILED' }],
      ['já eliminado', { ...good, deletedAt: new Date() }],
      ['sem ficheiro', { ...good, filePath: null }],
    ])('backup %s é recusado', async (_n, row) => {
      prisma.backupRun.findUnique.mockResolvedValue(row);
      await expect(service.restore(7, dto, 1)).rejects.toThrow(
        /inexistente, falhado ou já eliminado/,
      );
    });

    it('ficheiro desaparecido da pasta → erro claro, sem cópia de segurança nem restauro', async () => {
      fsm.access.mockRejectedValue(new Error('ENOENT'));
      await expect(service.restore(7, dto, 1)).rejects.toThrow(/já não existe/);
      expect(exec).not.toHaveBeenCalled();
    });

    it('se a cópia de segurança prévia falhar, NÃO restaura', async () => {
      onExec(() => {
        throw new Error('pg_dump falhou');
      });
      await expect(service.restore(7, dto, 1)).rejects.toThrow(/restauração cancelada/);
      const tools = exec.mock.calls.map(c => c[1]);
      expect(tools.some((a: string[]) => a.includes('--clean'))).toBe(false);
    });

    it('sucesso: copia o estado actual primeiro e só depois corre pg_restore --clean', async () => {
      const order: string[] = [];
      onExec((_c, args) => void order.push(args.includes('--format=custom') ? 'dump' : 'restore'));

      const res = await service.restore(7, dto, 1);

      expect(order).toEqual(['dump', 'restore']);
      const restoreArgs = exec.mock.calls.find(c => c[1].includes('--clean'))![1] as string[];
      expect(restoreArgs).toEqual(
        expect.arrayContaining(['--clean', '--if-exists', '/backups/x.dump']),
      );
      expect(restoreArgs.find(a => a.startsWith('--dbname='))).not.toContain('schema=');
      expect(res).toEqual({ ok: true, safetyBackupId: 100 });
      expect(prisma.backupRun.update.mock.calls[0][0].data.status).toBe('SUCCESS'); // cópia prévia
    });

    it('audita início e fim com severidade CRITICAL e regista quem restaurou', async () => {
      await service.restore(7, dto, 1);
      const actions = audit.mock.calls.map(c => [c[1].action, c[1].severity]);
      expect(actions).toEqual(
        expect.arrayContaining([
          ['SETTINGS_BACKUP_RESTORE_START', 'CRITICAL'],
          ['SETTINGS_BACKUP_RESTORE_DONE', 'CRITICAL'],
        ]),
      );
      expect(prisma.backupRun.updateMany).toHaveBeenCalledWith({
        where: { id: 7 },
        data: { restoredAt: expect.any(Date), restoredById: 1 },
      });
    });

    it('falha do pg_restore: devolve ok=false com a cópia de segurança, sem password, e audita', async () => {
      onExec((_c, args) => {
        if (args.includes('--clean')) {
          throw Object.assign(new Error('x'), {
            stderr: 'could not connect postgresql://app:s3cretpw@db/innova',
          });
        }
      });
      const res = await service.restore(7, dto, 1);
      expect(res).toMatchObject({ ok: false, safetyBackupId: 100 });
      expect((res as { error: string }).error).not.toContain('s3cretpw');
      expect(audit.mock.calls.map(c => c[1].action)).toContain('SETTINGS_BACKUP_RESTORE_FAILED');
      expect(redis!.del).toHaveBeenCalled();
    });
  });

  describe('get (estado de saúde)', () => {
    const run = (status: string, ago: number) => ({
      status,
      startedAt: new Date(Date.now() - ago * 3_600_000),
    });
    const withRuns = (last: unknown, lastSuccess: unknown) => {
      prisma.backupRun.findFirst.mockImplementation(async (q: any) =>
        q?.where?.status === 'SUCCESS' ? lastSuccess : last,
      );
    };

    it('NEVER: activo mas nunca correu', async () => {
      expect((await service.get()).health).toBe('NEVER');
    });

    it('FAILED: nunca teve sucesso e a última falhou', async () => {
      withRuns(run('FAILED', 1), null);
      expect((await service.get()).health).toBe('FAILED');
    });

    it('FAILED: teve sucesso mas a execução mais recente falhou', async () => {
      withRuns(run('FAILED', 1), run('SUCCESS', 30));
      expect((await service.get()).health).toBe('FAILED');
    });

    it('HEALTHY: sucesso recente', async () => {
      const ok = run('SUCCESS', 3);
      withRuns(ok, ok);
      expect((await service.get()).health).toBe('HEALTHY');
    });

    it('STALE: último sucesso com mais de 2 períodos', async () => {
      const old = run('SUCCESS', 49); // DAILY → limite 48h
      withRuns(old, old);
      expect((await service.get()).health).toBe('STALE');
    });

    it('DISABLED: tudo bem mas os backups estão desligados', async () => {
      prisma.tenantConfig.findUnique.mockResolvedValue({
        backupSettingsJson: settingsJson({ enabled: false }),
      });
      const ok = run('SUCCESS', 3);
      withRuns(ok, ok);
      const view = await service.get();
      expect(view.health).toBe('DISABLED');
      expect(view.nextRunAt).toBeNull();
    });

    it('converte BigInt para número e reporta cópias guardadas', async () => {
      prisma.backupRun.aggregate.mockResolvedValue({
        _count: { _all: 3 },
        _sum: { sizeBytes: BigInt(5000) },
      });
      prisma.backupRun.findMany.mockResolvedValue([
        { id: 1, sizeBytes: BigInt(10) },
        { id: 2, sizeBytes: null },
      ]);
      const view = await service.get();
      expect(view).toMatchObject({ storedCopies: 3, storedBytes: 5000 });
      expect(view.runs.map(r => r.sizeBytes)).toEqual([10, null]);
      expect(() => JSON.stringify(view)).not.toThrow(); // BigInt cru rebentaria aqui
    });

    it('indica se pg_dump/pg_restore estão disponíveis e se o restauro está activo', async () => {
      onExec(cmd => {
        if (cmd === 'pg_restore') throw new Error('ENOENT');
      });
      process.env.BACKUP_RESTORE_ENABLED = 'true';
      const view = await service.get();
      expect(view.tools).toEqual({ pgDump: true, pgRestore: false });
      expect(view.restoreEnabled).toBe(true);
    });
  });
});
