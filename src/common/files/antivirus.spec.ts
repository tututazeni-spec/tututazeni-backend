import * as net from 'net';
import { validate, validateSync } from 'class-validator';
import { assertLessonFileClean } from '../authz/lesson-files';
import { IsAllowedFileUrl } from '../validators/is-allowed-file-url.validator';
import { IsBase64ImageDataUrl } from '../validators/is-base64-image-data-url.decorator';
import { FILE_POLICIES } from './file-policies';
import { dataUrl, pdf, png } from './file-fixtures';
import { inspectBufferScanned } from './inspect-scanned';
import {
  antivirusConfig,
  AntivirusConfig,
  parseClamdReply,
  scanBuffer,
  scanForUpload,
} from './antivirus';
import { addUploadRejectionSink, UploadRejectionEvent } from './upload-validation';

// String de teste EICAR (inofensiva, reconhecida por qualquer antivírus).
const EICAR = 'EICAR-STANDARD-ANTIVIRUS-TEST-FILE';
const NUL = Buffer.from([0]);

type Behaviour = 'normal' | 'error' | 'hang' | 'close';

/** Servidor que fala o protocolo INSTREAM do clamd: lê o fluxo até ao bloco de tamanho 0. */
function startFakeClamd(behaviour: Behaviour = 'normal') {
  const received: Buffer[] = [];
  const server = net.createServer(socket => {
    let buf = Buffer.alloc(0);
    const mine: Buffer[] = []; // só os bytes desta ligação
    let headerSeen = false;
    socket.on('data', d => {
      buf = Buffer.concat([buf, d]);
      if (!headerSeen) {
        const end = buf.indexOf(NUL);
        if (end < 0) return;
        expect(buf.subarray(0, end).toString('latin1')).toBe('zINSTREAM');
        buf = buf.subarray(end + 1);
        headerSeen = true;
      }
      for (;;) {
        if (buf.length < 4) return;
        const len = buf.readUInt32BE(0);
        if (buf.length < 4 + len) return;
        if (len === 0) {
          const payload = Buffer.concat(mine);
          if (behaviour === 'hang') return;
          if (behaviour === 'close') return socket.destroy();
          const reply =
            behaviour === 'error'
              ? 'INSTREAM size limit exceeded. ERROR'
              : payload.includes(EICAR)
                ? 'stream: Win.Test.EICAR_HDB-1 FOUND'
                : 'stream: OK';
          socket.end(Buffer.concat([Buffer.from(reply), NUL]));
          return;
        }
        mine.push(buf.subarray(4, 4 + len));
        received.push(buf.subarray(4, 4 + len));
        buf = buf.subarray(4 + len);
      }
    });
  });
  return new Promise<{ port: number; close: () => Promise<void>; received: Buffer[] }>(resolve => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as net.AddressInfo;
      resolve({
        port,
        received,
        close: () =>
          new Promise<void>(r => {
            server.close(() => r());
            server.closeAllConnections?.();
          }),
      });
    });
  });
}

const cfg = (port: number, over: Partial<AntivirusConfig> = {}): AntivirusConfig => ({
  enabled: true,
  host: '127.0.0.1',
  port,
  timeoutMs: 1500,
  failMode: 'open',
  ...over,
});

describe('parseClamdReply', () => {
  it.each([
    ['stream: OK', { status: 'clean' }],
    ['stream: OK\0', { status: 'clean' }],
    [
      'stream: Win.Test.EICAR_HDB-1 FOUND',
      { status: 'infected', signature: 'Win.Test.EICAR_HDB-1' },
    ],
    [
      'stream: Doc.Dropper.Agent-1 FOUND\0',
      { status: 'infected', signature: 'Doc.Dropper.Agent-1' },
    ],
  ])('%j', (raw, expected) => {
    expect(parseClamdReply(raw)).toEqual(expected);
  });
  it.each(['INSTREAM size limit exceeded. ERROR', '', 'lixo'])('erro: %j', raw => {
    expect(parseClamdReply(raw).status).toBe('error');
  });
});

describe('antivirusConfig', () => {
  it('desligado por omissão, com valores seguros', () => {
    expect(antivirusConfig({})).toEqual({
      enabled: false,
      host: '127.0.0.1',
      port: 3310,
      timeoutMs: 15_000,
      failMode: 'open',
    });
  });
  it('lê o ambiente e ignora valores inválidos', () => {
    const c = antivirusConfig({
      CLAMAV_ENABLED: 'TRUE',
      CLAMAV_HOST: 'clamav',
      CLAMAV_PORT: '3311',
      CLAMAV_TIMEOUT_MS: '5000',
      CLAMAV_FAIL_MODE: 'closed',
    });
    expect(c).toEqual({
      enabled: true,
      host: 'clamav',
      port: 3311,
      timeoutMs: 5000,
      failMode: 'closed',
    });
    const bad = antivirusConfig({
      CLAMAV_PORT: 'x',
      CLAMAV_TIMEOUT_MS: '5',
      CLAMAV_FAIL_MODE: 'talvez',
    });
    expect(bad).toMatchObject({ port: 3310, timeoutMs: 15_000, failMode: 'open' });
  });
});

describe('scanBuffer (clamd falso)', () => {
  it('ficheiro limpo, EICAR e ficheiro grande em vários blocos chegam inteiros ao clamd', async () => {
    const srv = await startFakeClamd();
    try {
      expect(await scanBuffer(Buffer.from('olá mundo'), cfg(srv.port))).toEqual({
        status: 'clean',
      });
      expect(await scanBuffer(Buffer.from(`x${EICAR}x`), cfg(srv.port))).toEqual({
        status: 'infected',
        signature: 'Win.Test.EICAR_HDB-1',
      });
      const big = Buffer.alloc(300 * 1024, 7); // > 4 blocos de 64 KB
      srv.received.length = 0;
      expect(await scanBuffer(big, cfg(srv.port))).toEqual({ status: 'clean' });
      expect(Buffer.concat(srv.received).equals(big)).toBe(true);
    } finally {
      await srv.close();
    }
  });

  it('resposta ERROR, timeout, ligação fechada e porta sem servidor viram `error` (nunca lançam)', async () => {
    for (const behaviour of ['error', 'hang', 'close'] as const) {
      const srv = await startFakeClamd(behaviour);
      try {
        const r = await scanBuffer(Buffer.from('x'), cfg(srv.port, { timeoutMs: 1000 }));
        expect(r.status).toBe('error');
      } finally {
        await srv.close();
      }
    }
    const dead = await startFakeClamd();
    const port = dead.port;
    await dead.close();
    expect((await scanBuffer(Buffer.from('x'), cfg(port))).status).toBe('error');
  });
});

describe('scanForUpload', () => {
  const events: UploadRejectionEvent[] = [];
  let remove: () => void;
  beforeEach(() => {
    events.length = 0;
    remove = addUploadRejectionSink(e => events.push(e));
  });
  afterEach(() => remove());

  it('desligado: não toca na rede nem regista nada', async () => {
    expect(
      await scanForUpload(
        Buffer.from(EICAR),
        { policy: 'PDF', declaredMime: 'x' },
        { ...cfg(1), enabled: false },
      ),
    ).toBeNull();
    expect(events).toHaveLength(0);
  });

  it('infectado: recusa sempre, regista stage scan enforced e a assinatura', async () => {
    const srv = await startFakeClamd();
    try {
      const msg = await scanForUpload(
        Buffer.from(EICAR),
        { policy: 'PDF', declaredMime: 'application/pdf' },
        cfg(srv.port),
      );
      expect(msg).toContain('malware detectado (Win.Test.EICAR_HDB-1)');
      expect(events[0]).toMatchObject({
        stage: 'scan',
        enforced: true,
        policy: 'PDF',
        detectedKind: 'Win.Test.EICAR_HDB-1',
      });
    } finally {
      await srv.close();
    }
  });

  it('infectado é recusado mesmo com UPLOAD_VALIDATION_MODE=warn', async () => {
    const prev = process.env.UPLOAD_VALIDATION_MODE;
    process.env.UPLOAD_VALIDATION_MODE = 'warn';
    const srv = await startFakeClamd();
    try {
      const msg = await scanForUpload(
        Buffer.from(EICAR),
        { policy: 'PDF', declaredMime: 'application/pdf' },
        cfg(srv.port),
      );
      expect(msg).not.toBeNull();
    } finally {
      await srv.close();
      if (prev === undefined) delete process.env.UPLOAD_VALIDATION_MODE;
      else process.env.UPLOAD_VALIDATION_MODE = prev;
    }
  });

  it('clamd em baixo: fail-open deixa passar e regista; fail-closed recusa', async () => {
    const dead = await startFakeClamd();
    const port = dead.port;
    await dead.close();
    const ctx = { policy: 'PDF', declaredMime: 'application/pdf' };

    expect(await scanForUpload(Buffer.from('ok'), ctx, cfg(port, { failMode: 'open' }))).toBeNull();
    expect(events[0]).toMatchObject({ stage: 'scan', enforced: false });
    expect(events[0].reason).toContain('Antivírus indisponível');

    const closed = await scanForUpload(Buffer.from('ok'), ctx, cfg(port, { failMode: 'closed' }));
    expect(closed).toContain('Não foi possível verificar');
    expect(events[1]).toMatchObject({ stage: 'scan', enforced: true });
  });
});

describe('integração com os validadores e serviços', () => {
  class PdfDto {
    @IsAllowedFileUrl(undefined, { inline: FILE_POLICIES.PDF })
    fileUrl!: string;
  }
  class ImgDto {
    @IsBase64ImageDataUrl(undefined, FILE_POLICIES.AVATAR)
    avatarUrl!: string;
  }
  const saved = { ...process.env };
  let srv: Awaited<ReturnType<typeof startFakeClamd>>;

  beforeAll(async () => {
    srv = await startFakeClamd();
  });
  afterAll(async () => {
    await srv.close();
  });
  afterEach(() => {
    for (const k of Object.keys(process.env)) if (k.startsWith('CLAMAV_')) delete process.env[k];
    Object.assign(process.env, saved);
  });
  const enableAv = () => {
    process.env.CLAMAV_ENABLED = 'true';
    process.env.CLAMAV_HOST = '127.0.0.1';
    process.env.CLAMAV_PORT = String(srv.port);
    process.env.CLAMAV_TIMEOUT_MS = '2000';
  };

  it('PDF estruturalmente válido mas infectado é recusado, com o motivo na mensagem', async () => {
    enableAv();
    const dto = Object.assign(new PdfDto(), {
      fileUrl: dataUrl('application/pdf', pdf(`/Producer (${EICAR})`)),
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(1);
    expect(JSON.stringify(errors)).toContain('malware detectado');
  });

  it('PDF limpo continua a passar com o antivírus ligado', async () => {
    enableAv();
    const dto = Object.assign(new PdfDto(), { fileUrl: dataUrl('application/pdf', pdf()) });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('imagem verdadeira passa; a estrutural recusa antes de chegar ao clamd', async () => {
    enableAv();
    expect(
      await validate(Object.assign(new ImgDto(), { avatarUrl: dataUrl('image/png', png()) })),
    ).toHaveLength(0);
    const exe = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 1]);
    srv.received.length = 0;
    expect(
      await validate(Object.assign(new ImgDto(), { avatarUrl: dataUrl('image/png', exe) })),
    ).toHaveLength(1);
    expect(srv.received).toHaveLength(0);
  });

  it('com o antivírus desligado o validador continua síncrono (validateSync funciona)', () => {
    const bad = Object.assign(new ImgDto(), {
      avatarUrl: dataUrl('image/png', Buffer.from([0x4d, 0x5a, 0x90, 0x00])),
    });
    expect(validateSync(bad)).toHaveLength(1);
    expect(
      validateSync(Object.assign(new ImgDto(), { avatarUrl: dataUrl('image/png', png()) })),
    ).toHaveLength(0);
  });

  it('lições PDF: assertLessonFileClean recusa infectado e aceita limpo', async () => {
    enableAv();
    await expect(
      assertLessonFileClean('PDF', dataUrl('application/pdf', pdf(`(${EICAR})`))),
    ).rejects.toThrow(/malware/);
    await expect(
      assertLessonFileClean('PDF', dataUrl('application/pdf', pdf())),
    ).resolves.toBeUndefined();
    await expect(
      assertLessonFileClean('VIDEO', dataUrl('application/pdf', pdf(`(${EICAR})`))),
    ).resolves.toBeUndefined();
  });

  it('inspectBufferScanned: evidência infectada é recusada', async () => {
    enableAv();
    const r = await inspectBufferScanned(
      Buffer.from(`${EICAR}`),
      'text/plain',
      FILE_POLICIES.EVIDENCE,
    );
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toContain('malware');
  });
});
