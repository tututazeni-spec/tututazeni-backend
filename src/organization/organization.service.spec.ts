import { Test, TestingModule } from '@nestjs/testing';
import { OrganizationService } from './organization.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  DepartmentsService,
  PositionsService,
  UnitsService,
} from '../departments/departments.service';

const mockDepartments = { create: jest.fn(), update: jest.fn(), remove: jest.fn() };
const mockPositions = { create: jest.fn(), update: jest.fn(), remove: jest.fn() };
const mockUnits = { create: jest.fn(), update: jest.fn() };

const makeCount = (n = 0) => jest.fn().mockResolvedValue(n);
const makeFind = (data: any[] = []) => jest.fn().mockResolvedValue(data);

const mockPrisma = {
  user: {
    count: makeCount(100),
    findMany: makeFind(),
    findUnique: jest.fn(),
    groupBy: jest.fn().mockResolvedValue([]),
    aggregate: jest.fn().mockResolvedValue({ _avg: {} }),
  },
  department: {
    count: makeCount(10),
    findMany: makeFind(),
    findUnique: jest.fn(),
  },
  position: { count: makeCount(20), findMany: makeFind() },
  unit: { count: makeCount(5), findMany: makeFind() },
  orgChangeLog: {
    create: jest.fn().mockResolvedValue({}),
    findMany: makeFind(),
    count: makeCount(),
  },
  notificationLog: { create: jest.fn().mockResolvedValue({}) },
};

describe('OrganizationService', () => {
  let service: OrganizationService;

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.defineProperty(mockPrisma, 'read', {
      get() {
        return mockPrisma;
      },
      configurable: true,
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: DepartmentsService, useValue: mockDepartments },
        { provide: PositionsService, useValue: mockPositions },
        { provide: UnitsService, useValue: mockUnits },
      ],
    }).compile();
    service = module.get<OrganizationService>(OrganizationService);
  });

  describe('getStats', () => {
    it('deve retornar estatísticas organizacionais', async () => {
      mockPrisma.user.count
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(90)
        .mockResolvedValueOnce(10);
      mockPrisma.user.findMany.mockResolvedValue([]);

      const result = await service.getStats();
      expect(result).toBeDefined();
    });
  });

  describe('getOrgChart', () => {
    it('deve retornar org chart', async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        {
          id: 1,
          fullName: 'CEO',
          managerId: null,
          position: null,
          department: null,
          subordinates: [],
        },
      ]);

      const result = await service.getOrgChart({});
      expect(result).toBeDefined();
    });
  });
});
