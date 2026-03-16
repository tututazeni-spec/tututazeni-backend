import { Test, TestingModule } from '@nestjs/testing';
import { DashboardRhService } from './dashboard-rh.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('DashboardRhService', () => {
  let service: DashboardRhService;
  let prisma: PrismaService;

  const mockPrisma = {
    employee: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
    },
    contract: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    evaluation: {
      findMany: jest.fn(),
      aggregate: jest.fn(),
    },
    attendance: {
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardRhService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<DashboardRhService>(DashboardRhService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getAllEmployees', () => {
    it('should return all employees', async () => {
      const result = [{ id: 1, name: 'João' }];

      mockPrisma.employee.findMany.mockResolvedValue(result);

      expect(await service.getAllEmployees()).toEqual(result);
      expect(prisma.employee.findMany).toHaveBeenCalled();
    });
  });

  describe('getEmployeeById', () => {
    it('should return one employee', async () => {
      const result = { id: 1, name: 'Maria' };

      mockPrisma.employee.findUnique.mockResolvedValue(result);

      expect(await service.getEmployeeById('1')).toEqual(result);
      expect(prisma.employee.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        include: { contracts: true, evaluations: true, attendances: true },
      });
    });
  });

  describe('getActiveContracts', () => {
    it('should return active contracts', async () => {
      const result = [{ id: 1, status: 'active' }];

      mockPrisma.contract.findMany.mockResolvedValue(result);

      expect(await service.getActiveContracts()).toEqual(result);
      expect(prisma.contract.findMany).toHaveBeenCalled();
    });
  });

  describe('getDashboardSummary', () => {
    it('should return dashboard summary', async () => {
      mockPrisma.employee.count.mockResolvedValue(10);
      mockPrisma.contract.count.mockResolvedValue(5);
      mockPrisma.evaluation.aggregate.mockResolvedValue({
        _avg: { score: 4.5 },
      });

      const result = await service.getDashboardSummary();

      expect(result).toEqual({
        totalEmployees: 10,
        activeContracts: 5,
        averageScore: 4.5,
      });
    });
  });
});
