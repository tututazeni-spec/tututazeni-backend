import * as net from 'net';
import {
  antivirusConfig,
  AntivirusConfig,
  DEFAULT_CLAMAV_MAX_BYTES,
  scanBuffer,
  scanStream,
} from './antivirus';

// Ficheiros acima do StreamMaxLength do clamd (25 MB por omissão) já não são recusados: o cliente
// divide-os em segmentos sequenciais com sobreposição.

const EICAR = 'EICAR-STANDARD-ANTIVIRUS-TEST-FILE';
const NUL = Buffer.from([0]);

/** clamd falso que IMPÕE um StreamMaxLength e regista o tamanho de cada sessão. */
function startClamd(streamMaxLength: number) {
  const sessions: Buffer[] = [];
  const server = net.createServer(socket => {
    let buf = Buffer.alloc(0);
    let header = false;
    let total = 0;
    const mine: Buffer[] = [];
    let overLimit = false;
    socket.on('data', d => {
      buf = Buffer.concat([buf, d]);
      if (!header) {
        const end = buf.indexOf(NUL);
        if (end < 0) return;
        buf = buf.subarray(end + 1);
        header = true;
      }
      for (;;) {
        if (buf.length < 4) return;
        const len = buf.readUInt32BE(0);
        if (buf.length < 4 + len) return;
        if (len === 0) {
          const payload = Buffer.concat(mine);
          sessions.push(payload);
          const reply = overLimit
            ? 'INSTREAM size limit exceeded. ERROR'
            : payload.includes(EICAR)
              ? 'stream: Win.Test.EICAR_HDB-1 FOUND'
              : 'stream: OK';
          socket.end(Buffer.concat([Buffer.from(reply), NUL]));
          return;
        }
        total += len;
        if (total > streamMaxLength) overLimit = true;
        mine.push(buf.subarray(4, 4 + len));
        buf = buf.subarray(4 + len);
      }
    });
  });
  return new Promise<{ port: number; sessions: Buffer[]; close: () => Promise<void> }>(resolve => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        port: (server.address() as net.AddressInfo).port,
        sessions,
        close: () =>
          new Promise<void>(r => {
            server.close(() => r());
            server.closeAllConnections?.();
          }),
      });
    });
  });
}

const cfg = (port: number, maxBytes: number): AntivirusConfig => ({
  enabled: true,
  host: '127.0.0.1',
  port,
  timeoutMs: 3000,
  failMode: 'open',
  maxBytes,
});

/** Buffer determinístico sem a string EICAR por acaso. */
const filler = (n: number) => Buffer.alloc(n, 0x61);

describe('scan de ficheiros maiores que o limite do clamd', () => {
  const LIMIT = 1000;
  let clamd: Awaited<ReturnType<typeof startClamd>>;
  beforeEach(async () => {
    clamd = await startClamd(LIMIT);
  });
  afterEach(async () => {
    await clamd.close();
  });

  it('ficheiro que cabe numa sessão vai numa só', async () => {
    expect(await scanBuffer(filler(LIMIT), cfg(clamd.port, LIMIT))).toEqual({ status: 'clean' });
    expect(clamd.sessions).toHaveLength(1);
    expect(clamd.sessions[0]).toHaveLength(LIMIT);
  });

  it('ficheiro 5x maior que o limite é aceite (antes: ERROR) e dividido em sessões ≤ limite', async () => {
    expect(await scanBuffer(filler(5000), cfg(clamd.port, LIMIT))).toEqual({ status: 'clean' });
    expect(clamd.sessions.length).toBeGreaterThan(1);
    for (const s of clamd.sessions) expect(s.length).toBeLessThanOrEqual(LIMIT);
  });

  it('sem segmentação o clamd falso teria recusado o mesmo ficheiro (prova do cenário)', async () => {
    const direct = await scanBuffer(filler(5000), cfg(clamd.port, 10_000_000));
    expect(direct.status).toBe('error');
  });

  it('todos os bytes são vistos pelo clamd (a sobreposição só repete, nunca omite)', async () => {
    const data = Buffer.from(Array.from({ length: 4321 }, (_, i) => i % 251));
    await scanBuffer(data, cfg(clamd.port, LIMIT));
    // Reconstrói: cada sessão (excepto a 1.ª) começa com o fim da anterior.
    const overlap = Math.floor(LIMIT / 2);
    let rebuilt = clamd.sessions[0];
    for (const s of clamd.sessions.slice(1)) {
      expect(s.subarray(0, overlap).equals(rebuilt.subarray(-overlap))).toBe(true);
      rebuilt = Buffer.concat([rebuilt, s.subarray(overlap)]);
    }
    expect(rebuilt.equals(data)).toBe(true);
  });

  it('assinatura que atravessa a fronteira entre segmentos é apanhada', async () => {
    for (const offset of [LIMIT - 35, LIMIT - 20, LIMIT - 1, LIMIT, LIMIT + 5, 2 * LIMIT - 10]) {
      const data = filler(4000);
      data.write(EICAR, offset, 'latin1');
      const r = await scanBuffer(data, cfg(clamd.port, LIMIT));
      expect(r).toEqual({ status: 'infected', signature: 'Win.Test.EICAR_HDB-1' });
    }
  });

  it('infectado no último segmento, e limpo no meio, também é apanhado', async () => {
    const data = filler(4500);
    data.write(EICAR, 4400, 'latin1');
    expect((await scanBuffer(data, cfg(clamd.port, LIMIT))).status).toBe('infected');
  });

  it('um segmento infectado pára o scan: não envia o resto do ficheiro', async () => {
    const data = filler(20_000);
    data.write(EICAR, 10, 'latin1');
    expect((await scanBuffer(data, cfg(clamd.port, LIMIT))).status).toBe('infected');
    expect(clamd.sessions.length).toBe(1);
  });

  it('scanStream segmenta um fluxo em pedaços pequenos como um buffer único', async () => {
    async function* pieces() {
      for (let i = 0; i < 100; i++) yield filler(97); // 9700 bytes, sem fronteiras alinhadas
      yield Buffer.from(EICAR);
    }
    expect((await scanStream(pieces(), cfg(clamd.port, LIMIT))).status).toBe('infected');
  });

  it('erro a meio do fluxo vira `error` e fecha a ligação', async () => {
    async function* broken() {
      yield filler(300);
      throw new Error('ligação interrompida');
    }
    const r = await scanStream(broken(), cfg(clamd.port, LIMIT));
    expect(r).toEqual({ status: 'error', reason: 'ligação interrompida' });
  });

  it('com o clamd em baixo, um ficheiro grande devolve error sem rebentar', async () => {
    const port = clamd.port;
    await clamd.close();
    const r = await scanBuffer(filler(5000), cfg(port, LIMIT));
    expect(r.status).toBe('error');
    clamd = await startClamd(LIMIT);
  });

  it('um maxBytes inválido (0, negativo, NaN) nunca bloqueia: cai para o omissão', async () => {
    for (const bad of [0, -5, Number.NaN]) {
      const r = await scanBuffer(filler(500), cfg(clamd.port, bad));
      expect(r).toEqual({ status: 'clean' });
    }
  });
});

describe('CLAMAV_MAX_BYTES', () => {
  it('lê o ambiente e ignora valores inválidos ou abaixo de 1 MiB', () => {
    expect(antivirusConfig({ CLAMAV_MAX_BYTES: '209715200' }).maxBytes).toBe(209715200);
    for (const bad of ['x', '10', '-1', '1.5', '']) {
      expect(antivirusConfig({ CLAMAV_MAX_BYTES: bad }).maxBytes).toBe(DEFAULT_CLAMAV_MAX_BYTES);
    }
    expect(antivirusConfig({}).maxBytes).toBe(25 * 1024 * 1024);
  });
});
