import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import {
  UnitsService,
  RolesService,
  PositionsService,
  CareersService,
} from './departments.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  unit: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
  role: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  permission: { create: jest.fn() },
  rolePermission: { create: jest.fn(), upsert: jest.fn(), deleteMany: jest.fn() },
  position: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
  careerPosition: { findUnique: jest.fn(), create: jest.fn() },
  positionCompetency: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
  userCareer: {
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    create: jest.fn().mockResolvedValue({}),
  },
};

function makeModule<T>(cls: new (...args: any[]) => T) {
  return Test.createTestingModule({
    providers: [cls as any, { provide: PrismaService, useValue: mockPrisma }],
  }).compile();
}

beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(mockPrisma, 'read', { get: () => mockPrisma, configurable: true });
});

describe('UnitsService — erros', () => {
  let service: UnitsService;
  beforeEach(async () => {
    const module: TestingModule = await makeModule(UnitsService);
    service = module.get(UnitsService);
  });

  it('findOne inexistente → NotFoundException', async () => {
    mockPrisma.unit.findUnique.mockResolvedValue(null);
    await expect(service.findOne(1)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('update inexistente → NotFoundException (não chega a actualizar)', async () => {
    mockPrisma.unit.findUnique.mockResolvedValue(null);
    await expect(service.update(1, {} as any)).rejects.toBeInstanceOf(NotFoundException);
    expect(mockPrisma.unit.update).not.toHaveBeenCalled();
  });

  it('remove inexistente → NotFoundException', async () => {
    mockPrisma.unit.findUnique.mockResolvedValue(null);
    await expect(service.remove(1)).rejects.toBeInstanceOf(NotFoundException);
    expect(mockPrisma.unit.delete).not.toHaveBeenCalled();
  });
});

describe('RolesService — erros e invariantes', () => {
  let service: RolesService;
  beforeEach(async () => {
    const module: TestingModule = await makeModule(RolesService);
    service = module.get(RolesService);
  });

  it('findOne inexistente → NotFoundException', async () => {
    mockPrisma.role.findUnique.mockResolvedValue(null);
    await expect(service.findOne(1)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('create com nome duplicado → ConflictException', async () => {
    mockPrisma.role.findFirst.mockResolvedValue({ id: 1, name: 'GESTOR' });
    await expect(service.create({ name: 'GESTOR' } as any)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(mockPrisma.role.create).not.toHaveBeenCalled();
  });

  // M2M via RolePermission: addPermission já não exige (nem procura) uma role
  // ADMIN implícita — cria a permissão no catálogo e só associa a um role se
  // `dto.roleId` for explicitamente indicado (ver project-innova-acl-permission-ownership).
  it('addPermission cria a permissão no catálogo sem role associada quando roleId não é indicado', async () => {
    mockPrisma.permission.create.mockResolvedValue({ id: 1, name: 'x' });
    const result = await service.addPermission({ name: 'x' } as any);
    expect(mockPrisma.permission.create).toHaveBeenCalledWith({ data: { name: 'x' } });
    expect(mockPrisma.rolePermission.create).not.toHaveBeenCalled();
    expect(result).toEqual({ id: 1, name: 'x' });
  });

  it('addPermission associa a permissão criada ao roleId indicado via RolePermission', async () => {
    mockPrisma.permission.create.mockResolvedValue({ id: 1, name: 'x' });
    await service.addPermission({ name: 'x', roleId: 3 } as any);
    expect(mockPrisma.rolePermission.create).toHaveBeenCalledWith({
      data: { roleId: 3, permissionId: 1 },
    });
  });

  it('initDefaultRoles só cria as roles por omissão que ainda não existem', async () => {
    mockPrisma.role.findFirst.mockImplementation(({ where }: any) =>
      Promise.resolve(where.name === 'ADMIN' ? { id: 1, name: 'ADMIN' } : null),
    );
    mockPrisma.role.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 99, ...data }),
    );

    const result = await service.initDefaultRoles();

    expect(result.created).toBe(4); // todas menos ADMIN, que já existia
  });
});

describe('PositionsService — erros', () => {
  let service: PositionsService;
  beforeEach(async () => {
    const module: TestingModule = await makeModule(PositionsService);
    service = module.get(PositionsService);
  });

  it('findOne inexistente → NotFoundException', async () => {
    mockPrisma.position.findUnique.mockResolvedValue(null);
    await expect(service.findOne(1)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('remove inexistente → NotFoundException', async () => {
    mockPrisma.position.findUnique.mockResolvedValue(null);
    await expect(service.remove(1)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('CareersService — posições de carreira', () => {
  let service: CareersService;
  beforeEach(async () => {
    const module: TestingModule = await makeModule(CareersService);
    service = module.get(CareersService);
  });

  it('findOnePosition inexistente → NotFoundException', async () => {
    mockPrisma.careerPosition.findUnique.mockResolvedValue(null);
    await expect(service.findOnePosition(1)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('createPosition associa as competências indicadas', async () => {
    mockPrisma.careerPosition.create.mockResolvedValue({ id: 5 });
    mockPrisma.careerPosition.findUnique.mockResolvedValue({ id: 5 });
    await service.createPosition({
      name: 'Especialista',
      level: 3,
      competencies: [{ competencyId: 1, requiredLevel: 2 }],
    } as any);
    expect(mockPrisma.positionCompetency.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({ positionId: 5, competencyId: 1 })],
      }),
    );
  });

  it('assignCareerPosition fecha a posição anterior antes de abrir a nova', async () => {
    await service.assignCareerPosition(7, 10);
    expect(mockPrisma.userCareer.updateMany).toHaveBeenCalledWith({
      where: { userId: 7, endedAt: null },
      data: { endedAt: expect.any(Date) },
    });
    expect(mockPrisma.userCareer.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { userId: 7, positionId: 10 } }),
    );
  });
});
