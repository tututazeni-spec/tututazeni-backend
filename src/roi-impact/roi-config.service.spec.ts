import { Test, TestingModule } from '@nestjs/testing';
import { RoiConfigService } from './roi-config.service';
import { PrismaService } from '../prisma/prisma.service';

function buildPrismaMock() {
  const prisma: any = {
    roiConfig: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn(),
    },
  };
  Object.defineProperty(prisma, 'read', {
    get() {
      return prisma;
    },
    configurable: true,
  });
  return prisma;
}

describe('RoiConfigService', () => {
  let service: RoiConfigService;
  let prisma: ReturnType<typeof buildPrismaMock>;

  beforeEach(async () => {
    prisma = buildPrismaMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [RoiConfigService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get<RoiConfigService>(RoiConfigService);
  });

  describe('getConfig', () => {
    it('returns the spec defaults when no row exists yet', async () => {
      const config = await service.getConfig();
      expect(config).toEqual({
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
      });
    });

    it('parses the JSON map fields from the persisted row', async () => {
      prisma.roiConfig.findUnique.mockResolvedValue({
        currency: 'USD',
        discountRatePercent: 8,
        defaultIsolationFactorsJson: JSON.stringify({ CURSO: 0.6, FORMACAO: 0.7 }),
        level45CostThreshold: 500000,
        defaultMeasurementPeriods: [60, 90],
        defaultBenefitValidatorIds: [3, 7],
        benefitConversionFormulasJson: JSON.stringify({ PRODUTIVIDADE: 'output/hora x salário' }),
        financialAccessRoles: ['ADMIN'],
        operationalOnlyRoles: ['GESTOR'],
        alertNoMeasurementDays: 45,
        alertRoiBelowExpectedPercent: 10,
      });
      const config = await service.getConfig();
      expect(config.defaultIsolationFactors).toEqual({ CURSO: 0.6, FORMACAO: 0.7 });
      expect(config.benefitConversionFormulas).toEqual({
        PRODUTIVIDADE: 'output/hora x salário',
      });
      expect(config.currency).toBe('USD');
      expect(config.defaultBenefitValidatorIds).toEqual([3, 7]);
    });

    it('falls back to an empty map when the persisted JSON is malformed', async () => {
      prisma.roiConfig.findUnique.mockResolvedValue({
        currency: 'AOA',
        discountRatePercent: null,
        defaultIsolationFactorsJson: '{not json',
        level45CostThreshold: null,
        defaultMeasurementPeriods: [30],
        defaultBenefitValidatorIds: [],
        benefitConversionFormulasJson: null,
        financialAccessRoles: [],
        operationalOnlyRoles: [],
        alertNoMeasurementDays: null,
        alertRoiBelowExpectedPercent: null,
      });
      const config = await service.getConfig();
      expect(config.defaultIsolationFactors).toEqual({});
      expect(config.benefitConversionFormulas).toEqual({});
    });
  });

  describe('updateConfig', () => {
    it('stringifies the map fields and upserts by the fixed id=1', async () => {
      prisma.roiConfig.upsert.mockResolvedValue({});
      prisma.roiConfig.findUnique.mockResolvedValue({
        currency: 'AOA',
        discountRatePercent: null,
        defaultIsolationFactorsJson: JSON.stringify({ CURSO: 0.5 }),
        level45CostThreshold: null,
        defaultMeasurementPeriods: [30, 60, 90, 180],
        defaultBenefitValidatorIds: [],
        benefitConversionFormulasJson: null,
        financialAccessRoles: ['ADMIN', 'RH', 'DIRECTOR'],
        operationalOnlyRoles: ['GESTOR', 'LIDER'],
        alertNoMeasurementDays: 30,
        alertRoiBelowExpectedPercent: null,
      });

      await service.updateConfig(42, {
        defaultIsolationFactors: { CURSO: 0.5 },
        alertNoMeasurementDays: 30,
      });

      expect(prisma.roiConfig.upsert).toHaveBeenCalledWith({
        where: { id: 1 },
        create: expect.objectContaining({
          id: 1,
          defaultIsolationFactorsJson: JSON.stringify({ CURSO: 0.5 }),
          alertNoMeasurementDays: 30,
          updatedById: 42,
        }),
        update: expect.objectContaining({
          defaultIsolationFactorsJson: JSON.stringify({ CURSO: 0.5 }),
          alertNoMeasurementDays: 30,
          updatedById: 42,
        }),
      });
    });

    it('only sends the fields provided, leaving the rest untouched', async () => {
      prisma.roiConfig.upsert.mockResolvedValue({});
      prisma.roiConfig.findUnique.mockResolvedValue(null);

      await service.updateConfig(1, { currency: 'USD' });

      const call = prisma.roiConfig.upsert.mock.calls[0][0];
      expect(call.update).toEqual({ currency: 'USD', updatedById: 1 });
    });
  });
});
