// src/common/files/remote-file.ts
// Verificação de ficheiros guardados FORA da aplicação (`fileUrl` HTTPS no storage): o backend
// nunca os recebia, por isso nada os inspeccionava. Com REMOTE_FILE_VERIFY=true o backend
// descarrega o ficheiro (só do host autorizado) e aplica as mesmas verificações dos uploads
// inline: tipo real pelos bytes, estrutura, conteúdo activo e antivírus (em streaming, sem pôr
// ficheiros de 150 MB em memória).
//
// Segurança do próprio download (SSRF):
//  - o URL passa por safeFileUrlProblem (https, sem credenciais, host na allowlist, hostname não interno);
//  - o DNS é resolvido AQUI e rejeitado se algum endereço for interno; a ligação usa o endereço já
//    validado (pinning), por isso um DNS rebinding entre a validação e a ligação não funciona;
//  - redirecionamentos: no máximo 3, cada um revalidado da mesma forma;
//  - sem cookies nem Authorization; limite de bytes e de tempo totais.
//
// Custo (um pedido ao storage por criação/edição com fileUrl):
//  - CACHE: o veredicto definitivo fica em cache (verdict-cache.ts) e a revalidação é um GET
//    CONDICIONAL (If-None-Match / If-Modified-Since): o storage responde 304 sem corpo se o
//    ficheiro não mudou, e não há download nem scan. Um ficheiro substituído muda de ETag e é revisto.
//  - DIFERIMENTO: ficheiros acima de REMOTE_FILE_SYNC_MAX_BYTES não são descarregados durante o
//    pedido; são verificados em segundo plano (RemoteFileSweeper) e o resultado vai para o AuditLog.
//
//  REMOTE_FILE_VERIFY (false) · REMOTE_FILE_MAX_BYTES (200 MiB) · REMOTE_FILE_TIMEOUT_MS (30000)
//  REMOTE_FILE_SYNC_MAX_BYTES (25 MiB) · REMOTE_FILE_CACHE_TTL_S (86400)
//  REMOTE_FILE_FAIL_MODE=open (omissão) | closed: se o ficheiro não puder ser obtido/verificado
//    (storage lento, 404, timeout) open deixa passar e regista; closed recusa.
//  Ficheiro infectado/executável/activo é sempre recusado.
import * as dns from 'dns';
import * as https from 'https';
import { ALLOWED_MIME_TYPES } from '../validators/allowed-mime-types';
import { getRequestContext } from '../logging/request-context';
import { safeFileUrlProblem, isInternalHostname } from '../validators/safe-file-url';
import { antivirusConfig, AntivirusConfig, scanStream, scanVerdict, ScanResult } from './antivirus';
import { detectFileType } from './detect-file-type';
import { formatLimit } from './data-url';
import { FilePolicy } from './file-policies';
import { inspectBuffer } from './inspect-inline-file';
import { reportUploadRejection } from './upload-validation';
import { FileValidators, getVerdictCache, VerdictCache, verdictKey } from './verdict-cache';

export type RemoteFailMode = 'open' | 'closed';

export interface RemoteFileConfig {
  enabled: boolean;
  maxBytes: number;
  timeoutMs: number;
  failMode: RemoteFailMode;
  /** Acima disto o ficheiro não é descarregado no pedido: fica para verificação em segundo plano. */
  syncMaxBytes: number;
  cacheTtlSeconds: number;
}

export const DEFAULT_REMOTE_MAX_BYTES = 200 * 1024 * 1024;
export const DEFAULT_SYNC_MAX_BYTES = 25 * 1024 * 1024;
export const DEFAULT_CACHE_TTL_SECONDS = 24 * 3600;
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
  const int = (v: unknown, min: number, fallback: number): number => {
    const n = Number(v);
    return Number.isInteger(n) && n >= min ? n : fallback;
  };
  return {
    enabled:
      String(env.REMOTE_FILE_VERIFY ?? '')
        .trim()
        .toLowerCase() === 'true',
    maxBytes: int(env.REMOTE_FILE_MAX_BYTES, 1024 * 1024, DEFAULT_REMOTE_MAX_BYTES),
    timeoutMs: int(env.REMOTE_FILE_TIMEOUT_MS, 1000, 30_000),
    failMode:
      String(env.REMOTE_FILE_FAIL_MODE ?? '')
        .trim()
        .toLowerCase() === 'closed'
        ? 'closed'
        : 'open',
    syncMaxBytes: int(env.REMOTE_FILE_SYNC_MAX_BYTES, 1024 * 1024, DEFAULT_SYNC_MAX_BYTES),
    cacheTtlSeconds: int(env.REMOTE_FILE_CACHE_TTL_S, 60, DEFAULT_CACHE_TTL_SECONDS),
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
  requestHeaders?: Record<string, string>,
) => Promise<RemoteResponse>;

export interface RemoteDeps {
  resolve?: (hostname: string) => Promise<ResolvedAddress[]>;
  open?: RemoteOpener;
  /** Só para testes (servidor em localhost): não rejeitar endereços internos. */
  allowInternal?: boolean;
  scan?: (source: AsyncIterable<Buffer>, cfg: AntivirusConfig) => Promise<ScanResult>;
  cache?: VerdictCache;
}

const defaultResolve = async (hostname: string): Promise<ResolvedAddress[]> =>
  dns.promises.lookup(hostname, { all: true, verbatim: true });

/** GET com a ligação fixada ao endereço validado (o `lookup` devolve sempre esse endereço). */
export function httpsOpener(
  extra: https.RequestOptions = {},
  transport: { request: typeof https.request } = https,
): RemoteOpener {
  return (url, address, timeoutMs, requestHeaders = {}) =>
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
          headers: { Accept: '*/*', 'User-Agent': 'innova-file-verifier', ...requestHeaders },
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
    /** O veredicto depende só do conteúdo do ficheiro (logo pode ficar em cache). */
    readonly definitive = false,
  ) {
    super(message);
  }
}

/** O ficheiro é grande demais para o pedido: segue para verificação em segundo plano. */
class Deferral extends Error {}

// ─── Verificação diferida (ficheiros grandes) ────────────────────────────────

export interface DeferredRequest {
  url: string;
  declaredMime?: string;
  userId?: number | string | null;
  reqId?: string;
}
export type DeferredVerifier = (req: DeferredRequest) => void;
let deferredVerifier: DeferredVerifier | undefined;

/** Regista quem trata dos ficheiros grandes. Sem ninguém registado, verifica-se tudo no pedido. */
export function setDeferredVerifier(fn: DeferredVerifier | undefined): void {
  deferredVerifier = fn;
}

// ─── Obtenção segura ─────────────────────────────────────────────────────────

/** Segue até 3 redirecionamentos, revalidando URL e DNS em cada salto. */
async function openValidated(
  start: string,
  cfg: RemoteFileConfig,
  deps: RemoteDeps,
  requestHeaders: Record<string, string>,
): Promise<RemoteResponse> {
  const allowedHosts = (process.env.ALLOWED_FILE_HOST ?? '')
    .split(',')
    .map(h => h.trim())
    .filter(Boolean);
  const resolve = deps.resolve ?? defaultResolve;
  const open = deps.open ?? httpsOpener();
  const conditional = 'If-None-Match' in requestHeaders || 'If-Modified-Since' in requestHeaders;
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
      res = await open(url, addresses[0], cfg.timeoutMs, requestHeaders);
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
    // 304 só é legítimo como resposta a um pedido condicional.
    if (res.status === 304 && conditional) return res;
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
  failure: Error | null;
}

/** Percorre o corpo uma só vez, alimentando o antivírus e recolhendo o que a inspecção precisa. */
function tap(res: RemoteResponse, cfg: RemoteFileConfig, out: Download, deferAbove: number) {
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
        if (out.total > deferAbove) throw new Deferral('ficheiro grande');
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
      if (err instanceof Rejection || err instanceof Deferral) out.failure = err;
      throw err;
    } finally {
      res.destroy();
    }
  })();
}

export interface RemoteContext {
  /** MIME declarado no DTO (campo `mimeType` irmão), se existir. */
  declaredMime?: string;
  /** Segundo plano (job periódico, verificação diferida): sem diferimento nem limite síncrono. */
  background?: boolean;
  /** Ignora o cache e descarrega sempre. */
  force?: boolean;
}

function validatorsOf(res: RemoteResponse): FileValidators {
  const length = Number(header(res, 'content-length'));
  return {
    etag: header(res, 'etag'),
    lastModified: header(res, 'last-modified'),
    length: Number.isFinite(length) ? length : undefined,
  };
}

const canRevalidate = (v: FileValidators): boolean => !!(v.etag || v.lastModified);

function conditionalHeaders(v: FileValidators): Record<string, string> {
  const h: Record<string, string> = {};
  if (v.etag) h['If-None-Match'] = v.etag;
  if (v.lastModified) h['If-Modified-Since'] = v.lastModified;
  return h;
}

interface Outcome {
  message: string | null;
  /** O veredicto é definitivo (depende só do ficheiro) e pode ser guardado em cache. */
  cacheable: boolean;
  scanned: boolean;
  validators?: FileValidators;
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
  const cache = deps.cache ?? getVerdictCache();

  let key: string | undefined;
  try {
    key = verdictKey(url);
  } catch {
    key = undefined; // URL inválido: openValidated recusa-o a seguir
  }

  try {
    // 1. Cache + pedido condicional.
    let cached = !ctx.force && key ? await cache.get(key) : null;
    // Um "limpo" guardado sem scan não vale agora que o antivírus está ligado.
    if (cached && av.enabled && !cached.scanned && cached.rejection === null) cached = null;
    if (cached && !canRevalidate(cached.validators)) cached = null;

    const res = await openValidated(
      url,
      cfg,
      deps,
      cached ? conditionalHeaders(cached.validators) : {},
    );

    if (res.status === 304 && cached) {
      res.destroy();
      if (cached.rejection) {
        reportUploadRejection({
          ...base,
          stage: 'content',
          reason: cached.rejection,
          enforced: true,
        });
      }
      return cached.rejection;
    }

    const outcome = await inspectResponse(res, url, ctx, cfg, av, deps, download, base);
    if (outcome.cacheable && key && canRevalidate(outcome.validators ?? {})) {
      await cache.set(
        key,
        {
          validators: outcome.validators ?? {},
          rejection: outcome.message,
          scanned: outcome.scanned,
          checkedAt: Date.now(),
        },
        cfg.cacheTtlSeconds,
      );
    }
    return outcome.message;
  } catch (err) {
    if (err instanceof Deferral) return deferVerification(url, ctx, base, download.total);
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

/** Entrega o ficheiro grande ao verificador de segundo plano; o pedido segue sem esperar. */
function deferVerification(
  url: string,
  ctx: RemoteContext,
  base: { policy: string; declaredMime?: string },
  bytes: number,
): string | null {
  const requestCtx = getRequestContext();
  deferredVerifier?.({
    url,
    declaredMime: ctx.declaredMime,
    userId: requestCtx.userId,
    reqId: requestCtx.reqId,
  });
  reportUploadRejection({
    ...base,
    stage: 'remote',
    reason: 'Ficheiro grande: verificação feita em segundo plano.',
    bytes: bytes || undefined,
    enforced: false,
  });
  return null;
}

/** Verifica uma resposta 200: Content-Type, tamanho, estrutura e antivírus. */
async function inspectResponse(
  res: RemoteResponse,
  url: string,
  ctx: RemoteContext,
  cfg: RemoteFileConfig,
  av: AntivirusConfig,
  deps: RemoteDeps,
  download: Download,
  base: { policy: string; declaredMime?: string },
): Promise<Outcome> {
  const validators = validatorsOf(res);
  const contentType = (header(res, 'content-type') ?? '').split(';')[0].trim().toLowerCase();
  const reject = (message: string, stage: 'content' = 'content'): Outcome => {
    reportUploadRejection({
      ...base,
      stage,
      reason: message,
      bytes: download.total || undefined,
      enforced: true,
    });
    return { message, cacheable: true, scanned: false, validators };
  };

  if (ACTIVE_CONTENT_TYPES.has(contentType)) {
    res.destroy();
    return reject(
      `Ficheiro rejeitado: o armazenamento serve-o como ${contentType}, que o browser executa.`,
    );
  }
  if (validators.length !== undefined && validators.length > cfg.maxBytes) {
    res.destroy();
    throw new Rejection(`O ficheiro excede ${formatLimit(cfg.maxBytes)}.`, true);
  }
  // Só se adia se alguém tratar do segundo plano; senão verifica-se tudo aqui.
  const canDefer = !ctx.background && deferredVerifier !== undefined;
  if (canDefer && validators.length !== undefined && validators.length > cfg.syncMaxBytes) {
    res.destroy();
    throw new Deferral('ficheiro grande');
  }

  const scan = deps.scan ?? scanStream;
  const stream = tap(res, cfg, download, canDefer ? cfg.syncMaxBytes : Infinity);
  let scanResult: ScanResult | null = null;
  if (av.enabled) scanResult = await scan(stream, av);
  else for await (const chunk of stream) void chunk; // sem antivírus: só percorrer e recolher
  if (download.failure) throw download.failure; // limite/timeout/diferimento a meio do corpo

  // Uma assinatura positiva decide já: nada mais interessa.
  if (scanResult?.status === 'infected') {
    const message = scanVerdict(
      scanResult,
      { policy: 'REMOTE', declaredMime: ctx.declaredMime ?? contentType },
      download.total,
      av,
    );
    return { message, cacheable: true, scanned: true, validators };
  }

  const mime = pickMime(ctx.declaredMime, contentType, download.head);
  if (download.whole) {
    const inspected = inspectBuffer(download.whole, mime, REMOTE_POLICY(REMOTE_BUFFER_LIMIT));
    if (inspected.ok === false) {
      return { message: inspected.error, cacheable: true, scanned: false, validators };
    }
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
      return { message: problem, cacheable: true, scanned: false, validators };
    }
  }

  if (scanResult) {
    // Aqui já só pode ser `clean` ou `error` (clamd indisponível: segue CLAMAV_FAIL_MODE).
    const message = scanVerdict(
      scanResult,
      { policy: 'REMOTE', declaredMime: mime },
      download.total,
      av,
    );
    // Um erro do antivírus não é um veredicto: não se guarda em cache.
    return { message, cacheable: scanResult.status === 'clean', scanned: true, validators };
  }
  return { message: null, cacheable: true, scanned: false, validators };
}

/** MIME a usar na comparação: o declarado (se permitido), senão o Content-Type, senão o detectado. */
function pickMime(declared: string | undefined, contentType: string, head: Buffer): string {
  const allowed = ALLOWED_MIME_TYPES as readonly string[];
  const d = declared?.toLowerCase();
  if (d && allowed.includes(d)) return d;
  if (contentType && allowed.includes(contentType)) return contentType;
  return detectFileType(head).mimes[0] ?? 'application/octet-stream';
}
