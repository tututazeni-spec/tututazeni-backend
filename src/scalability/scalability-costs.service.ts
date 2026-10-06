// modulo_scalability.md §21 — aba Custos.
//
// A aplicação não vê facturas de cloud: o custo mensal por categoria é
// introduzido pelo administrador (e auditado). Tudo o resto é derivado — custo
// por utilizador e por utilizador activo a partir das contagens reais, e a
// previsão por escalão como extrapolação LINEAR do custo por utilizador actual
// (pressuposto declarado na resposta; custos fixos tornam-na pessimista).

import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';

export const COST_CATEGORIES = [
  'DATABASE',
  'STORAGE',
  'COMPUTE',
  'TRAFFIC',
  'BACKUPS',
  'EXTERNAL',
] as const;
export type CostCategory = (typeof COST_CATEGORIES)[number];

export const COST_TIERS = [6000, 10000, 20000, 50000] as const;

const SETTINGS_ID = 'default';

export class CostEntryInputDto {
  @IsIn(COST_CATEGORIES) category!: CostCategory;
  @IsNumber() @Min(0) @Max(1_000_000_000) amount!: number;
  @IsOptional() @IsString() @MaxLength(200) note?: string;
}

export class SaveCostsDto {
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'month deve ser YYYY-MM' }) month!: string;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CostEntryInputDto)
  entries!: CostEntryInputDto[];
  @IsOptional() @IsString() @MaxLength(8) currency?: string;
}

@Injectable()
export class ScalabilityCostsService {
  private readonly logger = new Logger(ScalabilityCostsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private round2(n: number) {
    return Math.round(n * 100) / 100;
  }

  async getCosts() {
    const [settings, rows, totalUsers, activeUsers] = await Promise.all([
      this.prisma.scalabilityInfraSettings.upsert({
        where: { id: SETTINGS_ID },
        update: {},
        create: { id: SETTINGS_ID },
      }),
      this.prisma.scalabilityCostEntry.findMany({ orderBy: { month: 'desc' }, take: 12 * 6 }),
      this.prisma.read.user.count(),
      this.prisma.read.user.count({ where: { active: true } }),
    ]);

    const byMonth = new Map<string, Map<string, { amount: number; note: string | null }>>();
    for (const r of rows) {
      if (!byMonth.has(r.month)) byMonth.set(r.month, new Map());
      byMonth.get(r.month)!.set(r.category, { amount: r.amount, note: r.note });
    }
    const months = [...byMonth.keys()].sort().slice(-12);
    const history = months.map(m => ({
      month: m,
      total: this.round2([...byMonth.get(m)!.values()].reduce((s, e) => s + e.amount, 0)),
    }));

    const latestMonth = months[months.length - 1] ?? null;
    const latest = latestMonth ? byMonth.get(latestMonth)! : null;
    const total = latest ? [...latest.values()].reduce((s, e) => s + e.amount, 0) : null;

    const categories = COST_CATEGORIES.map(c => {
      const e = latest?.get(c);
      return {
        category: c,
        amount: e ? this.round2(e.amount) : null,
        note: e?.note ?? null,
        percent: total && e ? this.round2((e.amount / total) * 100) : null,
      };
    });

    const perUser = total !== null && totalUsers > 0 ? total / totalUsers : null;
    const perActiveUser = total !== null && activeUsers > 0 ? total / activeUsers : null;

    const previous = months.length >= 2 ? history[history.length - 2].total : null;
    const changePercent =
      total !== null && previous ? this.round2(((total - previous) / previous) * 100) : null;

    return {
      currency: settings.costCurrency,
      month: latestMonth,
      current: {
        total: total === null ? null : this.round2(total),
        perUser: perUser === null ? null : this.round2(perUser),
        perActiveUser: perActiveUser === null ? null : this.round2(perActiveUser),
        changePercent,
        totalUsers,
        activeUsers,
      },
      categories,
      history,
      projection: COST_TIERS.map(users => ({
        users,
        estimated: perUser === null ? null : this.round2(perUser * users),
        perCategory:
          perUser === null || !total
            ? null
            : categories.map(c => ({
                category: c.category,
                estimated: c.amount === null ? null : this.round2((c.amount / totalUsers) * users),
              })),
      })),
      note:
        'Os custos são os introduzidos nesta aba — a aplicação não lê facturas de cloud. ' +
        'A previsão extrapola linearmente o custo por utilizador do último mês registado; ' +
        'custos fixos (instâncias mínimas, licenças) fazem-na sobrestimar escalões baixos e ' +
        'saltos de capacidade fazem-na subestimar escalões altos.',
    };
  }

  async saveCosts(dto: SaveCostsDto, actorId: number) {
    const seen = new Set<string>();
    for (const e of dto.entries) {
      if (seen.has(e.category)) throw new BadRequestException(`Categoria repetida: ${e.category}`);
      seen.add(e.category);
    }
    if (!dto.entries.length && !dto.currency) {
      throw new BadRequestException('Nada para guardar');
    }

    const before = await this.prisma.scalabilityCostEntry.findMany({ where: { month: dto.month } });
    const beforeMap = new Map(before.map(b => [b.category, b.amount]));

    await this.prisma.$transaction([
      ...dto.entries.map(e =>
        this.prisma.scalabilityCostEntry.upsert({
          where: { month_category: { month: dto.month, category: e.category } },
          update: { amount: e.amount, note: e.note?.trim() || null, updatedById: actorId },
          create: {
            month: dto.month,
            category: e.category,
            amount: e.amount,
            note: e.note?.trim() || null,
            updatedById: actorId,
          },
        }),
      ),
      ...(dto.currency
        ? [
            this.prisma.scalabilityInfraSettings.upsert({
              where: { id: SETTINGS_ID },
              update: { costCurrency: dto.currency.trim().toUpperCase(), updatedById: actorId },
              create: { id: SETTINGS_ID, costCurrency: dto.currency.trim().toUpperCase() },
            }),
          ]
        : []),
    ]);

    const changes: Record<string, { from: number | null; to: number }> = {};
    for (const e of dto.entries) {
      const from = beforeMap.get(e.category) ?? null;
      if (from !== e.amount) changes[e.category] = { from, to: e.amount };
    }
    if (Object.keys(changes).length || dto.currency) {
      await this.audit
        .logEntity(actorId, 'SCALABILITY_COSTS_UPDATE', 'ScalabilityCostEntry', dto.month, {
          month: dto.month,
          changes,
          ...(dto.currency && { currency: dto.currency }),
        })
        .catch(err =>
          this.logger.warn(`Auditoria falhou: ${err instanceof Error ? err.message : err}`),
        );
    }
    return this.getCosts();
  }
}
