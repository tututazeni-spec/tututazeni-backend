import { AntivirusConfig } from './antivirus';
import * as remote from './remote-file';
import { RemoteFileSweeper, sweepEnabled, sweepMaxPerRun } from './remote-file-sweeper';
import { STORED_FILE_TARGETS, StoredFileTarget } from './stored-file-catalog';
import { MemoryVerdictCache, verdictKey } from './verdict-cache';
import { getRequestContext } from '../logging/request-context';

const avOff: AntivirusConfig = {
  enabled: false,
  host: '127.0.0.1',
  port: 3310,
  timeoutMs: 1000,
  failMode: 'open',
  maxBytes: 25 * 1024 * 1024,
};

type Row = Record<string, unknown>;

/** Tabela falsa que respeita `id > cursor` (inteiros e texto), a ordenação e o `take`. */
function fakeTable(rows: Row[]) {
  const calls: unknown[] = [];
  const cmp = (a: unknown, b: unknown) =>
    typeof a === 'number' && typeof b === 'number'
      ? a - b
      : String(a).localeCompare(String(b), 'en');
  return {
    calls,
    findMany: jest.fn(async (args: { where: { id?: { gt: unknown } }; take: number }) => {
      calls.push(args);
      const after = args.where.id?.gt;
      return rows
        .filter(r => after === undefined || cmp(r.id, after) > 0)
        .sort((a, b) => cmp(a.id, b.id))
        .slice(0, args.take);
    }),
  };
}

function setup(tables: Record<string, Row[]>) {
  const prisma: Record<string, ReturnType<typeof fakeTable>> = {};
  for (const [name, rows] of Object.entries(tables)) prisma[name] = fakeTable(rows);
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const sweeper = new RemoteFileSweeper(prisma as never, audit as never);
  return { sweeper, prisma, audit };
}

const docTargets: StoredFileTarget[] = [
  { model: 'document', field: 'fileUrl', mimeField: 'mimeType' },
];
const url = (n: number) => `https://files.test/docs/${n}.pdf`;
const docRows = (n: number): Row[] =>
  Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    fileUrl: url(i + 1),
    mimeType: 'application/pdf',
  }));

describe('RemoteFileSweeper — varrimento periódico', () => {
  let verify: jest.SpyInstance;
  const saved = { ...process.env };

  beforeEach(() => {
    process.env.ALLOWED_FILE_HOST = 'files.test';
    verify = jest.spyOn(remote, 'verifyRemoteFile').mockResolvedValue(null);
  });
  afterEach(() => {
    verify.mockRestore();
    remote.setDeferredVerifier(undefined);
    process.env = { ...saved };
  });

  const sweep = (
    s: RemoteFileSweeper,
    cache: MemoryVerdictCache,
    extra: { targets?: StoredFileTarget[]; maxPerRun?: number } = {},
  ) => s.runSweep({ targets: docTargets, cache, av: avOff, pauseMs: 0, ...extra });

  it('verifica cada ficheiro registado, com o MIME da coluna e em segundo plano', async () => {
    const { sweeper } = setup({ document: docRows(3) });
    const summary = await sweep(sweeper, new MemoryVerdictCache());
    expect(summary).toMatchObject({ checked: 3, flagged: 0, errors: 0 });
    expect(verify).toHaveBeenCalledTimes(3);
    expect(verify).toHaveBeenCalledWith(
      url(1),
      { declaredMime: 'application/pdf', background: true },
      expect.objectContaining({ enabled: true, failMode: 'open' }),
      avOff,
    );
  });

  it('nunca trata falhas de obtenção como suspeitas: força failMode open mesmo se o resto for closed', async () => {
    process.env.REMOTE_FILE_FAIL_MODE = 'closed';
    process.env.REMOTE_FILE_VERIFY = 'false';
    const { sweeper } = setup({ document: docRows(1) });
    await sweep(sweeper, new MemoryVerdictCache());
    expect(verify.mock.calls[0][2]).toMatchObject({ enabled: true, failMode: 'open' });
  });

  it('pergunta só por URLs https e ignora hosts fora da allowlist', async () => {
    const rows: Row[] = [
      { id: 1, fileUrl: url(1), mimeType: null },
      { id: 2, fileUrl: 'https://evil.test/x.pdf', mimeType: null },
      { id: 3, fileUrl: 'https://FILES.test/docs/3.pdf', mimeType: null },
      { id: 4, fileUrl: 'https://[invalido', mimeType: null },
    ];
    const { sweeper, prisma } = setup({ document: rows });
    const summary = await sweep(sweeper, new MemoryVerdictCache());
    expect(summary).toMatchObject({ checked: 2, skippedHosts: 2 });
    expect(JSON.stringify(prisma.document.calls[0])).toContain('"startsWith":"https://"');
  });

  describe('ficheiros recusados', () => {
    it('assinala no AuditLog como SYSTEM, HIGH para malware, sem o URL', async () => {
      verify.mockImplementation(async (u: string) =>
        u === url(2) ? 'Ficheiro rejeitado: malware detectado (Win.Test.EICAR_HDB-1).' : null,
      );
      const { sweeper, audit } = setup({ document: docRows(3) });
      const summary = await sweep(sweeper, new MemoryVerdictCache());
      expect(summary.flagged).toBe(1);
      expect(audit.log).toHaveBeenCalledTimes(1);
      const entry = audit.log.mock.calls[0][0];
      expect(entry).toMatchObject({
        userId: 0,
        action: 'STORED_FILE_FLAGGED',
        entity: 'Document',
        entityId: 2,
        status: 'DENIED',
        severity: 'HIGH',
        actorType: 'SYSTEM',
        source: 'JOB',
        metadata: { field: 'fileUrl', model: 'document', id: 2 },
      });
      expect(JSON.stringify(entry)).not.toContain('files.test');
    });

    it('motivos que não são malware/executável ficam MEDIUM', async () => {
      verify.mockResolvedValue('O ficheiro excede 200 MB.');
      const { sweeper, audit } = setup({ document: docRows(1) });
      await sweep(sweeper, new MemoryVerdictCache());
      expect(audit.log.mock.calls[0][0]).toMatchObject({ severity: 'MEDIUM' });
    });

    it('assinala o mesmo ficheiro no máximo uma vez por semana, mesmo em varrimentos seguidos', async () => {
      verify.mockResolvedValue('Ficheiro rejeitado: contém executável Windows (PE/MZ).');
      const cache = new MemoryVerdictCache();
      const { sweeper, audit } = setup({ document: docRows(1) });
      await sweep(sweeper, cache);
      await cache.setCursor('document.fileUrl', null); // força a mesma linha no 2.º varrimento
      const second = await sweep(sweeper, cache);
      expect(second.flagged).toBe(1); // continua a contar como recusado…
      expect(audit.log).toHaveBeenCalledTimes(1); // …mas não volta a encher o AuditLog
      expect(await cache.markOnce(`flag:${verdictKey(url(1))}`, 60)).toBe(false);
    });

    it('uma falha ao auditar não pára o varrimento', async () => {
      verify.mockResolvedValue('Ficheiro rejeitado: x');
      const { sweeper, audit } = setup({ document: docRows(2) });
      audit.log.mockRejectedValue(new Error('db down'));
      const summary = await sweep(sweeper, new MemoryVerdictCache());
      expect(summary.checked).toBe(2);
    });
  });

  describe('orçamento e cursor', () => {
    it('respeita o máximo por execução e retoma onde ficou', async () => {
      const cache = new MemoryVerdictCache();
      const { sweeper } = setup({ document: docRows(50) });
      const first = await sweep(sweeper, cache, { maxPerRun: 20 });
      expect(first.checked).toBe(20);
      expect(await cache.getCursor('document.fileUrl')).toBe(20);

      verify.mockClear();
      await sweep(sweeper, cache, { maxPerRun: 20 });
      expect(verify.mock.calls[0][0]).toBe(url(21)); // não repete os 20 primeiros
      expect(await cache.getCursor('document.fileUrl')).toBe(40);
    });

    it('chegando ao fim da tabela recomeça do início na execução seguinte', async () => {
      const cache = new MemoryVerdictCache();
      const { sweeper } = setup({ document: docRows(5) });
      await sweep(sweeper, cache, { maxPerRun: 100 });
      expect(await cache.getCursor('document.fileUrl')).toBeNull();
      verify.mockClear();
      await sweep(sweeper, cache, { maxPerRun: 100 });
      expect(verify.mock.calls[0][0]).toBe(url(1));
    });

    it('tabelas com ids de texto (cuid/uuid) também são percorridas e retomadas', async () => {
      const rows: Row[] = Array.from({ length: 30 }, (_, i) => ({
        id: `clx${String(i).padStart(2, '0')}`,
        fileUrl: url(i + 1),
        mimeType: null,
      }));
      const cache = new MemoryVerdictCache();
      const { sweeper, audit } = setup({ libraryItem: rows });
      const targets: StoredFileTarget[] = [{ model: 'libraryItem', field: 'fileUrl' }];
      const run = () => sweeper.runSweep({ targets, cache, av: avOff, pauseMs: 0, maxPerRun: 20 });

      // 1.ª execução: o orçamento (20) pára a meio e guarda o último id de TEXTO visto.
      expect((await run()).checked).toBe(20);
      expect(await cache.getCursor('libraryItem.fileUrl')).toBe('clx19');
      expect(verify.mock.calls[0][0]).toBe(url(1));

      // 2.ª execução: retoma depois de clx19 (não repete) e, ao chegar ao fim, recomeça.
      verify.mockClear();
      expect((await run()).checked).toBe(10);
      expect(verify.mock.calls[0][0]).toBe(url(21));
      expect(await cache.getCursor('libraryItem.fileUrl')).toBeNull();

      // Ids de texto não cabem em AuditLog.entityId (Int): vão só em metadata.
      verify.mockResolvedValue('Ficheiro rejeitado: x');
      await run();
      const entry = audit.log.mock.calls[0][0];
      expect(entry.entityId).toBeUndefined();
      expect(entry.metadata).toMatchObject({ model: 'libraryItem', id: 'clx00' });
    });

    it('divide o orçamento pelos alvos, com um mínimo por alvo', async () => {
      const { sweeper, prisma } = setup({ document: docRows(100), docVersion: docRows(100) });
      const targets: StoredFileTarget[] = [
        { model: 'document', field: 'fileUrl' },
        { model: 'docVersion', field: 'fileUrl' },
      ];
      const summary = await sweeper.runSweep({
        targets,
        cache: new MemoryVerdictCache(),
        av: avOff,
        pauseMs: 0,
        maxPerRun: 60,
      });
      expect(summary.perTarget).toEqual({ 'document.fileUrl': 30, 'docVersion.fileUrl': 30 });
      expect(prisma.document.findMany).toHaveBeenCalled();
    });
  });

  describe('robustez', () => {
    it('um modelo que não existe no cliente Prisma é saltado', async () => {
      const { sweeper } = setup({ document: docRows(1) });
      const summary = await sweeper.runSweep({
        targets: [{ model: 'naoExiste', field: 'fileUrl' }, ...docTargets],
        cache: new MemoryVerdictCache(),
        av: avOff,
        pauseMs: 0,
      });
      expect(summary.checked).toBe(1);
    });

    it('um erro na base de dados num alvo conta como erro e não impede os outros', async () => {
      const { sweeper, prisma } = setup({ document: docRows(1), docVersion: docRows(2) });
      prisma.document.findMany.mockRejectedValue(new Error('boom'));
      const summary = await sweeper.runSweep({
        targets: [
          { model: 'document', field: 'fileUrl' },
          { model: 'docVersion', field: 'fileUrl' },
        ],
        cache: new MemoryVerdictCache(),
        av: avOff,
        pauseMs: 0,
      });
      expect(summary.errors).toBe(1);
      expect(summary.checked).toBe(2);
    });

    it('uma excepção a verificar um ficheiro conta como erro e segue para o próximo', async () => {
      verify.mockRejectedValueOnce(new Error('inesperado'));
      const { sweeper } = setup({ document: docRows(3) });
      const summary = await sweep(sweeper, new MemoryVerdictCache());
      expect(summary).toMatchObject({ checked: 3, errors: 1 });
      expect(verify).toHaveBeenCalledTimes(3);
    });
  });

  describe('execução agendada', () => {
    it('desligada não faz nada', async () => {
      process.env.REMOTE_FILE_VERIFY = 'false';
      delete process.env.REMOTE_FILE_SWEEP;
      const { sweeper } = setup({ document: docRows(1) });
      const run = jest.spyOn(sweeper, 'runSweep');
      await sweeper.scheduled();
      expect(run).not.toHaveBeenCalled();
    });

    it('duas instâncias em simultâneo: só uma corre (trava partilhada)', async () => {
      process.env.REMOTE_FILE_SWEEP = 'true';
      const shared = new MemoryVerdictCache();
      const cacheModule = jest
        .spyOn(await import('./verdict-cache'), 'getVerdictCache')
        .mockReturnValue(shared);
      const a = setup({ document: docRows(1) });
      const b = setup({ document: docRows(1) });
      let release!: () => void;
      const gate = new Promise<void>(r => (release = r));
      const runA = jest.spyOn(a.sweeper, 'runSweep').mockImplementation(async () => {
        await gate;
        return { checked: 0, flagged: 0, skippedHosts: 0, errors: 0, perTarget: {} };
      });
      const runB = jest.spyOn(b.sweeper, 'runSweep');
      const first = a.sweeper.scheduled();
      await new Promise(r => setImmediate(r));
      await b.sweeper.scheduled(); // a trava está tomada: sai sem correr
      expect(runB).not.toHaveBeenCalled();
      release();
      await first;
      expect(runA).toHaveBeenCalledTimes(1);
      // Libertada no fim: uma execução seguinte já pode correr.
      await b.sweeper.scheduled();
      expect(runB).toHaveBeenCalledTimes(1);
      cacheModule.mockRestore();
    });

    it('uma falha no varrimento liberta a trava', async () => {
      process.env.REMOTE_FILE_SWEEP = 'true';
      const shared = new MemoryVerdictCache();
      const spy = jest
        .spyOn(await import('./verdict-cache'), 'getVerdictCache')
        .mockReturnValue(shared);
      const { sweeper } = setup({ document: docRows(1) });
      jest.spyOn(sweeper, 'runSweep').mockRejectedValue(new Error('boom'));
      await expect(sweeper.scheduled()).resolves.toBeUndefined();
      expect(await shared.lock('sweep', 60)).not.toBeNull();
      spy.mockRestore();
    });
  });

  describe('configuração', () => {
    it('REMOTE_FILE_SWEEP explícito ganha; senão acompanha REMOTE_FILE_VERIFY', () => {
      expect(sweepEnabled({ REMOTE_FILE_VERIFY: 'true' })).toBe(true);
      expect(sweepEnabled({ REMOTE_FILE_VERIFY: 'false' })).toBe(false);
      expect(sweepEnabled({})).toBe(false);
      expect(sweepEnabled({ REMOTE_FILE_VERIFY: 'true', REMOTE_FILE_SWEEP: 'false' })).toBe(false);
      expect(sweepEnabled({ REMOTE_FILE_VERIFY: 'false', REMOTE_FILE_SWEEP: 'true' })).toBe(true);
    });
    it('máximo por execução: omissão 2000, inválidos ignorados', () => {
      expect(sweepMaxPerRun({})).toBe(2000);
      expect(sweepMaxPerRun({ REMOTE_FILE_SWEEP_MAX_PER_RUN: '500' })).toBe(500);
      for (const bad of ['0', '-1', 'x', '1.5']) {
        expect(sweepMaxPerRun({ REMOTE_FILE_SWEEP_MAX_PER_RUN: bad })).toBe(2000);
      }
    });
  });
});

describe('RemoteFileSweeper — fila de ficheiros grandes', () => {
  let verify: jest.SpyInstance;
  const saved = { ...process.env };
  beforeEach(() => {
    process.env.ALLOWED_FILE_HOST = 'files.test';
    verify = jest.spyOn(remote, 'verifyRemoteFile').mockResolvedValue(null);
  });
  afterEach(() => {
    verify.mockRestore();
    remote.setDeferredVerifier(undefined);
    process.env = { ...saved };
  });

  it('regista-se como verificador só se a verificação remota está ligada', () => {
    const spy = jest.spyOn(remote, 'setDeferredVerifier');
    process.env.REMOTE_FILE_VERIFY = 'false';
    setup({}).sweeper.onModuleInit();
    expect(spy).not.toHaveBeenCalled();
    process.env.REMOTE_FILE_VERIFY = 'true';
    setup({}).sweeper.onModuleInit();
    expect(spy).toHaveBeenCalledWith(expect.any(Function));
    spy.mockRestore();
  });

  it('verifica em segundo plano com o contexto de quem enviou o ficheiro', async () => {
    let seen: ReturnType<typeof getRequestContext> = {};
    verify.mockImplementation(async () => {
      seen = getRequestContext();
      return null;
    });
    const { sweeper } = setup({});
    sweeper.enqueue({ url: url(9), declaredMime: 'video/mp4', userId: 42, reqId: 'req-9' });
    await sweeper.drain();
    expect(verify).toHaveBeenCalledWith(
      url(9),
      { declaredMime: 'video/mp4', background: true },
      expect.objectContaining({ failMode: 'open' }),
      expect.anything(),
    );
    expect(seen).toMatchObject({ userId: 42, reqId: 'req-9' });
  });

  it('processa em série, por ordem, e não repete o mesmo URL pendente', async () => {
    const order: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>(r => (release = r));
    verify.mockImplementation(async (u: string) => {
      order.push(`start:${u}`);
      if (u === url(1)) await gate;
      order.push(`end:${u}`);
      return null;
    });
    const { sweeper } = setup({});
    sweeper.enqueue({ url: url(1) });
    sweeper.enqueue({ url: url(2) });
    sweeper.enqueue({ url: url(2) }); // duplicado enquanto espera
    await new Promise(r => setImmediate(r));
    expect(order).toEqual([`start:${url(1)}`]); // o 2.º só começa quando o 1.º acaba
    release();
    await sweeper.drain();
    await new Promise(r => setImmediate(r));
    expect(order).toEqual([`start:${url(1)}`, `end:${url(1)}`, `start:${url(2)}`, `end:${url(2)}`]);
  });

  it('uma verificação que falha não pára a fila', async () => {
    verify.mockRejectedValueOnce(new Error('boom')).mockResolvedValue(null);
    const { sweeper } = setup({});
    sweeper.enqueue({ url: url(1) });
    sweeper.enqueue({ url: url(2) });
    await sweeper.drain();
    await new Promise(r => setImmediate(r));
    expect(verify).toHaveBeenCalledTimes(2);
  });

  it('a fila é limitada: acima de 500 pendentes descarta (o varrimento diário apanha-os)', () => {
    verify.mockImplementation(() => new Promise(() => undefined)); // nunca acaba
    const { sweeper } = setup({});
    for (let i = 0; i < 600; i++) sweeper.enqueue({ url: url(i) });
    const pending = (sweeper as unknown as { pending: unknown[] }).pending;
    expect(pending.length).toBeLessThanOrEqual(500);
  });

  it('desligar a aplicação pára de processar e retira o verificador', async () => {
    const spy = jest.spyOn(remote, 'setDeferredVerifier');
    const { sweeper } = setup({});
    sweeper.onModuleDestroy();
    expect(spy).toHaveBeenCalledWith(undefined);
    sweeper.enqueue({ url: url(1) });
    await sweeper.drain();
    expect(verify).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('catálogo de ficheiros guardados', () => {
  it('não repete alvos e só usa colunas de URL de ficheiro', () => {
    const labels = STORED_FILE_TARGETS.map(t => `${t.model}.${t.field}`);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels).toEqual(
      expect.arrayContaining(['document.fileUrl', 'partner.logoUrl', 'declarationAttachment.url']),
    );
    expect(labels).not.toContain('contentAsset.url'); // ligações livres (YouTube) nunca se descarregam
  });
});
