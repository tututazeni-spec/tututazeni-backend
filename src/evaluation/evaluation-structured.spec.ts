import { BadRequestException, ConflictException, Logger, NotFoundException } from '@nestjs/common';
import {
  EvaluationStructuredService,
  normalizeRecommendationProgress,
  validateStructuredItems,
} from './evaluation-structured';
import type { ImprovementItemDto, RecommendationItemDto, StrengthItemDto } from './evaluation.dto';

jest.mock('../common/helpers/audit-chain', () => ({
  writeChainedAuditLog: jest.fn().mockResolvedValue(undefined),
}));

const strength = (over: Partial<StrengthItemDto> = {}): StrengthItemDto => ({
  competency: 'Comunicação',
  score: 4,
  description: 'Explica com clareza',
  ...over,
});
const area = (over: Partial<ImprovementItemDto> = {}): ImprovementItemDto => ({
  competency: 'Prazos',
  score: 2,
  description: 'Falha prazos',
  priority: 'ALTA',
  ...over,
});
const rec = (over: Partial<RecommendationItemDto> = {}): RecommendationItemDto => ({
  action: 'Curso de gestão do tempo',
  objective: 'Cumprir prazos',
  actionType: 'FORMACAO',
  successIndicator: '90% das entregas a tempo',
  priority: 4,
  ...over,
});

const messagesOf = (fn: () => void): string[] => {
  try {
    fn();
  } catch (e) {
    return (e as BadRequestException).getResponse
      ? ((e as BadRequestException).getResponse() as { message: string[] }).message
      : [];
  }
  return [];
};

describe('validateStructuredItems', () => {
  it('aceita registos válidos e vazios', () => {
    expect(() => validateStructuredItems({})).not.toThrow();
    expect(() =>
      validateStructuredItems({
        strengthItems: [strength()],
        improvementItems: [area({ ref: 'a1' })],
        recommendationItems: [rec({ improvementRef: 'a1' })],
      }),
    ).not.toThrow();
  });

  it('impede competências duplicadas na mesma secção (ignora acentos/maiúsculas)', () => {
    const m = messagesOf(() =>
      validateStructuredItems({
        strengthItems: [strength(), strength({ competency: ' COMUNICAÇÃO ' })],
        improvementItems: [area({ competencyId: 7 }), area({ competencyId: 7, competency: 'X' })],
      }),
    );
    expect(m.join()).toMatch(/Ponto forte duplicado/);
    expect(m.join()).toMatch(/Área de melhoria duplicada/);
  });

  it('a mesma competência pode ser ponto forte numa secção e melhoria noutra', () => {
    expect(() =>
      validateStructuredItems({
        strengthItems: [strength({ competency: 'Prazos' })],
        improvementItems: [area()],
      }),
    ).not.toThrow();
  });

  it('exige evidência em notas altas quando o ciclo o impõe', () => {
    expect(() =>
      validateStructuredItems({ strengthItems: [strength({ score: 5 })] }),
    ).not.toThrow();
    expect(() =>
      validateStructuredItems(
        { strengthItems: [strength({ score: 5 })] },
        { requireEvidence: true },
      ),
    ).toThrow(BadRequestException);
    expect(() =>
      validateStructuredItems(
        { strengthItems: [strength({ score: 5, evidence: 'Projeto X' })] },
        { requireEvidence: true },
      ),
    ).not.toThrow();
  });

  it('área de melhoria com nota 4–5 exige justificação', () => {
    expect(
      messagesOf(() => validateStructuredItems({ improvementItems: [area({ score: 4 })] })).join(),
    ).toMatch(/justifique/);
    expect(() =>
      validateStructuredItems({ improvementItems: [area({ score: 4, comment: 'Meta futura' })] }),
    ).not.toThrow();
  });

  it('recomendação tem de apontar para uma área existente e ter prazo futuro', () => {
    const today = new Date('2026-10-31T10:00:00Z');
    const m = messagesOf(() =>
      validateStructuredItems(
        {
          improvementItems: [area({ ref: 'a1' })],
          recommendationItems: [
            rec({ improvementRef: 'zzz' }),
            rec({ dueDate: '2026-01-01' }),
            rec({ dueDate: 'não-é-data' }),
          ],
        },
        { today },
      ),
    );
    expect(m.join('|')).toMatch(/não existe neste registo/);
    expect(m.join('|')).toMatch(/passado/);
    expect(m.join('|')).toMatch(/inválido/);
  });
});

describe('normalizeRecommendationProgress', () => {
  it('concluída → 100%, pendente → 0%', () => {
    expect(normalizeRecommendationProgress('CONCLUIDA', 10)).toEqual({
      status: 'CONCLUIDA',
      progressPct: 100,
    });
    expect(normalizeRecommendationProgress('PENDENTE', 50).progressPct).toBe(0);
  });
  it('em curso mantém % e não pode chegar a 100', () => {
    expect(normalizeRecommendationProgress('EM_CURSO', 40).progressPct).toBe(40);
    expect(() => normalizeRecommendationProgress('EM_CURSO', 100)).toThrow(BadRequestException);
  });
});

describe('EvaluationStructuredService', () => {
  const prisma = {
    user: { findMany: jest.fn(), findUnique: jest.fn() },
    performanceEvaluation: { findUnique: jest.fn() },
    evaluationStrength: { findMany: jest.fn().mockResolvedValue([]) },
    evaluationImprovementArea: { findMany: jest.fn().mockResolvedValue([]) },
    evaluationRecommendation: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
  let svc: EvaluationStructuredService;
  const colab = { id: 5, role: { name: 'COLABORADOR' } };
  const rh = { id: 99, role: { name: 'RH' } };

  beforeEach(() => {
    jest.clearAllMocks();
    svc = new EvaluationStructuredService(prisma as never, new Logger('t'));
  });

  describe('getItems (permissões)', () => {
    it('avaliador vê sempre; avaliado só depois de submetida; outro colaborador não vê', async () => {
      prisma.performanceEvaluation.findUnique.mockResolvedValue({
        id: 1,
        evaluatorId: 10,
        evaluatedId: 5,
        isDraft: true,
      });
      await expect(svc.getItems(1, { id: 10 })).resolves.toBeDefined();
      await expect(svc.getItems(1, colab)).rejects.toThrow(NotFoundException);
      await expect(svc.getItems(1, { id: 77, role: { name: 'COLABORADOR' } })).rejects.toThrow(
        NotFoundException,
      );
      await expect(svc.getItems(1, rh)).resolves.toBeDefined();

      prisma.performanceEvaluation.findUnique.mockResolvedValue({
        id: 1,
        evaluatorId: 10,
        evaluatedId: 5,
        isDraft: false,
      });
      await expect(svc.getItems(1, colab)).resolves.toBeDefined();
    });

    it('avaliação inexistente → 404', async () => {
      prisma.performanceEvaluation.findUnique.mockResolvedValue(null);
      await expect(svc.getItems(1, rh)).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateRecommendation', () => {
    const base = {
      id: 3,
      status: 'PENDENTE',
      progressPct: 0,
      responsibleId: 20,
      completedAt: null,
      evaluation: { evaluatorId: 10, isDraft: false },
    };

    it('utilizador sem relação com a ação → 404', async () => {
      prisma.evaluationRecommendation.findUnique.mockResolvedValue(base);
      await expect(svc.updateRecommendation(3, { status: 'EM_CURSO' }, colab)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.evaluationRecommendation.update).not.toHaveBeenCalled();
    });

    it('rascunho é invisível mesmo para o responsável', async () => {
      prisma.evaluationRecommendation.findUnique.mockResolvedValue({
        ...base,
        evaluation: { evaluatorId: 10, isDraft: true },
      });
      await expect(svc.updateRecommendation(3, {}, { id: 20 })).rejects.toThrow(NotFoundException);
    });

    it('responsável conclui: 100% e completedAt', async () => {
      prisma.evaluationRecommendation.findUnique.mockResolvedValue(base);
      prisma.evaluationRecommendation.update.mockImplementation(async ({ data }) => data);
      const r = await svc.updateRecommendation(3, { status: 'CONCLUIDA' }, { id: 20 });
      expect(r.progressPct).toBe(100);
      expect(r.completedAt).toBeInstanceOf(Date);
    });

    it('ação concluída só é reaberta por RH/Admin', async () => {
      prisma.evaluationRecommendation.findUnique.mockResolvedValue({
        ...base,
        status: 'CONCLUIDA',
        progressPct: 100,
      });
      await expect(svc.updateRecommendation(3, { status: 'EM_CURSO' }, { id: 20 })).rejects.toThrow(
        ConflictException,
      );
      prisma.evaluationRecommendation.update.mockImplementation(async ({ data }) => data);
      const r = await svc.updateRecommendation(3, { status: 'EM_CURSO', progressPct: 50 }, rh);
      expect(r.status).toBe('EM_CURSO');
      expect(r.completedAt).toBeNull();
    });

    it('rejeita responsável inexistente', async () => {
      prisma.evaluationRecommendation.findUnique.mockResolvedValue(base);
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(svc.updateRecommendation(3, { responsibleId: 999 }, rh)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  it('assertResponsiblesExist rejeita ids inexistentes', async () => {
    prisma.user.findMany.mockResolvedValue([{ id: 1 }]);
    await expect(
      svc.assertResponsiblesExist([rec({ responsibleId: 1 }), rec({ responsibleId: 2 })]),
    ).rejects.toThrow(/2/);
    await expect(svc.assertResponsiblesExist([rec()])).resolves.toBeUndefined();
  });
});
