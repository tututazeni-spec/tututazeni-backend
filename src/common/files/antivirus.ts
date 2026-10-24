// src/common/files/antivirus.ts
// Cliente mínimo do ClamAV (clamd, comando INSTREAM sobre TCP). Sem dependências.
//
// Opt-in: CLAMAV_ENABLED=true. Quando desligado, `scanForUpload` devolve de imediato e o fluxo de
// upload não muda. As verificações estruturais (inspect-inline-file) correm sempre; o antivírus é
// a camada seguinte e apanha malware CONHECIDO que a estrutura não vê (ex.: JavaScript dentro de
// streams comprimidos de PDF, documentos Office com exploits).
//
//  CLAMAV_HOST (127.0.0.1) · CLAMAV_PORT (3310) · CLAMAV_TIMEOUT_MS (15000)
//  CLAMAV_MAX_BYTES (25 MiB): tamanho máximo de UMA sessão INSTREAM. Tem de ser ≤ ao
//    StreamMaxLength do clamd (25 MB por omissão; o docker-compose sobe-o para 200 MB). Ficheiros
//    maiores são enviados em segmentos sequenciais com sobreposição (ver scanStream).
//  CLAMAV_FAIL_MODE=open (omissão) | closed
//    open   – se o clamd estiver em baixo/lento, o ficheiro passa e a falha é registada
//             (disponibilidade acima de tudo: um clamd parado não pára 6000 utilizadores);
//    closed – nesse caso o upload é recusado (para quem prefere segurança a disponibilidade).
//  Um ficheiro DETECTADO como infectado é sempre recusado, em qualquer modo (incluindo
//  UPLOAD_VALIDATION_MODE=warn): uma assinatura positiva não tem o problema dos falsos positivos
//  das regras estruturais que o modo warn existe para medir.
import * as net from 'net';
import { reportUploadRejection } from './upload-validation';

export type AntivirusFailMode = 'open' | 'closed';

export interface AntivirusConfig {
  enabled: boolean;
  host: string;
  port: number;
  timeoutMs: number;
  failMode: AntivirusFailMode;
  /** Máximo de bytes por sessão INSTREAM (≤ StreamMaxLength do clamd). */
  maxBytes: number;
}

export type ScanResult =
  | { status: 'clean' }
  | { status: 'infected'; signature: string }
  | { status: 'error'; reason: string };

const CHUNK_BYTES = 64 * 1024;
const MAX_REPLY_BYTES = 4096;
export const DEFAULT_CLAMAV_MAX_BYTES = 25 * 1024 * 1024;
/** Bytes repetidos no início de cada segmento: cobre assinaturas que atravessam a fronteira. */
export const SEGMENT_OVERLAP_BYTES = 1024 * 1024;

export function antivirusConfig(env: NodeJS.ProcessEnv = process.env): AntivirusConfig {
  const port = Number(env.CLAMAV_PORT);
  const timeout = Number(env.CLAMAV_TIMEOUT_MS);
  const maxBytes = Number(env.CLAMAV_MAX_BYTES);
  return {
    enabled:
      String(env.CLAMAV_ENABLED ?? '')
        .trim()
        .toLowerCase() === 'true',
    host: env.CLAMAV_HOST?.trim() || '127.0.0.1',
    port: Number.isInteger(port) && port > 0 && port < 65536 ? port : 3310,
    timeoutMs: Number.isInteger(timeout) && timeout >= 1000 ? timeout : 15_000,
    // Qualquer valor diferente de "closed" é open: é o comportamento documentado por omissão.
    failMode:
      String(env.CLAMAV_FAIL_MODE ?? '')
        .trim()
        .toLowerCase() === 'closed'
        ? 'closed'
        : 'open',
    maxBytes:
      Number.isInteger(maxBytes) && maxBytes >= 1024 * 1024 ? maxBytes : DEFAULT_CLAMAV_MAX_BYTES,
  };
}

/** Interpreta a resposta do clamd ("stream: OK", "stream: Nome FOUND", "... ERROR"). */
export function parseClamdReply(raw: string): ScanResult {
  const reply = raw.replace(/\0/g, '').trim();
  if (/\bFOUND$/.test(reply)) {
    const signature = reply
      .replace(/^stream:\s*/i, '')
      .replace(/\s*FOUND$/, '')
      .trim();
    return { status: 'infected', signature: signature || 'desconhecida' };
  }
  if (/\bOK$/.test(reply)) return { status: 'clean' };
  return { status: 'error', reason: reply ? reply.slice(0, 200) : 'resposta vazia do clamd' };
}

/** Uma sessão INSTREAM: abre a ligação, aceita blocos e devolve o veredicto ao terminar. */
class ClamdSession {
  private readonly socket: net.Socket;
  private readonly chunks: Buffer[] = [];
  private received = 0;
  private failure: ScanResult | null = null;
  private readonly done: Promise<ScanResult>;
  private ready: Promise<void>;

  constructor(cfg: AntivirusConfig) {
    this.socket = net.createConnection({ host: cfg.host, port: cfg.port });
    this.socket.setTimeout(cfg.timeoutMs, () =>
      this.fail({ status: 'error', reason: `timeout (${cfg.timeoutMs} ms)` }),
    );
    this.done = new Promise<ScanResult>(resolve => {
      this.socket.on('error', err => {
        this.fail({ status: 'error', reason: err.message });
        resolve(this.failure);
      });
      this.socket.on('data', d => {
        this.chunks.push(d);
        this.received += d.length;
        if (this.received > MAX_REPLY_BYTES) {
          this.fail({ status: 'error', reason: 'resposta demasiado longa' });
        }
      });
      this.socket.on('close', () =>
        resolve(this.failure ?? parseClamdReply(Buffer.concat(this.chunks).toString('utf8'))),
      );
    });
    this.ready = new Promise<void>(resolve => {
      this.socket.on('connect', () => {
        // zINSTREAM\0 e, por cada bloco, 4 bytes (big-endian) com o tamanho; 0 termina o fluxo.
        this.socket.write(Buffer.concat([Buffer.from('zINSTREAM', 'latin1'), Buffer.from([0])]));
        resolve();
      });
      this.socket.on('error', () => resolve());
    });
  }

  private fail(result: ScanResult): void {
    this.failure ??= result;
    this.socket.destroy();
  }

  /** Escreve um bloco respeitando o backpressure do socket. */
  async write(data: Buffer): Promise<void> {
    await this.ready;
    for (let off = 0; off < data.length && !this.socket.destroyed; off += CHUNK_BYTES) {
      const part = data.subarray(off, off + CHUNK_BYTES);
      const len = Buffer.alloc(4);
      len.writeUInt32BE(part.length, 0);
      this.socket.write(len);
      if (!this.socket.write(part)) {
        await new Promise<void>(resolve => {
          const release = () => {
            this.socket.off('drain', release);
            this.socket.off('close', release);
            resolve();
          };
          this.socket.once('drain', release);
          this.socket.once('close', release);
        });
      }
    }
  }

  finish(): Promise<ScanResult> {
    if (!this.socket.destroyed) this.socket.write(Buffer.alloc(4));
    return this.done;
  }

  abort(): void {
    this.fail({ status: 'error', reason: 'verificação interrompida' });
  }
}

/**
 * Verifica um fluxo de bytes de qualquer tamanho. Um fluxo que caiba em `cfg.maxBytes` vai numa só
 * sessão. Um maior (ex.: vídeo de 150 MB) é dividido em segmentos sequenciais de, no máximo,
 * `cfg.maxBytes`, cada um precedido dos últimos `overlap` bytes do anterior — uma assinatura
 * (≤ overlap) que atravesse a fronteira fica inteira num dos segmentos. Limite conhecido: o
 * clamd só abre arquivos (zip/OOXML) que veja inteiros; por isso estes têm teto próprio nas
 * políticas (≤ 10 MB) e nunca chegam a ser segmentados.
 */
export async function scanStream(
  source: AsyncIterable<Buffer>,
  cfg: AntivirusConfig = antivirusConfig(),
): Promise<ScanResult> {
  // Um maxBytes inválido (0, NaN, negativo) nunca pode bloquear o ciclo: cai para o omissão.
  const maxBytes = cfg.maxBytes > 0 ? cfg.maxBytes : DEFAULT_CLAMAV_MAX_BYTES;
  const overlap = Math.min(SEGMENT_OVERLAP_BYTES, Math.floor(maxBytes / 2));
  let session = new ClamdSession(cfg);
  let sessionBytes = 0;
  let tail: Buffer = Buffer.alloc(0);

  const rollOver = async (): Promise<ScanResult | null> => {
    const result = await session.finish();
    if (result.status !== 'clean') return result;
    session = new ClamdSession(cfg);
    sessionBytes = 0;
    if (tail.length) {
      await session.write(tail);
      sessionBytes = tail.length;
    }
    return null;
  };

  try {
    for await (const piece of source) {
      let data = piece;
      while (data.length > 0) {
        const room = maxBytes - sessionBytes;
        if (room <= 0) {
          const stop = await rollOver();
          if (stop) return stop;
          continue;
        }
        const part = data.subarray(0, room);
        if (part.length === 0) break;
        data = data.subarray(part.length);
        await session.write(part);
        sessionBytes += part.length;
        tail = Buffer.concat([tail, part]).subarray(-overlap);
      }
    }
  } catch (err) {
    session.abort();
    return { status: 'error', reason: (err as Error).message };
  }
  return session.finish();
}

async function* inChunks(bytes: Buffer): AsyncGenerator<Buffer> {
  yield bytes;
}

/** Envia o buffer ao clamd. Nunca lança: falhas de rede/timeout viram `error`. */
export function scanBuffer(
  bytes: Buffer,
  cfg: AntivirusConfig = antivirusConfig(),
): Promise<ScanResult> {
  return scanStream(inChunks(bytes), cfg);
}

export interface ScanContext {
  policy: string;
  declaredMime: string;
}

/** Converte o resultado de um scan em rejeição (mensagem) ou `null`, registando o que aconteceu. */
export function scanVerdict(
  result: ScanResult,
  ctx: ScanContext,
  bytes: number,
  cfg: AntivirusConfig,
): string | null {
  if (result.status === 'clean') return null;
  const base = { policy: ctx.policy, declaredMime: ctx.declaredMime, bytes };
  if (result.status === 'infected') {
    const reason = `Ficheiro rejeitado: malware detectado (${result.signature}).`;
    reportUploadRejection({
      ...base,
      stage: 'scan',
      reason,
      detectedKind: result.signature,
      enforced: true,
    });
    return reason;
  }
  const closed = cfg.failMode === 'closed';
  reportUploadRejection({
    ...base,
    stage: 'scan',
    reason: `Antivírus indisponível (${result.reason}).`,
    enforced: closed,
  });
  return closed
    ? 'Não foi possível verificar o ficheiro com o antivírus. Tente novamente dentro de instantes.'
    : null;
}

/**
 * Verificação de antivírus para um upload. Devolve `null` se o ficheiro pode seguir, ou a mensagem
 * de rejeição. Regista sempre (log + AuditLog) o que encontrar ou o que correr mal.
 */
export async function scanForUpload(
  bytes: Buffer,
  ctx: ScanContext,
  cfg: AntivirusConfig = antivirusConfig(),
): Promise<string | null> {
  if (!cfg.enabled) return null;
  return scanVerdict(await scanBuffer(bytes, cfg), ctx, bytes.length, cfg);
}
