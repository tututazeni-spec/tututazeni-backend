// src/process-standard/process-settings.service.ts
// Aba "Configurações" (docs/Modulo_Processes.md §14): 16 secções com valor
// validado, versionamento (cada alteração gera uma versão restaurável) e
// registo na auditoria. A leitura em runtime é feita por `loadSetting`.
import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUserData } from '../common/decorators';
import { writeProcessAuditLog } from './process-audit';
import { DEFAULT_SETTINGS, SETTING_META, SettingKey, validateSetting } from './process-settings';
import { UpdateProcessSettingDto } from './process-standard.dto';

const parse = (raw: string, key: SettingKey): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    return DEFAULT_SETTINGS[key];
  }
};

/** Chaves de topo (ou índices) cujo valor mudou — resumo legível para a auditoria. */
function changedKeys(before: unknown, after: unknown): string[] {
  if (JSON.stringify(before) === JSON.stringify(after)) return [];
  if (
    before &&
    after &&
    typeof before === 'object' &&
    typeof after === 'object' &&
    !Array.isArray(before) &&
    !Array.isArray(after)
  ) {
    const b = before as Record<string, unknown>;
    const a = after as Record<string, unknown>;
    return [...new Set([...Object.keys(b), ...Object.keys(a)])].filter(
      k => JSON.stringify(b[k]) !== JSON.stringify(a[k]),
    );
  }
  return ['*'];
}

@Injectable()
export class ProcessSettingsService {
  private readonly logger = new Logger(ProcessSettingsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async all() {
    const rows = await this.prisma.processSetting.findMany();
    const byKey = new Map(rows.map(r => [r.key, r]));
    const users = await this.prisma.user.findMany({
      where: { id: { in: rows.map(r => r.updatedById).filter((v): v is number => !!v) } },
      select: { id: true, fullName: true },
    });
    const name = new Map(users.map(u => [u.id, u.fullName]));
    return SETTING_META.map(meta => {
      const row = byKey.get(meta.key);
      return {
        ...meta,
        value: row ? parse(row.value, meta.key) : DEFAULT_SETTINGS[meta.key],
        defaultValue: DEFAULT_SETTINGS[meta.key],
        version: row?.version ?? 0,
        isDefault: !row,
        updatedAt: row?.updatedAt ?? null,
        updatedBy: row?.updatedById ? (name.get(row.updatedById) ?? null) : null,
      };
    });
  }

  async history(key: SettingKey) {
    const rows = await this.prisma.processSettingVersion.findMany({
      where: { key },
      orderBy: { version: 'desc' },
      take: 50,
      include: { changedBy: { select: { id: true, fullName: true } } },
    });
    return rows.map(r => ({
      version: r.version,
      reason: r.reason,
      createdAt: r.createdAt,
      changedBy: r.changedBy,
      value: parse(r.value, key),
    }));
  }

  async update(key: SettingKey, dto: UpdateProcessSettingDto, user: CurrentUserData) {
    const value = validateSetting(key, dto.value);
    return this.save(key, value, user, dto.reason, dto.expectedVersion, 'SETTING_UPDATED');
  }

  async restore(key: SettingKey, version: number, user: CurrentUserData, reason?: string) {
    const old = await this.prisma.processSettingVersion.findUnique({
      where: { key_version: { key, version } },
    });
    if (!old) throw new NotFoundException(`Versão ${version} não encontrada`);
    // Revalida: as regras podem ter ficado mais estritas desde essa versão.
    const value = validateSetting(key, parse(old.value, key));
    return this.save(
      key,
      value,
      user,
      reason || `Restaurada a versão ${version}`,
      undefined,
      'SETTING_RESTORED',
    );
  }

  /** Repõe os valores por omissão como nova versão (não apaga o histórico). */
  async reset(key: SettingKey, user: CurrentUserData, reason?: string) {
    return this.save(
      key,
      DEFAULT_SETTINGS[key],
      user,
      reason || 'Repostos os valores por omissão',
      undefined,
      'SETTING_RESTORED',
    );
  }

  private async save(
    key: SettingKey,
    value: unknown,
    user: CurrentUserData,
    reason: string | undefined,
    expectedVersion: number | undefined,
    action: 'SETTING_UPDATED' | 'SETTING_RESTORED',
  ) {
    const current = await this.prisma.processSetting.findUnique({ where: { key } });
    const currentVersion = current?.version ?? 0;
    if (expectedVersion !== undefined && expectedVersion !== currentVersion) {
      throw new ConflictException(
        'Esta configuração foi alterada por outro utilizador. Recarregue antes de guardar.',
      );
    }
    const before = current ? parse(current.value, key) : DEFAULT_SETTINGS[key];
    const changes = changedKeys(before, value);
    if (current && changes.length === 0) {
      return this.view(key, current.version, value, current.updatedAt, user.id);
    }
    const version = currentVersion + 1;
    const json = JSON.stringify(value);
    const [row] = await this.prisma.$transaction([
      this.prisma.processSetting.upsert({
        where: { key },
        create: { key, value: json, version, updatedById: user.id },
        update: { value: json, version, updatedById: user.id },
      }),
      this.prisma.processSettingVersion.create({
        data: { key, version, value: json, reason: reason?.trim() || null, changedById: user.id },
      }),
    ]);
    await writeProcessAuditLog(this.prisma, this.logger, {
      userId: user.id,
      action,
      reason: reason?.trim() || undefined,
      meta: { key, version, previousVersion: currentVersion, changed: changes },
    });
    return this.view(key, version, value, row.updatedAt, user.id);
  }

  private view(key: SettingKey, version: number, value: unknown, updatedAt: Date, userId: number) {
    const meta = SETTING_META.find(m => m.key === key);
    return { ...meta, key, value, version, updatedAt, updatedById: userId, isDefault: false };
  }
}
