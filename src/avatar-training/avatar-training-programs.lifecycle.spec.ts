// Ciclo de vida das formações (docs/Avatar_Training.md §3, §16): criar, rever,
// publicar e arquivar. Publicar exige revisão por outra pessoa e rubrica validada;
// só o dono/responsável ou ADMIN/RH mexe numa formação (404 para os restantes).
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AvatarTrainingProgramsService } from './avatar-training-programs.service';

const ADMIN = { id: 1, role: { name: 'ADMIN' } } as any;
const AUTHOR = { id: 5, role: { name: 'INSTRUCTOR' } } as any;
const REVIEWER = { id: 6, role: { name: 'DIRECTOR' } } as any;
const OTHER = { id: 7, role: { name: 'INSTRUCTOR' } } as any;

const program = (over: Record<string, unknown> = {}) => ({
  id: 2,
  code: 'AVT-0001',
  status: 'DRAFT',
  version: 1,
  createdById: 5,
  responsibleId: 5,
  courseId: null,
  moduleId: null,
  ...over,
});

describe('AvatarTrainingProgramsService — ciclo de vida', () => {
  const prisma: any = {
    avatarTrainingProgram: {
      findUnique: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
    },
    avatarTrainingSession: { count: jest.fn(), updateMany: jest.fn() },
    avatarTrainingAssessment: { findMany: jest.fn() },
    $transaction: jest.fn(async (ops: unknown) =>
      Array.isArray(ops) ? Promise.all(ops) : (ops as any)(prisma),
    ),
  };
  const audit = { log: jest.fn() };
  let svc: AvatarTrainingProgramsService;

  const load = (p: unknown) => prisma.avatarTrainingProgram.findUnique.mockResolvedValue(p);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.avatarTrainingSession.count.mockResolvedValue(1);
    prisma.avatarTrainingAssessment.findMany.mockResolvedValue([]);
    prisma.avatarTrainingProgram.update.mockImplementation(async ({ data }: any) => data);
    prisma.avatarTrainingSession.updateMany.mockResolvedValue({ count: 1 });
    svc = new AvatarTrainingProgramsService(prisma, audit as any, {} as any, {} as any);
  });

  describe('submeter para revisão', () => {
    it('rascunho com sessões passa a IN_REVIEW e audita', async () => {
      load(program());
      const row: any = await svc.submitForReview(AUTHOR, 2);
      expect(row.status).toBe('IN_REVIEW');
      expect(row.reviewSubmittedAt).toBeInstanceOf(Date);
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'SUBMIT' }));
    });

    it('sem sessões → conflito', async () => {
      load(program());
      prisma.avatarTrainingSession.count.mockResolvedValue(0);
      await expect(svc.submitForReview(AUTHOR, 2)).rejects.toBeInstanceOf(ConflictException);
    });

    it.each(['IN_REVIEW', 'PUBLISHED'])('formação %s não pode ser submetida', async status => {
      load(program({ status }));
      await expect(svc.submitForReview(AUTHOR, 2)).rejects.toBeInstanceOf(ConflictException);
    });

    it('quem não é dono nem responsável nem ADMIN/RH recebe 404', async () => {
      load(program());
      await expect(svc.submitForReview(OTHER, 2)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.avatarTrainingProgram.update).not.toHaveBeenCalled();
    });

    it('formação inexistente → 404', async () => {
      load(null);
      await expect(svc.submitForReview(AUTHOR, 2)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('publicar', () => {
    it('outra pessoa publica uma formação em revisão e as sessões passam a PUBLISHED', async () => {
      load(program({ status: 'IN_REVIEW' }));
      const row: any = await svc.publishProgram(REVIEWER, 2);
      expect(row).toMatchObject({ status: 'PUBLISHED', approvedById: 6 });
      expect(prisma.avatarTrainingSession.updateMany).toHaveBeenCalledWith({
        where: { programId: 2, status: { in: ['DRAFT', 'IN_REVIEW'] } },
        data: { status: 'PUBLISHED' },
      });
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'APPROVE' }));
    });

    it('o autor não aprova a sua própria formação', async () => {
      load(program({ status: 'IN_REVIEW' }));
      await expect(svc.publishProgram(AUTHOR, 2)).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.avatarTrainingProgram.update).not.toHaveBeenCalled();
    });

    it('ADMIN/RH pode aprovar mesmo sendo o autor', async () => {
      load(program({ status: 'IN_REVIEW', createdById: 1 }));
      await expect(svc.publishProgram(ADMIN, 2)).resolves.toMatchObject({ status: 'PUBLISHED' });
    });

    it.each(['DRAFT', 'PUBLISHED'])('só publica a partir de IN_REVIEW (era %s)', async status => {
      load(program({ status }));
      await expect(svc.publishProgram(REVIEWER, 2)).rejects.toBeInstanceOf(ConflictException);
    });

    it('rubrica por validar bloqueia a publicação e nomeia a sessão', async () => {
      load(program({ status: 'IN_REVIEW' }));
      prisma.avatarTrainingAssessment.findMany.mockResolvedValue([
        {
          rubricConfig: JSON.stringify([{ name: 'Empatia' }]),
          session: { title: 'Sessão Rubrica' },
        },
      ]);
      await expect(svc.publishProgram(REVIEWER, 2)).rejects.toThrow(/Sessão Rubrica/);
      expect(prisma.avatarTrainingProgram.update).not.toHaveBeenCalled();
    });

    it('rubrica vazia não bloqueia a publicação', async () => {
      load(program({ status: 'IN_REVIEW' }));
      prisma.avatarTrainingAssessment.findMany.mockResolvedValue([
        { rubricConfig: '[]', session: { title: 'Sessão Vazia' } },
      ]);
      await expect(svc.publishProgram(REVIEWER, 2)).resolves.toMatchObject({ status: 'PUBLISHED' });
    });

    it('formação arquivada → conflito', async () => {
      load(program({ status: 'ARCHIVED' }));
      await expect(svc.publishProgram(REVIEWER, 2)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('arquivar', () => {
    it('arquiva a formação e todas as suas sessões', async () => {
      load(program({ status: 'PUBLISHED' }));
      await svc.archiveProgram(AUTHOR, 2);
      expect(prisma.avatarTrainingProgram.update).toHaveBeenCalledWith({
        where: { id: 2 },
        data: { status: 'ARCHIVED' },
      });
      expect(prisma.avatarTrainingSession.updateMany).toHaveBeenCalledWith({
        where: { programId: 2 },
        data: { status: 'ARCHIVED' },
      });
    });

    it('terceiros recebem 404 e nada é arquivado', async () => {
      load(program({ status: 'PUBLISHED' }));
      await expect(svc.archiveProgram(OTHER, 2)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.avatarTrainingSession.updateMany).not.toHaveBeenCalled();
    });

    it('formação já arquivada → conflito', async () => {
      load(program({ status: 'ARCHIVED' }));
      await expect(svc.archiveProgram(ADMIN, 2)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('editar', () => {
    it('editar uma formação em revisão devolve-a a rascunho', async () => {
      load(program({ status: 'IN_REVIEW' }));
      const row: any = await svc.updateProgram(AUTHOR, 2, { title: 'Novo' } as any);
      expect(row).toMatchObject({ status: 'DRAFT', reviewSubmittedAt: null });
    });

    it('editar uma formação publicada incrementa a versão', async () => {
      load(program({ status: 'PUBLISHED' }));
      const row: any = await svc.updateProgram(AUTHOR, 2, { title: 'Novo' } as any);
      expect(row.version).toEqual({ increment: 1 });
    });

    it('o código não pode ser alterado', async () => {
      load(program());
      await expect(svc.updateProgram(AUTHOR, 2, { code: 'OUTRO' } as any)).rejects.toThrow(
        /código/,
      );
    });

    it('terceiros recebem 404', async () => {
      load(program());
      await expect(svc.updateProgram(OTHER, 2, { title: 'x' } as any)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
