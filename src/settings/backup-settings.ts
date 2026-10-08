// src/settings/backup-settings.ts
// Definições de Backups (docs/modulo_settings.md §14) — guardadas em
// TenantConfig.backupSettingsJson; execuções em BackupRun. Lógica pura (agenda,
// retenção, nomes de ficheiro): sem acesso à BD nem ao sistema de ficheiros.

export const BACKUP_FREQUENCIES = ['DAILY', 'WEEKLY', 'MONTHLY'] as const;
export type BackupFrequency = (typeof BACKUP_FREQUENCIES)[number];

export interface BackupSettings {
  enabled: boolean;
  frequency: BackupFrequency;
  /** Hora local do servidor (0-23) a que o backup agendado corre. */
  hour: number;
  /** Dia da semana (0=domingo) para WEEKLY; dia do mês (1-28) para MONTHLY. */
  day: number;
  /** Pasta (caminho absoluto) onde os ficheiros .dump são gravados. */
  destinationDir: string;
  /** Backups com sucesso mais antigos que isto são eliminados… */
  retentionDays: number;
  /** …mas mantêm-se sempre pelo menos estas cópias recentes. */
  minCopies: number;
}

export const DEFAULT_BACKUP_SETTINGS: BackupSettings = {
  enabled: false,
  frequency: 'DAILY',
  hour: 2,
  day: 1,
  destinationDir: '',
  retentionDays: 30,
  minCopies: 3,
};

export function parseBackupSettings(raw: string | null | undefined): BackupSettings {
  if (!raw) return { ...DEFAULT_BACKUP_SETTINGS };
  try {
    return { ...DEFAULT_BACKUP_SETTINGS, ...(JSON.parse(raw) as Partial<BackupSettings>) };
  } catch {
    return { ...DEFAULT_BACKUP_SETTINGS };
  }
}

/** Último instante agendado ≤ `now` (o "slot" que o backup mais recente deveria cobrir). */
export function lastScheduledSlot(s: BackupSettings, now: Date): Date {
  const d = new Date(now);
  d.setMinutes(0, 0, 0);
  d.setHours(s.hour);
  if (s.frequency === 'DAILY') {
    if (d > now) d.setDate(d.getDate() - 1);
  } else if (s.frequency === 'WEEKLY') {
    d.setDate(d.getDate() - ((d.getDay() - s.day + 7) % 7));
    if (d > now) d.setDate(d.getDate() - 7);
  } else {
    d.setDate(s.day);
    if (d > now) {
      d.setMonth(d.getMonth() - 1);
      d.setDate(s.day);
    }
  }
  return d;
}

export function nextScheduledSlot(s: BackupSettings, now: Date): Date {
  const d = lastScheduledSlot(s, now);
  if (s.frequency === 'DAILY') d.setDate(d.getDate() + 1);
  else if (s.frequency === 'WEEKLY') d.setDate(d.getDate() + 7);
  else {
    d.setDate(1);
    d.setMonth(d.getMonth() + 1);
    d.setDate(s.day);
  }
  return d;
}

/** Há um backup agendado em atraso? (nenhum sucesso desde o último slot) */
export function isBackupDue(s: BackupSettings, lastSuccessAt: Date | null, now: Date): boolean {
  if (!s.enabled || !s.destinationDir) return false;
  return !lastSuccessAt || lastSuccessAt < lastScheduledSlot(s, now);
}

/** Intervalo nominal entre backups, em ms (para detectar backups "em atraso"). */
export function frequencyMs(f: BackupFrequency): number {
  return { DAILY: 1, WEEKLY: 7, MONTHLY: 31 }[f] * 24 * 3_600_000;
}

export interface RetentionCandidate {
  id: number;
  startedAt: Date;
}

/**
 * Dado o conjunto de backups com sucesso (ficheiro ainda existente), devolve os ids a
 * eliminar: mais antigos que `retentionDays`, preservando sempre as `minCopies` mais recentes.
 */
export function selectExpired(
  runs: RetentionCandidate[],
  s: Pick<BackupSettings, 'retentionDays' | 'minCopies'>,
  now: Date,
): number[] {
  const cutoff = now.getTime() - s.retentionDays * 24 * 3_600_000;
  return [...runs]
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
    .slice(s.minCopies)
    .filter(r => r.startedAt.getTime() < cutoff)
    .map(r => r.id);
}

export function backupFileName(at: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `innova-${at.getFullYear()}${p(at.getMonth() + 1)}${p(at.getDate())}-${p(at.getHours())}${p(at.getMinutes())}${p(at.getSeconds())}.dump`;
}

/** Só caminhos absolutos, sem `..` nem caracteres de controlo. */
export function isSafeBackupDir(dir: string): boolean {
  if (!dir || /[\0\r\n]/.test(dir)) return false;
  if (dir.split(/[\\/]+/).includes('..')) return false;
  return /^([a-zA-Z]:[\\/]|\/)/.test(dir);
}
