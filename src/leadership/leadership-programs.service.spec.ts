import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { LeadershipProgramsService } from './leadership-programs.service';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '../auth/enums/role.enum';

const actor = (role: Role, id = 7) =>
  ({ id, email: `u${id}@innova.com`, role: { name: role } }) as any;

const dto = { code: 'LDR-2026-001', name: 'Programa Teste', level: 'INITIAL' } as any;

const txModels = [
  'leadershipProgramObjective',
  'leadershipProgramTargeting',
  'leadershipSelectionCriterion',
  'leadershipProgramCompetency',
  'leadershipProgramContent',
  'leadershipProgramMethodology',
  'leadershipProgramAdvisor',
];

describe('LeadershipProgramsService', () => {
  let service: LeadershipProgramsService;

  const mockPrisma: any = {
    leadershipProgram: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.defineProperty(mockPrisma, 'read', {
      get: () => mockPrisma,
      configurable: true,
    });

    mockPrisma.leadershipProgram.create.mockImplementation(async ({ data }: any) => ({
      id: 1,
      ...data,
    }));
    mockPrisma.leadershipProgram.update.mockImplementation(async ({ where, data }: any) => ({
      id: where.id,
      ...data,
    }));

    const module: TestingModule = await Test.createTestingModule({
      providers: [LeadershipProgramsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get(LeadershipProgramsService);
  });

  // ─── Step 1: criação por todos os papéis PROGRAM_MANAGERS ──────────────────

  it.each([Role.ADMIN, Role.RH, Role.GESTOR, Role.INSTRUCTOR, Role.DIRECTOR, Role.LIDER])(
    'allows %s to create',
    async role => {
      await expect(service.create(actor(role), dto)).resolves.toMatchObject({ createdById: 7 });
    },
  );

  it('define createdById a partir do actor, não do dto', async () => {
    const res = await service.create(actor(Role.GESTOR, 42), { ...dto, createdById: 999 });
    expect(res.createdById).toBe(42);
  });

  it('colisão de código (P2002) → ConflictException (409)', async () => {
    mockPrisma.leadershipProgram.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: 'test',
      } as any),
    );
    await expect(service.create(actor(Role.RH), dto)).rejects.toBeInstanceOf(ConflictException);
  });

  it('create ignora qualquer status fornecido pelo caller — nasce sempre DRAFT', async () => {
    const res = await service.create(actor(Role.ADMIN, 1), { ...dto, status: 'COMPLETED' } as any);
    expect(res.status).toBe('DRAFT');
    expect(mockPrisma.leadershipProgram.create.mock.calls[0][0].data.status).toBe('DRAFT');
  });

  // ─── Step 1: ownership no update ──────────────────────────────────────────

  it('rejects editing another author program', async () => {
    mockPrisma.leadershipProgram.findUnique.mockResolvedValue({
      id: 9,
      status: 'DRAFT',
      createdById: 1,
      responsibleId: 2,
    });
    await expect(service.update(actor(Role.GESTOR, 7), 9, dto)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('autor pode editar o próprio programa', async () => {
    mockPrisma.leadershipProgram.findUnique.mockResolvedValue({
      id: 9,
      status: 'DRAFT',
      createdById: 7,
      responsibleId: null,
    });
    await expect(
      service.update(actor(Role.GESTOR, 7), 9, { name: 'Novo Nome' } as any),
    ).resolves.toMatchObject({ name: 'Novo Nome' });
  });

  it('responsável pode editar o programa', async () => {
    mockPrisma.leadershipProgram.findUnique.mockResolvedValue({
      id: 9,
      status: 'DRAFT',
      createdById: 1,
      responsibleId: 7,
    });
    await expect(
      service.update(actor(Role.LIDER, 7), 9, { name: 'X' } as any),
    ).resolves.toBeDefined();
  });

  it('linha legada (createdById e responsibleId nulos) → só ADMIN/RH escrevem', async () => {
    mockPrisma.leadershipProgram.findUnique.mockResolvedValue({
      id: 9,
      status: 'DRAFT',
      createdById: null,
      responsibleId: null,
    });
    await expect(
      service.update(actor(Role.LIDER, 7), 9, { name: 'X' } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.update(actor(Role.RH, 3), 9, { name: 'X' } as any)).resolves.toBeDefined();
  });

  it('update de programa inexistente → NotFoundException', async () => {
    mockPrisma.leadershipProgram.findUnique.mockResolvedValue(null);
    await expect(
      service.update(actor(Role.ADMIN, 1), 404, { name: 'X' } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('update NÃO escreve status — a máquina de estados não pode ser contornada por PUT', async () => {
    mockPrisma.leadershipProgram.findUnique.mockResolvedValue({
      id: 9,
      status: 'DRAFT',
      createdById: 7,
      responsibleId: null,
    });
    const res = await service.update(actor(Role.GESTOR, 7), 9, {
      name: 'X',
      status: 'COMPLETED',
    } as any);
    // O serviço nunca lê dto.status, logo `data` não o contém e o estado fica
    // por conta de transition().
    expect(mockPrisma.leadershipProgram.update.mock.calls[0][0].data).not.toHaveProperty('status');
    expect(res).not.toHaveProperty('status');
  });

  // ─── transition: máquina de estados ──────────────────────────────────────

  it('transição válida DRAFT → PLANNED', async () => {
    mockPrisma.leadershipProgram.findUnique.mockResolvedValue({
      id: 5,
      status: 'DRAFT',
      createdById: 7,
      responsibleId: null,
    });
    await expect(
      service.transition(actor(Role.GESTOR, 7), 5, 'PLANNED' as any),
    ).resolves.toMatchObject({ status: 'PLANNED' });
  });

  it('transição ilegal DRAFT → COMPLETED → BadRequestException nomeando ambos os estados', async () => {
    mockPrisma.leadershipProgram.findUnique.mockResolvedValue({
      id: 5,
      status: 'DRAFT',
      createdById: 7,
      responsibleId: null,
    });
    await expect(service.transition(actor(Role.GESTOR, 7), 5, 'COMPLETED' as any)).rejects.toThrow(
      /DRAFT.*COMPLETED/,
    );
    await expect(
      service.transition(actor(Role.GESTOR, 7), 5, 'COMPLETED' as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('estado terminal ARCHIVED não permite transições de saída', async () => {
    mockPrisma.leadershipProgram.findUnique.mockResolvedValue({
      id: 5,
      status: 'ARCHIVED',
      createdById: 7,
      responsibleId: null,
    });
    await expect(
      service.transition(actor(Role.GESTOR, 7), 5, 'DRAFT' as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('ACTIVE legado transita como IN_PROGRESS (→ COMPLETED)', async () => {
    mockPrisma.leadershipProgram.findUnique.mockResolvedValue({
      id: 5,
      status: 'ACTIVE',
      createdById: 7,
      responsibleId: null,
    });
    await expect(
      service.transition(actor(Role.GESTOR, 7), 5, 'COMPLETED' as any),
    ).resolves.toMatchObject({ status: 'COMPLETED' });
  });

  it('transition respeita ownership', async () => {
    mockPrisma.leadershipProgram.findUnique.mockResolvedValue({
      id: 5,
      status: 'DRAFT',
      createdById: 1,
      responsibleId: 2,
    });
    await expect(
      service.transition(actor(Role.GESTOR, 7), 5, 'PLANNED' as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  // ─── replaceConfiguration ───────────────────────────────────────────────

  it('replaceConfiguration faz round-trip de uma config simples (delete-all + recreate)', async () => {
    mockPrisma.leadershipProgram.findUnique.mockResolvedValue({
      id: 5,
      status: 'DRAFT',
      createdById: null,
      responsibleId: null,
    });

    const tx: any = { leadershipProgram: { findUnique: jest.fn() } };
    for (const m of txModels) {
      tx[m] = {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      };
    }
    tx.leadershipProgram.findUnique.mockResolvedValue({
      id: 5,
      objectives: [{ id: 1, programId: 5, title: 'Objectivo 1' }],
      methodologies: [],
    });
    mockPrisma.$transaction.mockImplementation((cb: any) => cb(tx));

    const res = await service.replaceConfiguration(actor(Role.ADMIN, 1), 5, {
      objectives: [{ title: 'Objectivo 1' }],
      methodologies: [{ type: 'WORKSHOP', weight: 100 }],
    } as any);

    expect(tx.leadershipProgramObjective.deleteMany).toHaveBeenCalledWith({
      where: { programId: 5 },
    });
    expect(tx.leadershipProgramObjective.createMany).toHaveBeenCalled();
    const objectiveRows = tx.leadershipProgramObjective.createMany.mock.calls[0][0].data;
    expect(objectiveRows.every((r: any) => r.programId === 5)).toBe(true);
    expect(res).toMatchObject({ id: 5 });
  });

  it('replaceConfiguration respeita ownership', async () => {
    mockPrisma.leadershipProgram.findUnique.mockResolvedValue({
      id: 5,
      status: 'DRAFT',
      createdById: 1,
      responsibleId: 2,
    });
    await expect(
      service.replaceConfiguration(actor(Role.LIDER, 7), 5, {} as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  // ─── remove ─────────────────────────────────────────────────────────────

  it('remove bloqueia quando há participantes', async () => {
    mockPrisma.leadershipProgram.findUnique.mockResolvedValue({
      id: 5,
      status: 'DRAFT',
      createdById: 7,
      responsibleId: null,
      _count: { participants: 2 },
    });
    await expect(service.remove(actor(Role.ADMIN, 1), 5)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('remove elimina quando não há participantes', async () => {
    mockPrisma.leadershipProgram.findUnique.mockResolvedValue({
      id: 5,
      status: 'DRAFT',
      createdById: 7,
      responsibleId: null,
      _count: { participants: 0 },
    });
    mockPrisma.leadershipProgram.delete.mockResolvedValue({});
    await expect(service.remove(actor(Role.GESTOR, 7), 5)).resolves.toHaveProperty('message');
  });
});
