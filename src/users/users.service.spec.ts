import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bull';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';

const mockEmailQueue = { add: jest.fn().mockResolvedValue(undefined) };

const userMock = {
  findUnique: jest.fn(),
  findFirst: jest.fn(),
  findMany: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  count: jest.fn(),
  delete: jest.fn(),
};

const mockPrismaBase = {
  user: userMock,
  userPoints: {
    create: jest.fn().mockResolvedValue({}),
    findUnique: jest.fn().mockResolvedValue({ points: 100 }),
    upsert: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
  },
  notificationLog: { create: jest.fn().mockResolvedValue({}) },
  auditLog: {
    create: jest.fn().mockResolvedValue({}),
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
  },
  userAuditLog: {
    create: jest.fn().mockResolvedValue({}),
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
  },
  department: {
    findFirst: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    count: jest.fn().mockResolvedValue(0),
  },
  position: {
    findFirst: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    count: jest.fn().mockResolvedValue(0),
  },
  badgeAward: {
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
  },
  enrollment: {
    count: jest.fn().mockResolvedValue(0),
    findMany: jest.fn().mockResolvedValue([]),
  },
  userCompetency: { count: jest.fn().mockResolvedValue(0) },
  refreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
  // changePassword usa $transaction([...]) (array de promises); create() usa
  // $transaction(async tx => ...) (estilo interactivo) — o mock suporta ambos.
  $transaction: jest.fn((arg: unknown) => {
    if (typeof arg === 'function') {
      return (arg as (tx: unknown) => Promise<unknown>)(mockPrisma);
    }
    return Promise.all(arg as Promise<unknown>[]);
  }),
};

const mockPrisma = new Proxy(mockPrismaBase, {
  get(target, prop) {
    if (prop === 'db') return mockPrisma; // read-replica client → mesmo mock
    return (
      (target as any)[prop] ?? {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      }
    );
  },
});

const baseUser = {
  id: 1,
  fullName: 'Placido Costa',
  email: 'placido@innova.com',
  password: 'hashed',
  active: true,
  employeeNumber: 'EMP001',
  mfaEnabled: false,
  roleId: 1,
  departmentId: 1,
  positionId: 1,
  unitId: null,
  managerId: null,
  role: { id: 1, name: 'COLABORADOR' },
  department: { id: 1, name: 'TI', code: 'TI' },
  position: { id: 1, name: 'Dev', level: 1 },
  unit: null,
  manager: null,
  profile: null,
  points: { points: 100 },
  subordinates: [],
  enrollments: [],
  certificates: [],
  badgeAwards: [],
  userCompetencies: [],
  _count: { enrollments: 0, certificates: 0, badgeAwards: 0, subordinates: 0, userCompetencies: 0 },
};

describe('UsersService', () => {
  let service: UsersService;

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
        UsersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: getQueueToken('email'), useValue: mockEmailQueue },
      ],
    }).compile();
    service = module.get<UsersService>(UsersService);
  });

  // ─── findAll ──────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('deve retornar lista paginada de utilizadores', async () => {
      mockPrisma.user.findMany.mockResolvedValue([baseUser]);
      mockPrisma.user.count.mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(result.meta.totalPages).toBe(1);
    });

    it('deve filtrar por search', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.user.count.mockResolvedValue(0);

      const result = await service.findAll({ search: 'inexistente' });

      expect(result.data).toHaveLength(0);
      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ OR: expect.any(Array) }) }),
      );
    });
  });

  // ─── findOne ──────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('deve retornar utilizador por id', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(baseUser);

      const result = await service.findOne(1);

      expect(result.fullName).toBe('Placido Costa');
    });

    it('deve lançar NotFoundException se não encontrado', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── create ───────────────────────────────────────────────────────────────

  describe('create', () => {
    const createDto = {
      fullName: 'Novo User',
      email: 'novo@innova.com',
      password: 'pass',
    };

    it('deve criar utilizador com userPoints e notificationLog', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({ ...baseUser, id: 2 });
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.create(createDto);

      expect(result).not.toHaveProperty('password');
      expect(mockPrisma.userPoints.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ userId: 2, points: 0 }) }),
      );
    });

    it('deve lançar ConflictException se email duplicado', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(baseUser);
      await expect(service.create(createDto)).rejects.toThrow(ConflictException);
    });

    it('deve lançar ConflictException se employeeNumber duplicado', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.findFirst.mockResolvedValue(baseUser);
      await expect(service.create({ ...createDto, employeeNumber: 'EMP001' })).rejects.toThrow(
        ConflictException,
      );
    });
  });

  // ─── update ───────────────────────────────────────────────────────────────

  describe('update', () => {
    it('deve actualizar utilizador com sucesso', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(baseUser);
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.user.update.mockResolvedValue({ ...baseUser, fullName: 'Updated' });
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.update(1, { fullName: 'Updated' }, 1);

      expect((result as any).fullName).toBe('Updated');
    });

    it('deve lançar NotFoundException se utilizador não existe', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.update(99, { fullName: 'X' })).rejects.toThrow(NotFoundException);
    });

    it('deve lançar ConflictException se email já em uso', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(baseUser);
      mockPrisma.user.findFirst.mockResolvedValue({ ...baseUser, id: 2 });
      await expect(service.update(1, { email: 'outro@innova.com' })).rejects.toThrow(
        ConflictException,
      );
    });
  });

  // ─── activate / deactivate / suspend ──────────────────────────────────────

  describe('activate', () => {
    it('deve activar utilizador', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...baseUser, active: false });
      mockPrisma.user.update.mockResolvedValue({ ...baseUser, active: true });
      const result = await service.activate(1);
      expect(result).toBeDefined();
    });
  });

  describe('deactivate', () => {
    it('deve desactivar utilizador', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(baseUser);
      mockPrisma.user.update.mockResolvedValue({ ...baseUser, active: false });
      const result = await service.deactivate(1, 'Saída da empresa');
      expect(result).toBeDefined();
    });
  });

  describe('suspend', () => {
    it('deve suspender utilizador', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(baseUser);
      mockPrisma.user.update.mockResolvedValue({ ...baseUser, active: false });
      const result = await service.suspend(1, 'Disciplinar');
      expect(result).toBeDefined();
    });
  });

  // ─── changePassword ───────────────────────────────────────────────────────

  describe('changePassword', () => {
    it('deve lançar BadRequestException se password actual errada', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...baseUser,
        password: '$2b$10$wronghash',
      });
      await expect(
        service.changePassword(1, { currentPassword: 'wrong', newPassword: 'NewPass@123' } as any),
      ).rejects.toThrow();

      // A10-1: password é omitido por omissão (PrismaService) — changePassword
      // precisa do hash actual para comparar, por isso tem de pedir a excepção.
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 1 }, omit: { password: false } }),
      );
    });
  });

  // ─── getTeam ──────────────────────────────────────────────────────────────

  describe('getTeam', () => {
    it('deve retornar equipa do gestor', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      const result = await service.getTeam(1);
      expect(result).toBeDefined();
    });
  });

  // ─── getUserStats ─────────────────────────────────────────────────────────

  describe('getUserStats', () => {
    it('deve retornar estatísticas do utilizador', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(baseUser);
      const result = await service.getUserStats(1);
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se não encontrado', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.getUserStats(99)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getDirectory ─────────────────────────────────────────────────────────

  describe('getDirectory', () => {
    it('deve retornar directório de utilizadores', async () => {
      mockPrisma.user.findMany.mockResolvedValue([baseUser]);
      const result = await service.getDirectory();
      expect(result).toBeDefined();
    });
  });

  // ─── getAdminDashboard ────────────────────────────────────────────────────

  describe('getAdminDashboard', () => {
    it('deve retornar dashboard admin', async () => {
      mockPrisma.user.count.mockResolvedValue(100);
      const result = await service.getAdminDashboard();
      expect(result).toBeDefined();
    });
  });

  // ─── getAuditLogs ─────────────────────────────────────────────────────────

  describe('getAuditLogs', () => {
    it('deve retornar logs de auditoria do utilizador', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([]);
      mockPrisma.auditLog.count.mockResolvedValue(0);
      const result = await service.getAuditLogs(1);
      expect(result).toBeDefined();
    });
  });

  // ─── invite ───────────────────────────────────────────────────────────────

  describe('invite()', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('gera tempPassword com 24 chars hexadecimais (CSPRNG) e passa-o no job de email', async () => {
      userMock.findUnique.mockResolvedValue(null);
      userMock.create.mockResolvedValue({ id: 1, email: 'novo@innova.com', fullName: 'Novo User' });

      await service.invite({
        email: 'novo@innova.com',
        fullName: 'Novo User',
        roleId: 1,
        departmentId: 1,
      });

      const [, jobData] = mockEmailQueue.add.mock.calls[0] as [string, { tempPassword: string }];
      expect(jobData.tempPassword).toHaveLength(24);
      expect(jobData.tempPassword).toMatch(/^[0-9a-f]{24}$/);
    });

    it('enfileira o job "userInvite" com email/fullName correctos e retry configurado', async () => {
      userMock.findUnique.mockResolvedValue(null);
      userMock.create.mockResolvedValue({ id: 2, email: 'x@innova.com', fullName: 'Ana Costa' });

      await service.invite({
        email: 'x@innova.com',
        fullName: 'Ana Costa',
        roleId: 1,
        departmentId: 1,
      });

      expect(mockEmailQueue.add).toHaveBeenCalledWith(
        'userInvite',
        expect.objectContaining({ email: 'x@innova.com', fullName: 'Ana Costa' }),
        expect.objectContaining({
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
        }),
      );
    });

    it('cria o utilizador ANTES de enfileirar o email (a criação não depende do envio)', async () => {
      userMock.findUnique.mockResolvedValue(null);
      const createOrder: string[] = [];
      userMock.create.mockImplementation(() => {
        createOrder.push('create');
        return Promise.resolve({ id: 3, email: 'ordem@innova.com', fullName: 'Ordem' });
      });
      mockEmailQueue.add.mockImplementation(() => {
        createOrder.push('enqueue');
        return Promise.resolve(undefined);
      });

      await service.invite({
        email: 'ordem@innova.com',
        fullName: 'Ordem',
        roleId: 1,
        departmentId: 1,
      });

      expect(createOrder).toEqual(['create', 'enqueue']);
    });

    it('lança ConflictException se email já existe — e não enfileira nada', async () => {
      userMock.findUnique.mockResolvedValue({ id: 99 });
      await expect(
        service.invite({
          email: 'dup@innova.com',
          fullName: 'Dup',
          roleId: 1,
          departmentId: 1,
        }),
      ).rejects.toThrow(ConflictException);
      expect(mockEmailQueue.add).not.toHaveBeenCalled();
    });
  });

  // ─── importUsers (docs/modulo_users.md Ponto 5) ────────────────────────────

  describe('importUsers', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      mockPrisma.department.findFirst.mockResolvedValue(null);
      mockPrisma.position.findFirst.mockResolvedValue(null);
    });

    it('dryRun (por omissão) reporta "create" sem escrever nada na BD', async () => {
      userMock.findUnique.mockResolvedValue(null);

      const result = await service.importUsers(
        { rows: [{ email: 'novo@innova.com', fullName: 'Novo' }] },
        1,
      );

      expect(result.dryRun).toBe(true);
      expect(result.created).toBe(1);
      expect(result.rows[0]).toMatchObject({ outcome: 'create' });
      expect(userMock.create).not.toHaveBeenCalled();
    });

    it('commit (dryRun: false) cria de facto o utilizador em falta', async () => {
      userMock.findUnique.mockResolvedValue(null);
      userMock.findFirst.mockResolvedValue(null);
      userMock.create.mockResolvedValue({ ...baseUser, id: 5, email: 'novo@innova.com' });

      const result = await service.importUsers(
        { rows: [{ email: 'novo@innova.com', fullName: 'Novo' }], dryRun: false },
        1,
      );

      expect(result.created).toBe(1);
      expect(userMock.create).toHaveBeenCalled();
    });

    it('detecta duplicado dentro do próprio ficheiro (2ª ocorrência do mesmo email)', async () => {
      userMock.findUnique.mockResolvedValue(null);

      const result = await service.importUsers(
        {
          rows: [
            { email: 'dup@innova.com', fullName: 'Um' },
            { email: 'dup@innova.com', fullName: 'Outro' },
          ],
        },
        1,
      );

      expect(result.created).toBe(1);
      expect(result.skipped).toBe(1);
      expect(result.rows[1]).toMatchObject({ outcome: 'skip-duplicate' });
    });

    it('utilizador já existente sem updateExisting → skip-existing', async () => {
      userMock.findUnique.mockResolvedValue(baseUser);

      const result = await service.importUsers(
        { rows: [{ email: baseUser.email, fullName: baseUser.fullName }] },
        1,
      );

      expect(result.skipped).toBe(1);
      expect(result.rows[0]).toMatchObject({ outcome: 'skip-existing' });
    });

    it('utilizador já existente com updateExisting → actualiza', async () => {
      userMock.findUnique.mockResolvedValue(baseUser);
      userMock.findFirst.mockResolvedValue(null);
      userMock.update.mockResolvedValue({ ...baseUser, fullName: 'Actualizado' });

      const result = await service.importUsers(
        {
          rows: [{ email: baseUser.email, fullName: 'Actualizado' }],
          updateExisting: true,
          dryRun: false,
        },
        1,
      );

      expect(result.updated).toBe(1);
      expect(userMock.update).toHaveBeenCalled();
    });

    it('departamento indicado que não existe → linha de erro (não pára o resto da importação)', async () => {
      userMock.findUnique.mockResolvedValue(null);
      mockPrisma.department.findFirst.mockResolvedValue(null);

      const result = await service.importUsers(
        {
          rows: [
            { email: 'a@innova.com', fullName: 'Ana', departmentName: 'Inexistente' },
            { email: 'b@innova.com', fullName: 'Bruno' },
          ],
        },
        1,
      );

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatchObject({ line: 1, email: 'a@innova.com' });
      expect(result.created).toBe(1); // a 2ª linha continua a ser processada
    });
  });

  // ─── getModuleAuditLogs (docs/modulo_users.md Ponto 6) ─────────────────────

  describe('getModuleAuditLogs', () => {
    it('devolve lista paginada sem filtrar por utilizador', async () => {
      mockPrisma.userAuditLog.findMany.mockResolvedValue([]);
      mockPrisma.userAuditLog.count.mockResolvedValue(0);

      const result = await service.getModuleAuditLogs({});

      expect(result).toBeDefined();
      expect(mockPrisma.userAuditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });

    it('filtra por action e por userId quando indicados', async () => {
      mockPrisma.userAuditLog.findMany.mockResolvedValue([]);
      mockPrisma.userAuditLog.count.mockResolvedValue(0);

      await service.getModuleAuditLogs({ action: 'LOGIN', userId: 7 });

      expect(mockPrisma.userAuditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { action: 'LOGIN', userId: 7 } }),
      );
    });
  });

  // ─── update() — eventos granulares do Ponto 6 ──────────────────────────────

  describe('update — eventos granulares de auditoria', () => {
    it('regista DEPARTMENT_CHANGED quando o departamento muda', async () => {
      userMock.findUnique.mockResolvedValue(baseUser);
      userMock.findFirst.mockResolvedValue(null);
      userMock.update.mockResolvedValue({
        ...baseUser,
        departmentId: 2,
        department: { id: 2, name: 'RH', code: 'RH' },
      });
      const spy = jest.spyOn(service as any, 'writeAuditLog').mockResolvedValue(undefined);

      await service.update(1, { departmentId: 2 }, 1);

      expect(spy).toHaveBeenCalledWith(
        1,
        1,
        'DEPARTMENT_CHANGED',
        expect.objectContaining({ from: 'TI', to: 'RH' }),
      );
    });

    it('não regista nada quando o campo enviado é igual ao actual', async () => {
      userMock.findUnique.mockResolvedValue(baseUser);
      userMock.findFirst.mockResolvedValue(null);
      userMock.update.mockResolvedValue(baseUser);
      const spy = jest.spyOn(service as any, 'writeAuditLog').mockResolvedValue(undefined);

      await service.update(1, { departmentId: baseUser.department.id }, 1);

      expect(spy).not.toHaveBeenCalledWith(1, 1, 'DEPARTMENT_CHANGED', expect.anything());
    });
  });
});
