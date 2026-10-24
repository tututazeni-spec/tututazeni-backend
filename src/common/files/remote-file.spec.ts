import * as http from 'http';
import * as net from 'net';
import { AntivirusConfig, ScanResult } from './antivirus';
import { docx, jpeg, pdf, png } from './file-fixtures';
import {
  httpsOpener,
  RemoteDeps,
  RemoteFileConfig,
  RemoteResponse,
  remoteFileConfig,
  REMOTE_BUFFER_LIMIT,
  verifyRemoteFile,
} from './remote-file';
import { addUploadRejectionSink, UploadRejectionEvent } from './upload-validation';

const EICAR = 'EICAR-STANDARD-ANTIVIRUS-TEST-FILE';
const URL_OK = 'https://files.test/docs/a.pdf';
const PUBLIC_IP = { address: '203.0.113.10', family: 4 };

const cfg = (over: Partial<RemoteFileConfig> = {}): RemoteFileConfig => ({
  enabled: true,
  maxBytes: 200 * 1024 * 1024,
  timeoutMs: 5000,
  failMode: 'open',
  syncMaxBytes: 25 * 1024 * 1024,
  cacheTtlSeconds: 3600,
  ...over,
});
const avOff: AntivirusConfig = {
  enabled: false,
  host: '127.0.0.1',
  port: 3310,
  timeoutMs: 1000,
  failMode: 'open',
  maxBytes: 25 * 1024 * 1024,
};
const avOn: AntivirusConfig = { ...avOff, enabled: true };

async function* chunked(buf: Buffer, size = 64 * 1024): AsyncGenerator<Buffer> {
  for (let off = 0; off < buf.length; off += size) yield buf.subarray(off, off + size);
}

interface FakeOpts {
  status?: number;
  headers?: Record<string, string>;
  body?: Buffer | AsyncIterable<Buffer>;
}
const reply =
  (o: FakeOpts = {}) =>
  (): Promise<RemoteResponse> => {
    const body = o.body ?? pdf();
    return Promise.resolve({
      status: o.status ?? 200,
      headers: { 'content-type': 'application/pdf', ...(o.headers ?? {}) },
      body: Buffer.isBuffer(body) ? chunked(body) : body,
      destroy: () => undefined,
    });
  };

const deps = (open: RemoteDeps['open'], extra: RemoteDeps = {}): RemoteDeps => ({
  resolve: () => Promise.resolve([PUBLIC_IP]),
  open,
  ...extra,
});

/** scan falso: percorre o fluxo todo e procura a string EICAR. */
const fakeScan: NonNullable<RemoteDeps['scan']> = async source => {
  let found = false;
  let tail = '';
  for await (const chunk of source) {
    const text = tail + chunk.toString('latin1');
    if (text.includes(EICAR)) found = true;
    tail = text.slice(-EICAR.length);
  }
  return found ? { status: 'infected', signature: 'Win.Test.EICAR_HDB-1' } : { status: 'clean' };
};

describe('verifyRemoteFile', () => {
  const events: UploadRejectionEvent[] = [];
  let remove: () => void;
  const saved = { ...process.env };
  beforeEach(() => {
    events.length = 0;
    remove = addUploadRejectionSink(e => events.push(e));
    process.env.ALLOWED_FILE_HOST = 'files.test,cdn.files.test';
    process.env.UPLOAD_VALIDATION_MODE = 'enforce';
  });
  afterEach(() => {
    remove();
    process.env = { ...saved };
  });

  const verify = (
    open: RemoteDeps['open'],
    opts: {
      url?: string;
      mime?: string;
      cfg?: Partial<RemoteFileConfig>;
      av?: AntivirusConfig;
      d?: RemoteDeps;
    } = {},
  ) =>
    verifyRemoteFile(
      opts.url ?? URL_OK,
      { declaredMime: opts.mime ?? 'application/pdf' },
      cfg(opts.cfg),
      opts.av ?? avOff,
      deps(open, opts.d),
    );

  describe('configuração', () => {
    it('desligado por omissão, com valores seguros', () => {
      expect(remoteFileConfig({})).toEqual({
        enabled: false,
        maxBytes: 200 * 1024 * 1024,
        timeoutMs: 30_000,
        failMode: 'open',
        syncMaxBytes: 25 * 1024 * 1024,
        cacheTtlSeconds: 86_400,
      });
    });
    it('lê o ambiente e ignora valores inválidos', () => {
      expect(
        remoteFileConfig({
          REMOTE_FILE_VERIFY: 'TRUE',
          REMOTE_FILE_MAX_BYTES: '5242880',
          REMOTE_FILE_TIMEOUT_MS: '8000',
          REMOTE_FILE_FAIL_MODE: 'closed',
        }),
      ).toEqual({
        enabled: true,
        maxBytes: 5242880,
        timeoutMs: 8000,
        failMode: 'closed',
        syncMaxBytes: 25 * 1024 * 1024,
        cacheTtlSeconds: 86_400,
      });
      expect(
        remoteFileConfig({ REMOTE_FILE_MAX_BYTES: '5', REMOTE_FILE_TIMEOUT_MS: 'x' }),
      ).toMatchObject({ maxBytes: 200 * 1024 * 1024, timeoutMs: 30_000 });
    });
    it('desligado não toca na rede', async () => {
      const open = jest.fn();
      const r = await verifyRemoteFile(URL_OK, {}, cfg({ enabled: false }), avOff, deps(open));
      expect(r).toBeNull();
      expect(open).not.toHaveBeenCalled();
    });
  });

  describe('ficheiros bons', () => {
    it.each([
      ['PDF', pdf(), 'application/pdf', 'application/pdf'],
      ['PNG', png(), 'image/png', 'image/png'],
      ['JPEG', jpeg(), 'image/jpeg', 'image/jpeg'],
      [
        'DOCX',
        docx(),
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ],
    ])('%s verdadeiro passa', async (_n, body, mime, contentType) => {
      const r = await verify(reply({ body, headers: { 'content-type': contentType } }), { mime });
      expect(r).toBeNull();
      expect(events).toHaveLength(0);
    });

    it('sem MIME declarado, usa o Content-Type e depois os bytes', async () => {
      const r = await verifyRemoteFile(URL_OK, {}, cfg(), avOff, deps(reply({ body: pdf() })));
      expect(r).toBeNull();
      const r2 = await verifyRemoteFile(
        URL_OK,
        {},
        cfg(),
        avOff,
        deps(reply({ body: png(), headers: { 'content-type': 'binary/octet-stream' } })),
      );
      expect(r2).toBeNull();
    });
  });

  describe('conteúdo perigoso', () => {
    it('executável com nome de PDF', async () => {
      const exe = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 1, 2, 3]);
      const r = await verify(reply({ body: exe }));
      expect(r).toContain('executável');
      expect(events[0]).toMatchObject({ policy: 'REMOTE', stage: 'content', enforced: true });
    });

    it('PDF com JavaScript e docx com macros', async () => {
      expect(await verify(reply({ body: pdf('/JS (x)') }))).toContain('PDF');
      const macro = docx([{ name: 'word/vbaProject.bin' }]);
      const mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      expect(
        await verify(reply({ body: macro, headers: { 'content-type': mime } }), { mime }),
      ).toContain('macros');
    });

    it('MIME declarado não corresponde aos bytes', async () => {
      const r = await verify(reply({ body: pdf() }), { mime: 'image/png' });
      expect(r).toContain('não corresponde');
    });

    it.each([
      'text/html',
      'image/svg+xml',
      'application/xhtml+xml',
      'text/xml',
      'application/javascript',
    ])(
      'o storage serve-o como %s (o browser executa-o): recusado mesmo com bytes inofensivos',
      async contentType => {
        const r = await verify(
          reply({ body: pdf(), headers: { 'content-type': `${contentType}; charset=utf-8` } }),
        );
        expect(r).toContain('que o browser executa');
        expect(events[0]).toMatchObject({ stage: 'content', enforced: true });
      },
    );
  });

  describe('SSRF', () => {
    it.each([
      ['http://', 'http://files.test/a.pdf'],
      ['credenciais', 'https://u:p@files.test/a.pdf'],
      ['host fora da allowlist', 'https://evil.test/a.pdf'],
      ['IP literal interno', 'https://10.0.0.5/a.pdf'],
      ['localhost', 'https://localhost/a.pdf'],
    ])('recusa %s sem fazer nenhum pedido', async (_n, url) => {
      const open = jest.fn();
      const r = await verify(open, { url });
      expect(r).toContain('não é aceite');
      expect(open).not.toHaveBeenCalled();
    });

    it.each([
      ['loopback', '127.0.0.1', 4],
      ['rede privada', '10.1.2.3', 4],
      ['metadados cloud', '169.254.169.254', 4],
      ['IPv6 loopback', '::1', 6],
      ['IPv6 local único', 'fd00::5', 6],
      ['IPv4 mapeado', '::ffff:7f00:1', 6],
    ])('domínio da allowlist que RESOLVE para %s é recusado (DNS)', async (_n, address, family) => {
      const open = jest.fn();
      const r = await verify(open, {
        d: { resolve: () => Promise.resolve([{ address, family }]) },
      });
      expect(r).toContain('endereço interno');
      expect(open).not.toHaveBeenCalled();
    });

    it('basta UM endereço interno entre vários para recusar', async () => {
      const open = jest.fn();
      const r = await verify(open, {
        d: {
          resolve: () => Promise.resolve([PUBLIC_IP, { address: '192.168.1.1', family: 4 }]),
        },
      });
      expect(r).toContain('endereço interno');
      expect(open).not.toHaveBeenCalled();
    });

    it('a ligação usa o endereço já validado (anti-rebinding): uma só resolução por salto', async () => {
      const resolve = jest.fn().mockResolvedValue([PUBLIC_IP]);
      const open = jest.fn(reply());
      await verify(open, { d: { resolve } });
      expect(resolve).toHaveBeenCalledTimes(1);
      expect(open).toHaveBeenCalledWith(expect.any(URL), PUBLIC_IP, 5000, {});
    });
  });

  describe('redirecionamentos', () => {
    const redirectTo = (location: string) =>
      reply({ status: 302, headers: { location }, body: Buffer.alloc(0) });

    it('segue um redirecionamento para outro host autorizado', async () => {
      const open = jest
        .fn()
        .mockImplementationOnce(redirectTo('https://cdn.files.test/real.pdf'))
        .mockImplementationOnce(reply());
      expect(await verify(open)).toBeNull();
      expect(open).toHaveBeenCalledTimes(2);
      expect((open.mock.calls[1][0] as URL).hostname).toBe('cdn.files.test');
    });

    it('resolve destinos relativos', async () => {
      const open = jest
        .fn()
        .mockImplementationOnce(redirectTo('/outro/b.pdf'))
        .mockImplementationOnce(reply());
      expect(await verify(open)).toBeNull();
      expect((open.mock.calls[1][0] as URL).pathname).toBe('/outro/b.pdf');
    });

    it.each([
      ['host não autorizado', 'https://evil.test/x.pdf'],
      ['http://', 'http://files.test/x.pdf'],
      ['endereço interno', 'https://127.0.0.1/x.pdf'],
      ['metadados cloud', 'https://169.254.169.254/latest'],
    ])('redirecionamento para %s é recusado', async (_n, target) => {
      const open = jest.fn().mockImplementation(redirectTo(target));
      const r = await verify(open);
      expect(r).toContain('não é aceite');
      expect(open).toHaveBeenCalledTimes(1);
    });

    it('um redirecionamento cujo DNS resolve para interno é recusado ao segundo salto', async () => {
      const resolve = jest
        .fn()
        .mockResolvedValueOnce([PUBLIC_IP])
        .mockResolvedValueOnce([{ address: '10.0.0.9', family: 4 }]);
      const open = jest.fn().mockImplementation(redirectTo('https://cdn.files.test/x.pdf'));
      const r = await verify(open, { d: { resolve } });
      expect(r).toContain('endereço interno');
      expect(open).toHaveBeenCalledTimes(1);
    });

    it('mais de 3 redirecionamentos é recusado (ciclos)', async () => {
      const open = jest.fn().mockImplementation(redirectTo('https://files.test/loop'));
      const r = await verify(open);
      expect(r).toContain('demasiados redirecionamentos');
      expect(open).toHaveBeenCalledTimes(4);
    });
  });

  describe('limites', () => {
    it('Content-Length acima do máximo recusa sem descarregar', async () => {
      const r = await verify(reply({ headers: { 'content-length': String(300 * 1024 * 1024) } }));
      expect(r).toContain('excede 200 MB');
    });

    it('corpo maior que o máximo (sem Content-Length) é cortado a meio', async () => {
      let produced = 0;
      async function* endless() {
        for (;;) {
          produced += 1024 * 1024;
          yield Buffer.alloc(1024 * 1024, 1);
        }
      }
      const r = await verify(reply({ body: endless(), headers: { 'content-type': 'video/mp4' } }), {
        mime: 'video/mp4',
        cfg: { maxBytes: 5 * 1024 * 1024 },
      });
      expect(r).toContain('excede 5 MB');
      expect(produced).toBeLessThanOrEqual(7 * 1024 * 1024);
    });

    it('a fronteira é exacta: maxBytes passa, +1 byte não', async () => {
      const header = Buffer.concat([
        Buffer.from([0, 0, 0, 0x18]),
        Buffer.from('ftypmp42'),
        Buffer.alloc(4),
      ]);
      const at = Buffer.concat([header, Buffer.alloc(2 * 1024 * 1024 - header.length)]);
      const ok = await verify(reply({ body: at, headers: { 'content-type': 'video/mp4' } }), {
        mime: 'video/mp4',
        cfg: { maxBytes: at.length },
      });
      expect(ok).toBeNull();
      const over = await verify(
        reply({
          body: Buffer.concat([at, Buffer.from([0])]),
          headers: { 'content-type': 'video/mp4' },
        }),
        { mime: 'video/mp4', cfg: { maxBytes: at.length } },
      );
      expect(over).toContain('excede');
    });
  });

  describe('ficheiros grandes (acima do limite de memória)', () => {
    const mp4Head = Buffer.concat([
      Buffer.from([0, 0, 0, 0x18]),
      Buffer.from('ftypmp42'),
      Buffer.alloc(12),
    ]);
    const big = (head: Buffer, mb = 12) =>
      Buffer.concat([head, Buffer.alloc(mb * 1024 * 1024 - head.length, 0x20)]);

    it('um vídeo de 12 MB é verificado em streaming e aceite', async () => {
      expect(REMOTE_BUFFER_LIMIT).toBeLessThan(12 * 1024 * 1024);
      const r = await verify(
        reply({ body: big(mp4Head), headers: { 'content-type': 'video/mp4' } }),
        {
          mime: 'video/mp4',
        },
      );
      expect(r).toBeNull();
    });

    it('um executável grande é apanhado pela cabeça, sem ficar em memória', async () => {
      const exe = big(Buffer.from([0x4d, 0x5a, 0x90, 0x00, 1, 2]));
      const r = await verify(reply({ body: exe, headers: { 'content-type': 'video/mp4' } }), {
        mime: 'video/mp4',
      });
      expect(r).toContain('executável');
    });

    it('um PDF disfarçado de vídeo grande: tipo não corresponde', async () => {
      const r = await verify(
        reply({ body: big(pdf()), headers: { 'content-type': 'video/mp4' } }),
        { mime: 'video/mp4' },
      );
      expect(r).toContain('não corresponde');
    });

    it('o antivírus vê TODOS os bytes do ficheiro grande', async () => {
      let seen = 0;
      const scan: RemoteDeps['scan'] = async source => {
        for await (const c of source) seen += c.length;
        return { status: 'clean' };
      };
      const body = big(mp4Head, 30);
      const r = await verify(reply({ body, headers: { 'content-type': 'video/mp4' } }), {
        mime: 'video/mp4',
        av: avOn,
        d: { scan },
      });
      expect(r).toBeNull();
      expect(seen).toBe(body.length);
    });
  });

  describe('antivírus', () => {
    it('infectado é recusado, mesmo em modo warn', async () => {
      process.env.UPLOAD_VALIDATION_MODE = 'warn';
      const r = await verify(reply({ body: pdf(`/Producer (${EICAR})`) }), {
        av: avOn,
        d: { scan: fakeScan },
      });
      expect(r).toContain('malware detectado (Win.Test.EICAR_HDB-1)');
      expect(events.find(e => e.stage === 'scan')).toMatchObject({ enforced: true });
    });

    it('limpo passa', async () => {
      expect(await verify(reply(), { av: avOn, d: { scan: fakeScan } })).toBeNull();
    });

    it('clamd indisponível segue CLAMAV_FAIL_MODE', async () => {
      const down: RemoteDeps['scan'] = async source => {
        for await (const c of source) void c;
        return { status: 'error', reason: 'ECONNREFUSED' } satisfies ScanResult;
      };
      expect(await verify(reply(), { av: avOn, d: { scan: down } })).toBeNull();
      const closed = await verify(reply(), {
        av: { ...avOn, failMode: 'closed' },
        d: { scan: down },
      });
      expect(closed).toContain('Não foi possível verificar');
    });

    it('o antivírus desligado não é invocado', async () => {
      const scan = jest.fn();
      await verify(reply(), { av: avOff, d: { scan } });
      expect(scan).not.toHaveBeenCalled();
    });
  });

  describe('falhas de obtenção (REMOTE_FILE_FAIL_MODE)', () => {
    const failures: Array<[string, RemoteDeps['open']]> = [
      ['HTTP 404', reply({ status: 404 })],
      ['HTTP 500', reply({ status: 500 })],
      ['erro de rede', () => Promise.reject(new Error('ECONNRESET'))],
      ['redirecionamento sem destino', reply({ status: 302, body: Buffer.alloc(0) })],
    ];

    it.each(failures)('%s: open deixa passar e regista (enforced=false)', async (_n, open) => {
      expect(await verify(open)).toBeNull();
      expect(events[0]).toMatchObject({ stage: 'remote', enforced: false });
      expect(events[0].reason).toContain('não verificado');
    });

    it.each(failures)('%s: closed recusa (enforced=true)', async (_n, open) => {
      const r = await verify(open, { cfg: { failMode: 'closed' } });
      expect(r).toContain('Não foi possível obter o ficheiro');
      expect(events[0]).toMatchObject({ stage: 'remote', enforced: true });
    });

    it('falha de DNS segue o fail mode', async () => {
      const d = { resolve: () => Promise.reject(new Error('ENOTFOUND')) };
      expect(await verify(jest.fn(), { d })).toBeNull();
      expect(await verify(jest.fn(), { d, cfg: { failMode: 'closed' } })).toContain(
        'Não foi possível',
      );
    });

    it('ficheiro perigoso é recusado mesmo em open (só obter/verificar falha é tolerado)', async () => {
      const r = await verify(reply({ body: Buffer.from([0x4d, 0x5a, 0x90, 0x00]) }), {
        cfg: { failMode: 'open' },
      });
      expect(r).not.toBeNull();
    });
  });
});

describe('httpsOpener (ligação fixada ao endereço validado)', () => {
  let server: http.Server;
  let port: number;
  let seenHost: string | undefined;
  let seenHeaders: http.IncomingHttpHeaders = {};
  let seenUrl = '';

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      seenHost = req.headers.host;
      seenHeaders = req.headers;
      seenUrl = req.url ?? '';
      if (req.url === '/slow') return; // nunca responde
      res.setHeader('content-type', 'application/pdf');
      res.end(pdf());
    });
    await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
    port = (server.address() as net.AddressInfo).port;
  });
  afterAll(async () => {
    await new Promise<void>(r => {
      server.close(() => r());
      server.closeAllConnections();
    });
  });

  // Transporte http só para os testes (o código de produção usa https; o TLS é do Node).
  const open = httpsOpener({ protocol: 'http:' }, http as never);

  it('liga ao IP validado mas mantém o Host do URL: o DNS nunca é consultado de novo', async () => {
    // "files.test" não existe em DNS: só chega ao servidor local porque o lookup está fixado.
    const res = await open(
      new URL(`https://files.test:${port}/docs/a.pdf?x=1`),
      { address: '127.0.0.1', family: 4 },
      3000,
    );
    const chunks: Buffer[] = [];
    for await (const c of res.body) chunks.push(c);
    expect(res.status).toBe(200);
    expect(Buffer.concat(chunks).equals(pdf())).toBe(true);
    expect(seenHost).toBe(`files.test:${port}`);
    expect(seenUrl).toBe('/docs/a.pdf?x=1');
  });

  it('não envia cookies nem Authorization', async () => {
    await open(new URL(`https://files.test:${port}/a`), { address: '127.0.0.1', family: 4 }, 3000);
    expect(seenHeaders.cookie).toBeUndefined();
    expect(seenHeaders.authorization).toBeUndefined();
    expect(seenHeaders['user-agent']).toBe('innova-file-verifier');
  });

  it('timeout de inactividade rejeita', async () => {
    await expect(
      open(new URL(`https://files.test:${port}/slow`), { address: '127.0.0.1', family: 4 }, 500),
    ).rejects.toThrow(/timeout/);
  });

  it('end-to-end com verifyRemoteFile (servidor real, DNS fixado)', async () => {
    process.env.ALLOWED_FILE_HOST = 'files.test';
    const r = await verifyRemoteFile(
      `https://files.test:${port}/docs/a.pdf`,
      { declaredMime: 'application/pdf' },
      cfg(),
      avOff,
      {
        resolve: () => Promise.resolve([{ address: '127.0.0.1', family: 4 }]),
        open,
        allowInternal: true, // só o servidor de teste está em localhost
      },
    );
    expect(r).toBeNull();
  });
});
