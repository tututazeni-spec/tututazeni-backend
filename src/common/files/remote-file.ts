// src/common/files/remote-file.ts
// Verificação de ficheiros guardados FORA da aplicação (`fileUrl` HTTPS no storage): o backend
// nunca os recebia, por isso nada os inspeccionava. Com REMOTE_FILE_VERIFY=true o backend
// descarrega o ficheiro (só do host autorizado) e aplica as mesmas verificações dos uploads
// inline: tipo real pelos bytes, estrutura, conteúdo activo e antivírus (em streaming, sem pôr
// ficheiros de 150 MB em memória).
//
// Segurança do próprio download (SSRF):
//  - o URL passa por safeFileUrlProblem (https, sem credenciais, host na allowlist, hostname não interno);
//  - o DNS é resolvido AQUI e rejeitado se algum endereço for interno (resolve a limitação de um
//    domínio público apontar para um IP privado); a ligação usa o endereço já validado
//    (pinning), por isso um DNS rebinding entre a validação e a ligação não funciona;
//  - redirecionamentos: no máximo 3, cada um revalidado da mesma forma;
//  - sem cookies nem Authorization; limite de bytes e de tempo totais.
//
//  REMOTE_FILE_VERIFY (false) · REMOTE_FILE_MAX_BYTES (200 MiB) · REMOTE_FILE_TIMEOUT_MS (30000)
//  REMOTE_FILE_FAIL_MODE=open (omissão) | closed: se o ficheiro não puder ser obtido/verificado
//    (storage lento, 404, timeout) open deixa passar e regista; closed recusa.
//  Ficheiro infectado/executável/activo é sempre recusado.
import * as dns from 'dns';
import * as https from 'https';
import { ALLOWED_MIME_TYPES } from '../validators/allowed-mime-types';
import { safeFileUrlProblem, isInternalHostname } from '../validators/safe-file-url';
import { antivirusConfig, AntivirusConfig, scanStream, scanVerdict, ScanResult } from './antivirus';
import { detectFileType } from './detect-file-type';
import { formatLimit } from './data-url';
import { FilePolicy } from './file-policies';
import { inspectBuffer } from './inspect-inline-file';
import { reportUploadRejection } from './upload-validation';

export type RemoteFailMode = 'open' | 'closed';

export interface RemoteFileConfig {
  enabled: boolean;
  maxBytes: number;
  timeoutMs: number;
  failMode: RemoteFailMode;
}

export const DEFAULT_REMOTE_MAX_BYTES = 200 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const HEAD_BYTES = 64 * 1024;
/** Até este tamanho o ficheiro vai inteiro para memória e leva a inspecção estrutural completa. */
export const REMOTE_BUFFER_LIMIT = 10 * 1024 * 1024;

// O browser executa estes tipos: se o storage os servir assim, o ficheiro é um vector de XSS
// mesmo que os bytes pareçam inofensivos.
const ACTIVE_CONTENT_TYPES: ReadonlySet<string> = new Set([
  'text/html',
  'application/xhtml+xml',
  'image/svg+xml',
  'text/xml',
  'application/xml',
  'text/javascript',
  'application/javascript',
  'application/x-javascript',
]);

export function remoteFileConfig(env: NodeJS.ProcessEnv = process.env): RemoteFileConfig {
  const max = Number(env.REMOTE_FILE_MAX_BYTES);
  const timeout = Number(env.REMOTE_FILE_TIMEOUT_MS);
  return {
    enabled:
      String(env.REMOTE_FILE_VERIFY ?? '')
        .trim()
        .toLowerCase() === 'true',
    maxBytes: Number.isInteger(max) && max >= 1024 * 1024 ? max : DEFAULT_REMOTE_MAX_BYTES,
    timeoutMs: Number.isInteger(timeout) && timeout >= 1000 ? timeout : 30_000,
    failMode:
      String(env.REMOTE_FILE_FAIL_MODE ?? '')
        .trim()
        .toLowerCase() === 'closed'
        ? 'closed'
        : 'open',
  };
}

export interface ResolvedAddress {
  address: string;
  family: number;
}

export interface RemoteResponse {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: AsyncIterable<Buffer>;
  destroy(): void;
}

export type RemoteOpener = (
  url: URL,
  address: ResolvedAddress,
  timeoutMs: number,
) => Promise<RemoteResponse>;

export interface RemoteDeps {
  resolve?: (hostname: string) => Promise<ResolvedAddress[]>;
  open?: RemoteOpener;
  /** Só para testes (servidor em localhost): não rejeitar endereços internos. */
  allowInternal?: boolean;
  scan?: (source: AsyncIterable<Buffer>, cfg: AntivirusConfig) => Promise<ScanResult>;
}

const defaultResolve = async (hostname: string): Promise<ResolvedAddress[]> =>
  dns.promises.lookup(hostname, { all: true, verbatim: true });

/** GET com a ligação fixada ao endereço validado (o `lookup` devolve sempre esse endereço). */
export function httpsOpener(
  extra: https.RequestOptions = {},
  transport: { request: typeof https.request } = https,
): RemoteOpener {
  return (url, address, timeoutMs) =>
    new Promise<RemoteResponse>((resolve, reject) => {
      const req = transport.request(
        {
          protocol: 'https:',
          ...extra,
          hostname: url.hostname,
          port: url.port || 443,
          path: `${url.pathname}${url.search}`,
          method: 'GET',
          servername: url.hostname, // SNI e validação do certificado pelo nome, não pelo IP
          headers: { Accept: '*/*', 'User-Agent': 'innova-file-verifier' },
          timeout: timeoutMs,
          // Fixa o endereço já validado: sem segunda resolução de DNS (anti-rebinding).
          lookup: ((_host: string, options: { all?: boolean }, cb: (...a: unknown[]) => void) =>
            options?.all
              ? cb(null, [{ address: address.address, family: address.family }])
              : cb(null, address.address, address.family)) as never,
        },
        res =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: res as AsyncIterable<Buffer>,
            destroy: () => res.destroy(),
          }),
      );
      req.on('timeout', () => req.destroy(new Error(`timeout (${timeoutMs} ms)`)));
      req.on('error', reject);
      req.end();
    });
}

const REMOTE_POLICY = (maxBytes: number): FilePolicy => ({
  name: 'REMOTE',
  mimes: ALLOWED_MIME_TYPES,
  maxBytes,
  maxDimension: 12_000,
});

const header = (r: RemoteResponse, name: string): string | undefined => {
  const v = r.headers[name];
  return Array.isArray(v) ? v[0] : v;
};

class Rejection extends Error {
  constructor(
    message: string,
    readonly hard: boolean,
    readonly stage: 'remote' | 'content' = 'remote',
  ) {
    super(message);
  }
}

/** Segue até 3 redirecionamentos, revalidando URL e DNS em cada salto. */
async function openValidated(
  start: string,
  cfg: RemoteFileConfig,
  deps: RemoteDeps,
): Promise<RemoteResponse> {
  const allowedHosts = (process.env.ALLOWED_FILE_HOST ?? '')
    .split(',')
    .map(h => h.trim())
    .filter(Boolean);
  const resolve = deps.resolve ?? defaultResolve;
  const open = deps.open ?? httpsOpener();
  let current = start;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const problem = safeFileUrlProblem(current, { allowedHosts });
    // Em testes com servidor local o hostname é "localhost": só aí se tolera o aviso de interno.
    if (problem && !(deps.allowInternal && problem.includes('interno'))) {
      throw new Rejection(`A ligação do ficheiro não é aceite (${problem}).`, true);
    }
    const url = new URL(current);
    let addresses: ResolvedAddress[];
    try {
      addresses = await resolve(url.hostname);
    } catch (err) {
      throw new Rejection(`DNS: ${(err as Error).message}`, false);
    }
    if (addresses.length === 0) throw new Rejection('DNS: sem endereços', false);
    if (!deps.allowInternal && addresses.some(a => isInternalHostname(a.address))) {
      throw new Rejection('A ligação do ficheiro resolve para um endereço interno.', true);
    }

    let res: RemoteResponse;
    try {
      res = await open(url, addresses[0], cfg.timeoutMs);
    } catch (err) {
      throw new Rejection((err as Error).message, false);
    }
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const location = header(res, 'location');
      res.destroy();
      if (!location) throw new Rejection('redirecionamento sem destino', false);
      current = new URL(location, url).toString();
      continue;
    }
    if (res.status !== 200) {
      res.destroy();
      throw new Rejection(`HTTP ${res.status}`, false);
    }
    return res;
  }
  throw new Rejection('demasiados redirecionamentos', true);
}

interface Download {
  total: number;
  head: Buffer;
  /** Ficheiro inteiro, só se coube em REMOTE_BUFFER_LIMIT. */
  whole: Buffer | null;
  /** Falha lançada a meio do corpo (limite/timeout): o scanStream converte-a em erro de AV. */
  failure: Rejection | null;
}

/** Percorre o corpo uma só vez, alimentando o antivírus e recolhendo o que a inspecção precisa. */
function tap(res: RemoteResponse, cfg: RemoteFileConfig, out: Download) {
  const started = Date.now();
  const parts: Buffer[] = [];
  let collecting = true;
  return (async function* () {
    try {
      for await (const chunk of res.body) {
        out.total += chunk.length;
        if (out.total > cfg.maxBytes) {
          throw new Rejection(`O ficheiro excede ${formatLimit(cfg.maxBytes)}.`, true);
        }
        if (Date.now() - started > cfg.timeoutMs) {
          throw new Rejection(`timeout (${cfg.timeoutMs} ms)`, false);
        }
        if (out.head.length < HEAD_BYTES) {
          out.head = Buffer.concat([out.head, chunk]).subarray(0, HEAD_BYTES);
        }
        if (collecting) {
          if (out.total > REMOTE_BUFFER_LIMIT) {
            collecting = false;
            parts.length = 0;
          } else {
            parts.push(chunk);
          }
        }
        yield chunk;
      }
      out.whole = collecting ? Buffer.concat(parts) : null;
    } catch (err) {
      if (err instanceof Rejection) out.failure = err;
      throw err;
    } finally {
      res.destroy();
    }
  })();
}

export interface RemoteContext {
  /** MIME declarado no DTO (campo `mimeType` irmão), se existir. */
  declaredMime?: string;
}

/**
 * Devolve `null` se o ficheiro remoto pode ser aceite, ou a mensagem de rejeição. Regista tudo.
 * Nunca lança: qualquer falha de rede segue REMOTE_FILE_FAIL_MODE.
 */
export async function verifyRemoteFile(
  url: string,
  ctx: RemoteContext = {},
  cfg: RemoteFileConfig = remoteFileConfig(),
  av: AntivirusConfig = antivirusConfig(),
  deps: RemoteDeps = {},
): Promise<string | null> {
  if (!cfg.enabled) return null;
  const base = { policy: 'REMOTE', declaredMime: ctx.declaredMime };
  const download: Download = { total: 0, head: Buffer.alloc(0), whole: null, failure: null };

  try {
    const res = await openValidated(url, cfg, deps);

    const contentType = (header(res, 'content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (ACTIVE_CONTENT_TYPES.has(contentType)) {
      res.destroy();
      throw new Rejection(
        `Ficheiro rejeitado: o armazenamento serve-o como ${contentType}, que o browser executa.`,
        true,
        'content',
      );
    }
    const declaredLength = Number(header(res, 'content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > cfg.maxBytes) {
      res.destroy();
      throw new Rejection(`O ficheiro excede ${formatLimit(cfg.maxBytes)}.`, true);
    }

    const scan = deps.scan ?? scanStream;
    const stream = tap(res, cfg, download);
    let scanResult: ScanResult | null = null;
    if (av.enabled) scanResult = await scan(stream, av);
    else for await (const chunk of stream) void chunk; // sem antivírus: só percorrer e recolher
    if (download.failure) throw download.failure; // limite/timeout a meio do corpo

    // Uma assinatura positiva decide já: nada mais interessa.
    if (scanResult?.status === 'infected') {
      return scanVerdict(
        scanResult,
        { policy: 'REMOTE', declaredMime: ctx.declaredMime ?? contentType },
        download.total,
        av,
      );
    }

    const mime = pickMime(ctx.declaredMime, contentType, download.head);
    if (download.whole) {
      const inspected = inspectBuffer(download.whole, mime, REMOTE_POLICY(REMOTE_BUFFER_LIMIT));
      if (inspected.ok === false) return inspected.error;
    } else {
      const detected = detectFileType(download.head);
      const problem = detected.dangerous
        ? `Ficheiro rejeitado: contém ${detected.dangerous}.`
        : detected.kind !== 'unknown' && !detected.mimes.includes(mime)
          ? 'O conteúdo do ficheiro não corresponde ao tipo declarado.'
          : null;
      if (problem) {
        reportUploadRejection({
          ...base,
          stage: 'content',
          reason: problem,
          detectedKind: detected.kind,
          bytes: download.total,
          enforced: true,
        });
        return problem;
      }
    }

    if (scanResult) {
      // Aqui já só pode ser `clean` ou `error` (clamd indisponível: segue CLAMAV_FAIL_MODE).
      return scanVerdict(scanResult, { policy: 'REMOTE', declaredMime: mime }, download.total, av);
    }
    return null;
  } catch (err) {
    if (err instanceof Rejection && err.hard) {
      reportUploadRejection({
        ...base,
        stage: err.stage,
        reason: err.message,
        bytes: download.total || undefined,
        enforced: true,
      });
      return err.message;
    }
    const reason = `Ficheiro remoto não verificado (${(err as Error).message}).`;
    const closed = cfg.failMode === 'closed';
    reportUploadRejection({ ...base, stage: 'remote', reason, enforced: closed });
    return closed
      ? 'Não foi possível obter o ficheiro para verificação. Confirme a ligação e tente novamente.'
      : null;
  }
}

/** MIME a usar na comparação: o declarado (se permitido), senão o Content-Type, senão o detectado. */
function pickMime(declared: string | undefined, contentType: string, head: Buffer): string {
  const allowed = ALLOWED_MIME_TYPES as readonly string[];
  const d = declared?.toLowerCase();
  if (d && allowed.includes(d)) return d;
  if (contentType && allowed.includes(contentType)) return contentType;
  return detectFileType(head).mimes[0] ?? 'application/octet-stream';
}
