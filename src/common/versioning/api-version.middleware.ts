import type { NextFunction, Request, Response } from 'express';

// Versionamento por prefixo de URL. `/v1/courses` e `/courses` chegam ao mesmo handler (o
// frontend e integrações antigas continuam sem prefixo); novas integrações devem usar `/v1`.
// Quando existir uma v2 com mudanças incompatíveis, acrescenta-se aqui e as rotas v1 mantêm-se
// até ao fim do período de depreciação (cabeçalhos Deprecation/Sunset, ver DEPRECATED_VERSIONS).
export const CURRENT_API_VERSION = 'v1';
export const SUPPORTED_API_VERSIONS: readonly string[] = ['v1'];
/** versão → data de fim de vida (RFC 8594 Sunset). Vazio enquanto só existe v1. */
export const DEPRECATED_VERSIONS: Readonly<Record<string, string>> = {};

const VERSION_PREFIX = /^\/(v\d+)(?=\/|\?|$)/;

export type VersionedRequest = Request & { apiVersion?: string };

export function parseVersionedUrl(url: string): { version: string | null; url: string } {
  const m = VERSION_PREFIX.exec(url);
  if (!m) return { version: null, url };
  const rest = url.slice(m[0].length);
  return { version: m[1], url: rest.startsWith('/') ? rest : `/${rest}` };
}

export function apiVersionMiddleware() {
  return (req: VersionedRequest, res: Response, next: NextFunction) => {
    const parsed = parseVersionedUrl(req.url);
    const version = parsed.version ?? CURRENT_API_VERSION;

    if (parsed.version && !SUPPORTED_API_VERSIONS.includes(parsed.version)) {
      res.status(404).json({
        statusCode: 404,
        error: 'Not Found',
        message: `Versão da API "${parsed.version}" não suportada. Versões disponíveis: ${SUPPORTED_API_VERSIONS.join(', ')}.`,
      });
      return;
    }

    if (parsed.version) {
      // Os restantes middlewares/guards (limites de corpo, CSRF, módulos por plano) veem o
      // caminho canónico sem prefixo.
      req.url = parsed.url;
      req.originalUrl = req.originalUrl.replace(VERSION_PREFIX, '') || '/';
    }
    req.apiVersion = version;

    res.setHeader('X-API-Version', version);
    const sunset = DEPRECATED_VERSIONS[version];
    if (sunset) {
      res.setHeader('Deprecation', 'true');
      res.setHeader('Sunset', new Date(sunset).toUTCString());
    }
    next();
  };
}
