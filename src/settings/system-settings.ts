// src/settings/system-settings.ts
// Definições de Sistema (docs/modulo_settings.md §15) — guardadas em
// TenantConfig.systemSettingsJson. Lógica pura: sem acesso à BD nem ao Redis.
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES } from '../common/validators/allowed-mime-types';

/** Filas geridas no painel (as que existem na aplicação). */
export const SYSTEM_QUEUE_NAMES = ['audit', 'email', 'notifications', 'webhooks'] as const;
export type SystemQueueName = (typeof SYSTEM_QUEUE_NAMES)[number];

/** Prefixos de cache da aplicação que o painel pode limpar (nunca `bull:*`). */
export const CACHE_NAMESPACES = ['dashboard'] as const;
export type CacheNamespace = (typeof CACHE_NAMESPACES)[number];

export interface SystemSettings {
  maintenance: { enabled: boolean; message: string };
  pagination: {
    /** Tecto aplicado a `?limit=` em todos os pedidos. */
    maxPageSize: number;
  };
  uploads: {
    maxFileSizeMb: number;
    allowedMimeTypes: string[];
  };
  jobs: {
    /** Dias a manter jobs concluídos/falhados antes de a limpeza os remover. */
    retentionDays: number;
  };
}

export const MAX_PAGE_SIZE_CEILING = 1000;
export const MAX_UPLOAD_MB_CEILING = MAX_FILE_SIZE_BYTES / (1024 * 1024);

export const DEFAULT_SYSTEM_SETTINGS: SystemSettings = {
  maintenance: {
    enabled: false,
    message: 'A plataforma está em manutenção. Voltamos em breve.',
  },
  pagination: { maxPageSize: 200 },
  uploads: { maxFileSizeMb: MAX_UPLOAD_MB_CEILING, allowedMimeTypes: [...ALLOWED_MIME_TYPES] },
  jobs: { retentionDays: 7 },
};

export function parseSystemSettings(raw: string | null | undefined): SystemSettings {
  const d = DEFAULT_SYSTEM_SETTINGS;
  if (!raw) return structuredClone(d);
  try {
    const p = JSON.parse(raw) as Partial<SystemSettings>;
    return {
      maintenance: { ...d.maintenance, ...p.maintenance },
      pagination: { ...d.pagination, ...p.pagination },
      uploads: {
        ...d.uploads,
        ...p.uploads,
        // Nunca vai além do que os DTOs estáticos aceitam.
        allowedMimeTypes: (p.uploads?.allowedMimeTypes ?? d.uploads.allowedMimeTypes).filter(m =>
          (ALLOWED_MIME_TYPES as readonly string[]).includes(m),
        ),
      },
      jobs: { ...d.jobs, ...p.jobs },
    };
  } catch {
    return structuredClone(d);
  }
}

/** Rotas que continuam acessíveis em modo de manutenção (login do admin, saúde, definições de sistema). */
const MAINTENANCE_ALLOW_PREFIXES = ['/auth', '/health', '/metrics', '/settings/system'];

export function isMaintenanceExempt(url: string, isAdmin: boolean): boolean {
  if (isAdmin) return true;
  const p = url.split('?')[0];
  return MAINTENANCE_ALLOW_PREFIXES.some(x => p === x || p.startsWith(`${x}/`));
}

/** Reduz `?limit=` ao tecto configurado; devolve o novo valor ou `null` se não há nada a alterar. */
export function clampLimit(raw: unknown, max: number): string | null {
  if (typeof raw !== 'string') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > max ? String(max) : null;
}

/** Valida os metadados de ficheiro de um corpo de pedido; devolve a mensagem de erro ou `null`. */
export function checkUploadMetadata(
  body: unknown,
  uploads: SystemSettings['uploads'],
): string | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  if (typeof b.mimeType === 'string' && !uploads.allowedMimeTypes.includes(b.mimeType)) {
    return `Tipo de ficheiro não permitido: ${b.mimeType}`;
  }
  const maxBytes = uploads.maxFileSizeMb * 1024 * 1024;
  const bytes =
    typeof b.fileSize === 'number'
      ? b.fileSize
      : typeof b.fileSizeKb === 'number'
        ? b.fileSizeKb * 1024
        : null;
  if (bytes !== null && bytes > maxBytes) {
    return `O ficheiro excede o tamanho máximo de ${uploads.maxFileSizeMb} MB`;
  }
  return null;
}
