import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { LiveClassesService } from './live-classes.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma: any = {
  liveClass: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
    groupBy: jest.fn().mockResolvedValue([]),
    aggregate: jest.fn().mockResolvedValue({ _sum: { duration: 0 } }),
  },
  liveClassSession: {
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue(null),
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  liveAttendance: {
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    aggregate: jest.fn().mockResolvedValue({ _avg: { attendancePercent: 0 }, _count: { _all: 0 } }),
  },
  trainingInstructorProfile: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  liveMessage: { create: jest.fn().mockResolvedValue({}) },
  postClassEvaluation: { create: jest.fn() },
  postClassResponse: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
};

const baseLiveClass = {
  id: 1,
  title: 'Aula ao Vivo TypeScript',
  courseId: 1,
  scheduledAt: new Date('2026-07-15T10:00:00'),
  duration: 90,
  status: 'AGENDADA',
  type: 'AULA',
  meetUrl: 'https://meet.google.com/abc',
  course: { id: 1, title: 'TypeScript Avançado' },
  attendances: [],
  messages: [],
  postEvaluation: null,
  _count: { attendances: 5, messages: 20 },
};

describe('LiveClassesService (additional)', () => {
  let service: LiveClassesService;

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.defineProperty(mockPrisma, 'read', {
      get() {
        return mockPrisma;
      },
      configurable: true,
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [LiveClassesService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<LiveClassesService>(LiveClassesService);
  });

  // ─── findAll ──────────────────────────────────────────────────

  describe('findAll', () => {
    it('deve retornar aulas paginadas', async () => {
      mockPrisma.liveClass.findMany.mockResolvedValue([baseLiveClass]);
      mockPrisma.liveClass.count.mockResolvedValue(1);
      const result = await service.findAll({ page: 1, limit: 10 });
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });

    it('deve filtrar por courseId', async () => {
      mockPrisma.liveClass.findMany.mockResolvedValue([]);
      mockPrisma.liveClass.count.mockResolvedValue(0);
      await service.findAll({ courseId: 1 });
      expect(mockPrisma.liveClass.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { courseId: 1 } }),
      );
    });
  });

  // ─── findOne ──────────────────────────────────────────────────

  describe('findOne', () => {
    it('deve retornar aula ao vivo por id', async () => {
      mockPrisma.liveClass.findUnique.mockResolvedValue(baseLiveClass);
      const result = await service.findOne(1);
      expect(result).toBeDefined();
      expect((result as any).title).toBe('Aula ao Vivo TypeScript');
    });

    it('deve lançar NotFoundException se aula não existe', async () => {
      mockPrisma.liveClass.findUnique.mockResolvedValue(null);
      await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── create ───────────────────────────────────────────────────

  describe('create', () => {
    it('deve criar aula ao vivo', async () => {
      mockPrisma.liveClass.create.mockResolvedValue(baseLiveClass);
      const result = await service.create({
        topic: 'Aula TypeScript',
        courseId: 1,
        scheduledAt: '2026-07-15T10:00:00',
        duration: 90,
      } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── update ───────────────────────────────────────────────────

  describe('update', () => {
    it('deve actualizar aula ao vivo', async () => {
      mockPrisma.liveClass.findUnique.mockResolvedValue(baseLiveClass);
      mockPrisma.liveClass.update.mockResolvedValue({ ...baseLiveClass, title: 'Actualizada' });
      const result = await service.update(1, { title: 'Actualizada' } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── remove ───────────────────────────────────────────────────

  describe('remove', () => {
    it('deve remover aula ao vivo', async () => {
      mockPrisma.liveClass.findUnique.mockResolvedValue(baseLiveClass);
      mockPrisma.liveClass.delete.mockResolvedValue(baseLiveClass);
      const result = await service.remove(1);
      expect(result).toHaveProperty('message');
    });
  });

  // ─── joinClass ────────────────────────────────────────────────

  describe('joinClass', () => {
    it('deve criar nova presença quando utilizador entra', async () => {
      mockPrisma.liveAttendance.findUnique.mockResolvedValue(null);
      mockPrisma.liveAttendance.create.mockResolvedValue({ id: 1, liveClassId: 1, userId: 2 });
      const result = await service.joinClass(1, 2);
      expect(result).toBeDefined();
    });

    it('deve actualizar presença existente quando utilizador re-entra', async () => {
      mockPrisma.liveAttendance.findUnique.mockResolvedValue({ id: 1, liveClassId: 1, userId: 2 });
      mockPrisma.liveAttendance.update.mockResolvedValue({ id: 1, joinedAt: new Date() });
      const result = await service.joinClass(1, 2);
      expect(result).toBeDefined();
    });
  });

  // ─── leaveClass ───────────────────────────────────────────────

  describe('leaveClass', () => {
    it('deve registar saída da aula', async () => {
      mockPrisma.liveAttendance.findUnique.mockResolvedValue({ id: 1 });
      mockPrisma.liveAttendance.update.mockResolvedValue({ id: 1, leftAt: new Date() });
      const result = await service.leaveClass(1, 2);
      expect(result).toBeDefined();
    });
  });

  // ─── sendMessage ──────────────────────────────────────────────

  describe('sendMessage', () => {
    it('deve enviar mensagem de chat na aula', async () => {
      mockPrisma.liveChatMessage = {
        create: jest.fn().mockResolvedValue({
          id: 1,
          liveClassId: 1,
          message: 'Olá!',
          userId: 2,
          user: { id: 2, fullName: 'Utilizador' },
        }),
      };
      // Real signature: sendMessage(liveClassId, userId, dto) — correct order
      const result = await service.sendMessage(1, 2, { message: 'Olá!' } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── createPostEvaluation (replaces addPostEvaluation) ────────

  describe('createPostEvaluation', () => {
    it('deve criar avaliação pós-aula', async () => {
      mockPrisma.postClassEvaluation.findUnique = jest.fn().mockResolvedValue(null);
      mockPrisma.postClassEvaluation.create.mockResolvedValue({ id: 1, liveClassId: 1 });
      // Real method: createPostEvaluation(liveClassId) — 1 arg
      const result = await service.createPostEvaluation(1);
      expect(result).toBeDefined();
    });
  });

  // ─── submitPostResponse (replaces respondPostEvaluation) ──────

  describe('submitPostResponse', () => {
    it('deve submeter respostas à avaliação pós-aula', async () => {
      mockPrisma.postClassEvaluation.findUnique = jest.fn().mockResolvedValue({ id: 1 });
      mockPrisma.postClassResponse = {
        upsert: jest.fn().mockResolvedValue({ id: 1, rating: 4 }),
        aggregate: jest.fn().mockResolvedValue({ _avg: { rating: 4 } }),
      };
      mockPrisma.postClassEvaluation.update = jest.fn().mockResolvedValue({ id: 1 });
      // Real method: submitPostResponse(userId, dto)
      const result = await service.submitPostResponse(2, {
        evaluationId: 1,
        rating: 4,
        feedback: 'Boa aula',
      } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── start/postpone/cancel/duplicate (secção 2 — Ações) ────────

  describe('start', () => {
    it('marca a aula como EM_CURSO', async () => {
      mockPrisma.liveClass.findUnique.mockResolvedValue(baseLiveClass);
      mockPrisma.liveClass.update.mockResolvedValue({ ...baseLiveClass, status: 'EM_CURSO' });
      const result = await service.start(1);
      expect(mockPrisma.liveClass.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'EM_CURSO' } }),
      );
      expect(result).toBeDefined();
    });

    it('rejeita iniciar uma aula já cancelada', async () => {
      mockPrisma.liveClass.findUnique.mockResolvedValue({ ...baseLiveClass, status: 'CANCELADA' });
      await expect(service.start(1)).rejects.toThrow(ConflictException);
    });
  });

  describe('postpone', () => {
    it('regista postponedFromAt e passa a ADIADA', async () => {
      mockPrisma.liveClass.findUnique.mockResolvedValue(baseLiveClass);
      mockPrisma.liveClass.update.mockResolvedValue({ ...baseLiveClass, status: 'ADIADA' });
      await service.postpone(1, {
        scheduledAt: '2026-08-01T10:00:00',
        reason: 'Formador indisponível',
      });
      expect(mockPrisma.liveClass.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'ADIADA',
            postponedFromAt: baseLiveClass.scheduledAt,
            postponeReason: 'Formador indisponível',
          }),
        }),
      );
    });

    it('rejeita data inválida', async () => {
      mockPrisma.liveClass.findUnique.mockResolvedValue(baseLiveClass);
      await expect(service.postpone(1, { scheduledAt: 'not-a-date' })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('cancel', () => {
    it('marca a aula como CANCELADA com motivo', async () => {
      mockPrisma.liveClass.findUnique.mockResolvedValue(baseLiveClass);
      mockPrisma.liveClass.update.mockResolvedValue({ ...baseLiveClass, status: 'CANCELADA' });
      await service.cancel(1, { reason: 'Sem inscrições suficientes' });
      expect(mockPrisma.liveClass.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'CANCELADA',
            cancellationReason: 'Sem inscrições suficientes',
          }),
        }),
      );
    });
  });

  describe('duplicate', () => {
    it('cria uma cópia com estado AGENDADA e novo código', async () => {
      mockPrisma.liveClass.findUnique.mockResolvedValue(baseLiveClass);
      mockPrisma.liveClass.create.mockResolvedValue({ ...baseLiveClass, id: 2, topic: 'Cópia' });
      const result = await service.duplicate(1);
      expect(mockPrisma.liveClass.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'AGENDADA' }) }),
      );
      expect(result).toBeDefined();
    });
  });

  // ─── Sessões (secção 5) ──────────────────────────────────────

  describe('createSession', () => {
    it('atribui seq incremental à primeira sessão', async () => {
      mockPrisma.liveClass.findUnique.mockResolvedValue(baseLiveClass);
      mockPrisma.liveClassSession.findFirst.mockResolvedValue(null);
      mockPrisma.liveClassSession.create.mockResolvedValue({ id: 1, seq: 1 });
      await service.createSession(1, { sessionDate: '2026-08-01T10:00:00', durationMinutes: 60 });
      expect(mockPrisma.liveClassSession.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ seq: 1, liveClassId: 1 }) }),
      );
    });

    it('incrementa seq a partir da última sessão existente', async () => {
      mockPrisma.liveClass.findUnique.mockResolvedValue(baseLiveClass);
      mockPrisma.liveClassSession.findFirst.mockResolvedValue({ seq: 3 });
      mockPrisma.liveClassSession.create.mockResolvedValue({ id: 4, seq: 4 });
      await service.createSession(1, { sessionDate: '2026-08-08T10:00:00', durationMinutes: 60 });
      expect(mockPrisma.liveClassSession.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ seq: 4 }) }),
      );
    });
  });

  describe('listAllSessions', () => {
    it('devolve sessões paginadas de todas as aulas', async () => {
      mockPrisma.liveClassSession.findMany.mockResolvedValue([{ id: 1 }]);
      mockPrisma.liveClassSession.count = jest.fn().mockResolvedValue(1);
      const result = await service.listAllSessions({ page: 1, limit: 10 });
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });
  });

  describe('deleteSession', () => {
    it('rejeita sessão de outra aula', async () => {
      mockPrisma.liveClassSession.findUnique.mockResolvedValue({ id: 5, liveClassId: 999 });
      await expect(service.deleteSession(1, 5)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── Dashboard / Calendário (secções 1 e 4) ───────────────────

  describe('getDashboard', () => {
    it('devolve cards agregados', async () => {
      mockPrisma.liveClass.count.mockResolvedValue(2);
      const result = await service.getDashboard();
      expect(result.cards).toBeDefined();
      expect(result.byModality).toEqual([]);
    });
  });

  describe('getCalendar', () => {
    it('combina aulas e sessões num intervalo', async () => {
      mockPrisma.liveClass.findMany.mockResolvedValue([baseLiveClass]);
      mockPrisma.liveClassSession.findMany.mockResolvedValue([]);
      const result = await service.getCalendar('2026-07-01', '2026-07-31');
      expect(result).toHaveLength(1);
      expect(result[0].liveClassId).toBe(1);
    });
  });
});
