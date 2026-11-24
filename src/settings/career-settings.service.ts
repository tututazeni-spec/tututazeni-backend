// src/settings/career-settings.service.ts
// Definições → Carreira: limiares dos Critérios de Promoção.
import { BadRequestException, Injectable } from '@nestjs/common';
import { swallow } from '../common/logging/swallow';
import { PrismaService } from '../prisma/prisma.service';
import { writeChainedAuditLog } from '../common/helpers/audit-chain';
import { resolveDefaultTenantId } from '../common/helpers/tenant.helper';
import { UpdateCareerSettingsDto } from './settings.dto';
import { CareerSettings, parseCareerSettings } from './career-settings';

@Injectable()
export class CareerSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  private async tenant() {
    const id = await resolveDefaultTenantId(this.prisma);
    return this.prisma.tenantConfig.findUniqueOrThrow({
      where: { id },
      select: { id: true, careerSettingsJson: true },
    });
  }

  async get(): Promise<CareerSettings> {
    const t = await this.tenant();
    return parseCareerSettings(t.careerSettingsJson);
  }

  async update(dto: UpdateCareerSettingsDto, actorId?: number): Promise<CareerSettings> {
    const t = await this.tenant();
    const current = parseCareerSettings(t.careerSettingsJson);
    const next: CareerSettings = {
      ...current,
      ...Object.fromEntries(Object.entries(dto).filter(([, v]) => v !== undefined)),
    };
    if (next.readyIn12mCompetenciesPct > next.minCompetenciesPct) {
      throw new BadRequestException(
        'A % para "pronto em 12 meses" não pode ser superior à % exigida para elegibilidade',
      );
    }
    await this.prisma.tenantConfig.update({
      where: { id: t.id },
      data: { careerSettingsJson: JSON.stringify(next) },
    });
    await writeChainedAuditLog(this.prisma, {
      userId: actorId,
      action: 'SETTINGS_CAREER_UPDATE',
      entity: 'Settings',
      severity: 'MEDIUM',
      metadata: JSON.stringify({ before: current, after: next }),
    }).catch(
      swallow(
        'career-settings.service',
        'falha ao gravar registo de auditoria',
        undefined,
        'error',
      ),
    );
    return next;
  }
}
