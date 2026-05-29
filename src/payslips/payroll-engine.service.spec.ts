import { Test, TestingModule } from '@nestjs/testing';
import { PayrollEngineService } from './payroll-engine.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  countryConfig: {
    findFirst: jest.fn().mockResolvedValue({
      countryCode: 'AO',
      taxYear: 2024,
      irtBrackets: [],
      inssRate: 3,
      inssEmployerRate: 8,
    }),
  },
  employeeCompensation: {
    findFirst: jest.fn().mockResolvedValue({ baseSalary: 5000, currency: 'AOA' }),
  },
};

describe('PayrollEngineService', () => {
  let service: PayrollEngineService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [PayrollEngineService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<PayrollEngineService>(PayrollEngineService);
  });

  describe('loadCountryConfig', () => {
    it('deve carregar configuração do país', async () => {
      const result = await service.loadCountryConfig('AO', 2024);
      expect(result).toBeDefined();
    });
  });

  describe('loadEmployeeCompensation', () => {
    it('deve carregar remuneração do colaborador', async () => {
      const result = await service.loadEmployeeCompensation(1);
      expect(result).toBeDefined();
    });
  });
});
