// modulo_scalability.md §29 P2 — simulação de crescimento (what-if) e recomendações de dimensionamento.
//
// Extrapolação linear a partir do consumo actual por utilizador/sessão: não é um modelo
// de previsão, é uma estimativa de ordem de grandeza para planear capacidade.

import { Injectable } from '@nestjs/common';
import { IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { ScalabilityCapacityService } from './scalability-capacity.service';

export class WhatIfDto {
  @IsInt() @Min(1) @Max(10_000_000) users!: number;
  @IsOptional() @IsNumber() @Min(0.1) @Max(100) concurrentPercent?: number;
}

export interface WhatIfBase {
  totalUsers: number;
  concurrentPeak: number;
  rps: number | null;
  dbConnections: number | null;
  storageGb: number | null;
}
export interface WhatIfLimits {
  maxConcurrentUsers: number;
  maxApiRps: number;
  dbMaxConnections: number | null;
  storageTotalGb: number | null;
  rpsPerInstance: number;
  currentInstances: number;
}

type Level = 'OK' | 'ATENCAO' | 'CRITICO';
const level = (p: number): Level => (p >= 90 ? 'CRITICO' : p >= 70 ? 'ATENCAO' : 'OK');
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Função pura: projecta cada recurso para `users` utilizadores. */
export function projectWhatIf(
  base: WhatIfBase,
  limits: WhatIfLimits,
  users: number,
  concurrentPercent?: number,
) {
  const scale = base.totalUsers > 0 ? users / base.totalUsers : 1;
  const concurrent = Math.ceil(
    concurrentPercent !== undefined
      ? (users * concurrentPercent) / 100
      : base.concurrentPeak * scale,
  );
  // Carga por sessão concorrente actual; se não houver, usa a escala de utilizadores.
  const loadScale = base.concurrentPeak > 0 ? concurrent / base.concurrentPeak : scale;
  const rows = [
    {
      key: 'concurrent',
      label: 'Concurrent users',
      projected: concurrent as number | null,
      capacity: limits.maxConcurrentUsers as number | null,
    },
    {
      key: 'rps',
      label: 'API RPS',
      projected: base.rps === null ? null : r1(base.rps * loadScale),
      capacity: limits.maxApiRps as number | null,
    },
    {
      key: 'db',
      label: 'DB connections',
      projected: base.dbConnections === null ? null : Math.ceil(base.dbConnections * loadScale),
      capacity: limits.dbMaxConnections,
    },
    {
      key: 'storage',
      label: 'Storage (GB)',
      projected: base.storageGb === null ? null : r1(base.storageGb * scale),
      capacity: limits.storageTotalGb,
    },
  ].map(r => {
    const percent =
      r.projected !== null && r.capacity ? r1((r.projected / r.capacity) * 100) : null;
    return { ...r, percent, level: percent === null ? null : level(percent) };
  });

  const recommendations: string[] = [];
  const rps = rows.find(r => r.key === 'rps');
  if (rps?.projected != null && limits.rpsPerInstance > 0) {
    const needed = Math.ceil(rps.projected / limits.rpsPerInstance);
    if (needed > limits.currentInstances) {
      recommendations.push(
        `Passar de ${limits.currentInstances} para ${needed} instâncias da API (~${limits.rpsPerInstance} req/s cada).`,
      );
    }
  }
  for (const r of rows) {
    if (r.percent === null || r.percent < 70) continue;
    const need = r.level === 'CRITICO' ? 'Aumentar' : 'Rever';
    recommendations.push(
      `${need} o limite de ${r.label}: projecção ${r.projected} de ${r.capacity} (${r.percent}%).`,
    );
  }
  const worst = Math.max(0, ...rows.map(r => r.percent ?? 0));
  return {
    users,
    concurrentUsers: concurrent,
    resources: rows,
    verdict: level(worst),
    recommendations,
  };
}

@Injectable()
export class ScalabilityWhatIfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly capacity: ScalabilityCapacityService,
  ) {}

  async simulate(dto: WhatIfDto) {
    const [cap, s] = await Promise.all([
      this.capacity.getCapacityMetrics(),
      this.prisma.scalabilityInfraSettings.findUnique({ where: { id: 'default' } }),
    ]);
    const res = (key: string) => cap.resources.find(r => r.key === key);
    const base: WhatIfBase = {
      totalUsers: cap.current.totalUsers,
      concurrentPeak: cap.current.concurrentPeak24h,
      rps: cap.current.requestsPerSecond,
      dbConnections: cap.current.dbConnections,
      storageGb: cap.current.storageGb,
    };
    const limits: WhatIfLimits = {
      maxConcurrentUsers: cap.limits.maxConcurrentUsers,
      maxApiRps: cap.limits.maxApiRps,
      dbMaxConnections: res('db')?.capacity ?? null,
      storageTotalGb: res('storage')?.capacity ?? null,
      rpsPerInstance: s?.asRequestsPerInstance ?? 400,
      currentInstances: s?.apiReplicas ?? 1,
    };
    return {
      base,
      ...projectWhatIf(base, limits, dto.users, dto.concurrentPercent),
      note: 'Extrapolação linear a partir do consumo actual — estimativa de ordem de grandeza.',
    };
  }
}
