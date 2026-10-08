// src/roi-impact/roi-config.service.ts
// "Configurações" (docs/roi-impact.md §11) — singleton em RoiConfig (id fixo
// = 1), mesmo padrão de AiTutorSettings (ver ai-tutor.service.ts#getSettings/
// updateSettings): getConfig() devolve a linha existente ou os defaults do
// spec, updateConfig() faz upsert. defaultIsolationFactorsJson e
// benefitConversionFormulasJson guardam mapas por RoiInitiativeType/
// RoiBenefitType como JSON — sempre JSON.stringify ao escrever, JSON.parse ao
// ler (mesma regra de NotificationLog.metadata).
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateRoiConfigDto } from './roi-impact.dto';

export interface RoiConfigData {
  currency: string;
  discountRatePercent: number | null;
  defaultIsolationFactors: Record<string, number>;
  level45CostThreshold: number | null;
  defaultMeasurementPeriods: number[];
  defaultBenefitValidatorIds: number[];
  benefitConversionFormulas: Record<string, string>;
  financialAccessRoles: string[];
  operationalOnlyRoles: string[];
  alertNoMeasurementDays: number | null;
  alertRoiBelowExpectedPercent: number | null;
}

const DEFAULT_ROI_CONFIG: RoiConfigData = {
  currency: 'AOA',
  discountRatePercent: null,
  defaultIsolationFactors: {},
  level45CostThreshold: null,
  defaultMeasurementPeriods: [30, 60, 90, 180],
  defaultBenefitValidatorIds: [],
  benefitConversionFormulas: {},
  financialAccessRoles: ['ADMIN', 'RH', 'DIRECTOR'],
  operationalOnlyRoles: ['GESTOR', 'LIDER'],
  alertNoMeasurementDays: null,
  alertRoiBelowExpectedPercent: null,
};

function parseJsonMap<T>(raw: string | null): Record<string, T> {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

@Injectable()
export class RoiConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async getConfig(): Promise<RoiConfigData> {
    const row = await this.prisma.read.roiConfig.findUnique({ where: { id: 1 } });
    if (!row) return DEFAULT_ROI_CONFIG;
    return {
      currency: row.currency,
      discountRatePercent: row.discountRatePercent,
      defaultIsolationFactors: parseJsonMap<number>(row.defaultIsolationFactorsJson),
      level45CostThreshold: row.level45CostThreshold,
      defaultMeasurementPeriods: row.defaultMeasurementPeriods,
      defaultBenefitValidatorIds: row.defaultBenefitValidatorIds,
      benefitConversionFormulas: parseJsonMap<string>(row.benefitConversionFormulasJson),
      financialAccessRoles: row.financialAccessRoles,
      operationalOnlyRoles: row.operationalOnlyRoles,
      alertNoMeasurementDays: row.alertNoMeasurementDays,
      alertRoiBelowExpectedPercent: row.alertRoiBelowExpectedPercent,
    };
  }

  async updateConfig(adminUserId: number, dto: UpdateRoiConfigDto): Promise<RoiConfigData> {
    const data = {
      ...(dto.currency !== undefined ? { currency: dto.currency } : {}),
      ...(dto.discountRatePercent !== undefined
        ? { discountRatePercent: dto.discountRatePercent }
        : {}),
      ...(dto.defaultIsolationFactors !== undefined
        ? { defaultIsolationFactorsJson: JSON.stringify(dto.defaultIsolationFactors) }
        : {}),
      ...(dto.level45CostThreshold !== undefined
        ? { level45CostThreshold: dto.level45CostThreshold }
        : {}),
      ...(dto.defaultMeasurementPeriods !== undefined
        ? { defaultMeasurementPeriods: dto.defaultMeasurementPeriods }
        : {}),
      ...(dto.defaultBenefitValidatorIds !== undefined
        ? { defaultBenefitValidatorIds: dto.defaultBenefitValidatorIds }
        : {}),
      ...(dto.benefitConversionFormulas !== undefined
        ? { benefitConversionFormulasJson: JSON.stringify(dto.benefitConversionFormulas) }
        : {}),
      ...(dto.financialAccessRoles !== undefined
        ? { financialAccessRoles: dto.financialAccessRoles }
        : {}),
      ...(dto.operationalOnlyRoles !== undefined
        ? { operationalOnlyRoles: dto.operationalOnlyRoles }
        : {}),
      ...(dto.alertNoMeasurementDays !== undefined
        ? { alertNoMeasurementDays: dto.alertNoMeasurementDays }
        : {}),
      ...(dto.alertRoiBelowExpectedPercent !== undefined
        ? { alertRoiBelowExpectedPercent: dto.alertRoiBelowExpectedPercent }
        : {}),
      updatedById: adminUserId,
    };
    await this.prisma.roiConfig.upsert({
      where: { id: 1 },
      create: { id: 1, ...data },
      update: data,
    });
    return this.getConfig();
  }
}
