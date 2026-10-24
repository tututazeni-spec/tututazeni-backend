import { AntivirusConfig } from './antivirus';
import { jpeg, pdf } from './file-fixtures';
import {
  DeferredRequest,
  RemoteDeps,
  RemoteFileConfig,
  RemoteResponse,
  setDeferredVerifier,
  verifyRemoteFile,
} from './remote-file';
import { addUploadRejectionSink, UploadRejectionEvent } from './upload-validation';
import { MemoryVerdictCache, verdictKey } from './verdict-cache';

const URL_OK = 'https://files.test/docs/a.pdf';
const EICAR = 'EICAR-STANDARD-ANTIVIRUS-TEST-FILE';

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

async function* chunked(buf: Buffer): AsyncGenerator<Buffer> {
  for (let off = 0; off < buf.length; off += 64 * 1024) yield buf.subarray(off, off + 64 * 1024);
}

interface Reply {
  status?: number;
  headers?: Record<string, string>;
  body?: Buffer | AsyncIterable<Buffer>;
}
/** Servidor falso: responde 200 com ETag e 304 a pedidos condicionais com o mesmo ETag. */
function fakeStorage(initial: Reply) {
  let current: Reply = initial;
  const requests: Array<Record<string, string> | undefined> = [];
  let bodiesRead = 0;
  const open: NonNullable<RemoteDeps['open']> = (_url, _addr, _t, requestHeaders) => {
    requests.push(requestHeaders);
    const etag = current.headers?.etag;
    if (etag && requestHeaders?.['If-None-Match'] === etag) {
      return Promise.resolve<RemoteResponse>({
        status: 304,
        headers: { etag },
        body: chunked(Buffer.alloc(0)),
        destroy: () => undefined,
      });
    }
    const body = current.body ?? pdf();
    const source = Buffer.isBuffer(body) ? chunked(body) : body;
    const counted = (async function* () {
      bodiesRead++;
      yield* source;
    })();
    return Promise.resolve<RemoteResponse>({
      status: current.status ?? 200,
      headers: { 'content-type': 'application/pdf', ...(current.headers ?? {}) },
      body: counted,
      destroy: () => undefined,
    });
  };
  return {
    open,
    requests,
    bodiesRead: () => bodiesRead,
    replace: (next: Reply) => {
      current = next;
    },
  };
}

describe('verifyRemoteFile — cache e pedido condicional', () => {
  const events: UploadRejectionEvent[] = [];
  let remove: () => void;
  let cache: MemoryVerdictCache;
  const saved = { ...process.env };

  beforeEach(() => {
    events.length = 0;
    remove = addUploadRejectionSink(e => events.push(e));
    cache = new MemoryVerdictCache();
    process.env.ALLOWED_FILE_HOST = 'files.test';
    process.env.UPLOAD_VALIDATION_MODE = 'enforce';
    setDeferredVerifier(undefined);
  });
  afterEach(() => {
    remove();
    setDeferredVerifier(undefined);
    process.env = { ...saved };
  });

  const verify = (
    storage: ReturnType<typeof fakeStorage>,
    opts: {
      url?: string;
      av?: AntivirusConfig;
      c?: Partial<RemoteFileConfig>;
      ctx?: { force?: boolean; background?: boolean; declaredMime?: string };
      scan?: RemoteDeps['scan'];
    } = {},
  ) =>
    verifyRemoteFile(
      opts.url ?? URL_OK,
      { declaredMime: 'application/pdf', ...(opts.ctx ?? {}) },
      cfg(opts.c),
      opts.av ?? avOff,
      {
        resolve: () => Promise.resolve([{ address: '203.0.113.10', family: 4 }]),
        open: storage.open,
        cache,
        scan: opts.scan,
      },
    );

  describe('revalidação com GET condicional', () => {
    it('1.ª vez descarrega; 2.ª envia If-None-Match, recebe 304 e não lê o corpo', async () => {
      const s = fakeStorage({ headers: { etag: '"v1"' }, body: pdf() });
      expect(await verify(s)).toBeNull();
      expect(s.bodiesRead()).toBe(1);
      expect(s.requests[0]).toEqual({});

      expect(await verify(s)).toBeNull();
      expect(s.requests[1]).toEqual({ 'If-None-Match': '"v1"' });
      expect(s.bodiesRead()).toBe(1); // sem novo download
    });

    it('usa também Last-Modified quando não há ETag', async () => {
      const lm = 'Wed, 21 Oct 2026 07:28:00 GMT';
      const s = fakeStorage({ headers: { 'last-modified': lm } });
      await verify(s);
      await verify(s);
      expect(s.requests[1]).toEqual({ 'If-Modified-Since': lm });
    });

    it('o cache ignora a query do URL (links assinados diferentes, mesmo ficheiro)', async () => {
      const s = fakeStorage({ headers: { etag: '"v1"' } });
      await verify(s, { url: 'https://files.test/docs/a.pdf?sig=AAA' });
      await verify(s, { url: 'https://files.test/docs/a.pdf?sig=BBB' });
      expect(s.requests[1]).toEqual({ 'If-None-Match': '"v1"' });
      expect(s.bodiesRead()).toBe(1);
    });

    it('ficheiro SUBSTITUÍDO (ETag mudou) é descarregado e revisto: bom -> mau', async () => {
      const s = fakeStorage({ headers: { etag: '"v1"' }, body: pdf() });
      expect(await verify(s)).toBeNull();
      s.replace({ headers: { etag: '"v2"' }, body: pdf('/JS (x)') });
      const r = await verify(s);
      expect(r).toContain('PDF');
      expect(s.bodiesRead()).toBe(2);
    });

    it('ficheiro corrigido (mau -> bom) deixa de ser recusado', async () => {
      const s = fakeStorage({ headers: { etag: '"v1"' }, body: pdf('/JS (x)') });
      expect(await verify(s)).not.toBeNull();
      s.replace({ headers: { etag: '"v2"' }, body: pdf() });
      expect(await verify(s)).toBeNull();
    });

    it('sem ETag nem Last-Modified não há como revalidar: descarrega sempre', async () => {
      const s = fakeStorage({ body: pdf() });
      await verify(s);
      await verify(s);
      expect(s.bodiesRead()).toBe(2);
      expect(s.requests[1]).toEqual({});
    });

    it('force ignora o cache', async () => {
      const s = fakeStorage({ headers: { etag: '"v1"' } });
      await verify(s);
      await verify(s, { ctx: { force: true } });
      expect(s.requests[1]).toEqual({});
      expect(s.bodiesRead()).toBe(2);
    });

    it('um 304 sem pedido condicional é uma falha, não um veredicto', async () => {
      const open: NonNullable<RemoteDeps['open']> = () =>
        Promise.resolve({
          status: 304,
          headers: {},
          body: chunked(Buffer.alloc(0)),
          destroy: () => undefined,
        });
      const r = await verifyRemoteFile(URL_OK, {}, cfg(), avOff, {
        resolve: () => Promise.resolve([{ address: '203.0.113.10', family: 4 }]),
        open,
        cache,
      });
      expect(r).toBeNull(); // open: passa mas regista como não verificado
      expect(events[0]).toMatchObject({ stage: 'remote', enforced: false });
    });
  });

  describe('rejeições em cache', () => {
    it('um ficheiro mau continua recusado sem ser descarregado e é auditado de novo', async () => {
      const s = fakeStorage({ headers: { etag: '"bad"' }, body: pdf('/JS (x)') });
      const first = await verify(s);
      events.length = 0;
      const second = await verify(s);
      expect(second).toBe(first);
      expect(s.bodiesRead()).toBe(1);
      expect(events[0]).toMatchObject({ stage: 'content', enforced: true });
    });
  });

  describe('o que NÃO se guarda em cache', () => {
    it('falhas de obtenção (404, rede)', async () => {
      const s404 = fakeStorage({ status: 404, headers: { etag: '"x"' } });
      await verify(s404);
      expect(await cache.get(verdictKey(URL_OK))).toBeNull();
      const down: NonNullable<RemoteDeps['open']> = () => Promise.reject(new Error('ECONNRESET'));
      await verifyRemoteFile(URL_OK, {}, cfg(), avOff, {
        resolve: () => Promise.resolve([{ address: '203.0.113.10', family: 4 }]),
        open: down,
        cache,
      });
      expect(await cache.get(verdictKey(URL_OK))).toBeNull();
    });

    it('erro do antivírus não é veredicto: o limpo não fica guardado', async () => {
      const s = fakeStorage({ headers: { etag: '"v1"' } });
      const avDown: RemoteDeps['scan'] = async src => {
        for await (const c of src) void c;
        return { status: 'error', reason: 'ECONNREFUSED' };
      };
      await verify(s, { av: avOn, scan: avDown });
      expect(await cache.get(verdictKey(URL_OK))).toBeNull();
    });

    it('rejeições por configuração/URL (excede o máximo, host recusado)', async () => {
      const s = fakeStorage({
        headers: { etag: '"big"', 'content-length': String(300 * 1024 * 1024) },
      });
      expect(await verify(s)).toContain('excede');
      expect(await cache.get(verdictKey(URL_OK))).toBeNull();
    });
  });

  describe('antivírus', () => {
    const cleanScan: RemoteDeps['scan'] = async src => {
      for await (const c of src) void c;
      return { status: 'clean' };
    };

    it('limpo SEM scan não vale depois de o antivírus ser ligado: volta a descarregar e a analisar', async () => {
      const s = fakeStorage({ headers: { etag: '"v1"' } });
      await verify(s, { av: avOff });
      expect(s.bodiesRead()).toBe(1);
      await verify(s, { av: avOn, scan: cleanScan });
      expect(s.bodiesRead()).toBe(2);
      expect(s.requests[1]).toEqual({}); // nem sequer pergunta ao storage se mudou
    });

    it('limpo COM scan é reaproveitado, tanto com o antivírus ligado como desligado', async () => {
      const s = fakeStorage({ headers: { etag: '"v1"' } });
      await verify(s, { av: avOn, scan: cleanScan });
      await verify(s, { av: avOn, scan: cleanScan });
      await verify(s, { av: avOff });
      expect(s.bodiesRead()).toBe(1);
    });

    it('infectado fica em cache', async () => {
      const s = fakeStorage({ headers: { etag: '"evil"' }, body: pdf(`/Producer (${EICAR})`) });
      const eicarScan: RemoteDeps['scan'] = async src => {
        let hit = false;
        for await (const c of src) if (c.includes(EICAR)) hit = true;
        return hit
          ? { status: 'infected', signature: 'Win.Test.EICAR_HDB-1' }
          : { status: 'clean' };
      };
      const first = await verify(s, { av: avOn, scan: eicarScan });
      expect(first).toContain('malware');
      expect(await verify(s, { av: avOn, scan: eicarScan })).toBe(first);
      expect(s.bodiesRead()).toBe(1);
    });
  });

  describe('ficheiros grandes: verificação diferida', () => {
    const big = 30 * 1024 * 1024;
    const mp4 = Buffer.concat([
      Buffer.from([0, 0, 0, 0x18]),
      Buffer.from('ftypmp42'),
      Buffer.alloc(12),
    ]);

    it('Content-Length acima do limite síncrono: não descarrega e entrega ao verificador', async () => {
      const deferred: DeferredRequest[] = [];
      setDeferredVerifier(r => deferred.push(r));
      const s = fakeStorage({
        headers: { 'content-type': 'video/mp4', 'content-length': String(big) },
        body: mp4,
      });
      const r = await verify(s, { ctx: { declaredMime: 'video/mp4' } });
      expect(r).toBeNull();
      expect(s.bodiesRead()).toBe(0);
      expect(deferred).toEqual([
        expect.objectContaining({ url: URL_OK, declaredMime: 'video/mp4' }),
      ]);
      expect(events[0]).toMatchObject({ stage: 'remote', enforced: false });
      expect(events[0].reason).toContain('segundo plano');
    });

    it('sem Content-Length (chunked), diferido assim que passa o limite', async () => {
      const deferred: DeferredRequest[] = [];
      setDeferredVerifier(r => deferred.push(r));
      let produced = 0;
      async function* endless() {
        yield mp4;
        for (;;) {
          produced += 1024 * 1024;
          yield Buffer.alloc(1024 * 1024, 1);
        }
      }
      const s = fakeStorage({ headers: { 'content-type': 'video/mp4' }, body: endless() });
      expect(
        await verify(s, {
          ctx: { declaredMime: 'video/mp4' },
          c: { syncMaxBytes: 5 * 1024 * 1024 },
        }),
      ).toBeNull();
      expect(deferred).toHaveLength(1);
      expect(produced).toBeLessThanOrEqual(7 * 1024 * 1024);
    });

    it('em segundo plano (background) verifica tudo, sem diferir outra vez', async () => {
      const deferred: DeferredRequest[] = [];
      setDeferredVerifier(r => deferred.push(r));
      const s = fakeStorage({
        headers: { 'content-type': 'video/mp4', 'content-length': String(big) },
        body: Buffer.concat([mp4, Buffer.alloc(big - mp4.length, 1)]),
      });
      expect(await verify(s, { ctx: { declaredMime: 'video/mp4', background: true } })).toBeNull();
      expect(s.bodiesRead()).toBe(1);
      expect(deferred).toHaveLength(0);
    });

    it('sem verificador registado verifica tudo no pedido (comportamento anterior)', async () => {
      const s = fakeStorage({
        headers: { 'content-type': 'video/mp4', 'content-length': String(big) },
        body: Buffer.concat([mp4, Buffer.alloc(big - mp4.length, 1)]),
      });
      expect(await verify(s, { ctx: { declaredMime: 'video/mp4' } })).toBeNull();
      expect(s.bodiesRead()).toBe(1);
    });

    it('ficheiros pequenos nunca são diferidos', async () => {
      const deferred: DeferredRequest[] = [];
      setDeferredVerifier(r => deferred.push(r));
      await verify(fakeStorage({ body: jpeg(), headers: { 'content-type': 'image/jpeg' } }), {
        ctx: { declaredMime: 'image/jpeg' },
      });
      expect(deferred).toHaveLength(0);
    });
  });
});
