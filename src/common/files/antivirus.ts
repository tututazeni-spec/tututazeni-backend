// src/common/files/antivirus.ts
// Cliente mínimo do ClamAV (clamd, comando INSTREAM sobre TCP). Sem dependências.
//
// Opt-in: CLAMAV_ENABLED=true. Quando desligado, `scanForUpload` devolve de imediato e o fluxo de
// upload não muda. As verificações estruturais (inspect-inline-file) correm sempre; o antivírus é
// a camada seguinte e apanha malware CONHECIDO que a estrutura não vê (ex.: JavaScript dentro de
// streams comprimidos de PDF, documentos Office com exploits).
//
//  CLAMAV_HOST (127.0.0.1) · CLAMAV_PORT (3310) · CLAMAV_TIMEOUT_MS (15000)
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
}

export type ScanResult =
  | { status: 'clean' }
  | { status: 'infected'; signature: string }
  | { status: 'error'; reason: string };

const CHUNK_BYTES = 64 * 1024;
const MAX_REPLY_BYTES = 4096;

export function antivirusConfig(env: NodeJS.ProcessEnv = process.env): AntivirusConfig {
  const port = Number(env.CLAMAV_PORT);
  const timeout = Number(env.CLAMAV_TIMEOUT_MS);
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

/** Envia o buffer ao clamd (INSTREAM). Nunca lança: falhas de rede/timeout viram `error`. */
export function scanBuffer(
  bytes: Buffer,
  cfg: AntivirusConfig = antivirusConfig(),
): Promise<ScanResult> {
  return new Promise<ScanResult>(resolve => {
    let settled = false;
    const chunks: Buffer[] = [];
    let received = 0;
    const socket = net.createConnection({ host: cfg.host, port: cfg.port });

    const finish = (result: ScanResult) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(cfg.timeoutMs, () =>
      finish({ status: 'error', reason: `timeout (${cfg.timeoutMs} ms)` }),
    );
    socket.on('error', err => finish({ status: 'error', reason: err.message }));
    socket.on('data', d => {
      chunks.push(d);
      received += d.length;
      if (received > MAX_REPLY_BYTES)
        finish({ status: 'error', reason: 'resposta demasiado longa' });
    });
    socket.on('close', () => finish(parseClamdReply(Buffer.concat(chunks).toString('utf8'))));

    socket.on('connect', () => {
      // zINSTREAM\0 e, por cada bloco, 4 bytes (big-endian) com o tamanho; 0 termina o fluxo.
      socket.write(Buffer.concat([Buffer.from('zINSTREAM', 'latin1'), Buffer.from([0])]));
      for (let off = 0; off < bytes.length; off += CHUNK_BYTES) {
        const part = bytes.subarray(off, off + CHUNK_BYTES);
        const len = Buffer.alloc(4);
        len.writeUInt32BE(part.length, 0);
        socket.write(len);
        socket.write(part);
      }
      socket.write(Buffer.alloc(4));
    });
  });
}

export interface ScanContext {
  policy: string;
  declaredMime: string;
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
  const result = await scanBuffer(bytes, cfg);
  if (result.status === 'clean') return null;

  const base = { policy: ctx.policy, declaredMime: ctx.declaredMime, bytes: bytes.length };
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
