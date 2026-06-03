import { Test, TestingModule } from '@nestjs/testing';
import { Evaluation360EventListeners } from './evaluation360.events';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

const userMock = { findUnique: jest.fn() };
const evaluationResponseMock = { findUnique: jest.fn(), update: jest.fn() };

const mockPrisma = {
  user: userMock,
};
const mockPrismaProxy = new Proxy(mockPrisma, {
  get(target, prop) {
    if (prop === 'evaluationResponse') return evaluationResponseMock;
    return (target as any)[prop];
  },
});

const mockNotifications = {
  sendToUser: jest.fn().mockResolvedValue({}),
};

describe('Evaluation360EventListeners', () => {
  let listeners: Evaluation360EventListeners;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        Evaluation360EventListeners,
        { provide: PrismaService, useValue: mockPrismaProxy },
        { provide: NotificationsService, useValue: mockNotifications },
      ],
    }).compile();
    listeners = module.get<Evaluation360EventListeners>(Evaluation360EventListeners);
  });

  describe('onInvitationSend', () => {
    it('deve enviar notificação de convite quando utilizadores existem', async () => {
      userMock.findUnique
        .mockResolvedValueOnce({ id: 1, fullName: 'Avaliador', email: 'av@innova.com' })
        .mockResolvedValueOnce({ id: 2, fullName: 'Avaliado', email: 'ad@innova.com' });

      await listeners.onInvitationSend({
        assignment: { evaluatorId: 1, evaluateeId: 2, cycleId: 10, role: 'PEER' },
      });

      expect(mockNotifications.sendToUser).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ title: expect.stringContaining('360') }),
      );
    });

    it('deve retornar sem erro quando utilizador não encontrado', async () => {
      userMock.findUnique.mockResolvedValue(null);

      await expect(
        listeners.onInvitationSend({
          assignment: { evaluatorId: 99, evaluateeId: 99, cycleId: 10, role: 'PEER' },
        }),
      ).resolves.not.toThrow();
    });

    it('deve lidar com erros silenciosamente', async () => {
      userMock.findUnique.mockRejectedValue(new Error('DB error'));

      await expect(
        listeners.onInvitationSend({
          assignment: { evaluatorId: 1, evaluateeId: 2, cycleId: 10, role: 'PEER' },
        }),
      ).resolves.not.toThrow();
    });
  });

  describe('onReminderSend', () => {
    it('deve enviar lembrete quando avaliado existe', async () => {
      userMock.findUnique.mockResolvedValue({ id: 2, fullName: 'Avaliado' });

      await listeners.onReminderSend({
        assignment: { evaluatorId: 1, evaluateeId: 2, cycleId: 10 },
        channels: ['IN_APP'],
      });

      expect(mockNotifications.sendToUser).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ title: expect.stringContaining('Lembrete') }),
      );
    });

    it('deve lidar com erros silenciosamente', async () => {
      userMock.findUnique.mockRejectedValue(new Error('DB error'));

      await expect(
        listeners.onReminderSend({
          assignment: { evaluatorId: 1, evaluateeId: 2, cycleId: 10 },
          channels: [],
        }),
      ).resolves.not.toThrow();
    });
  });

  describe('onResponseSubmitted', () => {
    it('deve processar resposta com respostas numéricas', async () => {
      evaluationResponseMock.findUnique.mockResolvedValue({
        id: 'resp-1',
        answers: [
          { question: { type: 'RATING' }, numericValue: 4, textValue: null },
          { question: { type: 'RATING' }, numericValue: 3, textValue: null },
          { question: { type: 'RATING' }, numericValue: 5, textValue: null },
        ],
      });
      evaluationResponseMock.update.mockResolvedValue({});

      await listeners.onResponseSubmitted({ responseId: 'resp-1', cycleId: 'cycle-1' });

      expect(evaluationResponseMock.update).toHaveBeenCalled();
    });

    it('deve retornar sem erro se resposta não encontrada', async () => {
      evaluationResponseMock.findUnique.mockResolvedValue(null);

      await expect(
        listeners.onResponseSubmitted({ responseId: 'not-found', cycleId: 'cycle-1' }),
      ).resolves.not.toThrow();
    });

    it('deve processar respostas de texto aberto', async () => {
      evaluationResponseMock.findUnique.mockResolvedValue({
        id: 'resp-2',
        answers: [
          { question: { type: 'OPEN_TEXT' }, numericValue: null, textValue: 'Excelente trabalho' },
          { question: { type: 'OPEN_TEXT' }, numericValue: null, textValue: 'Muito bom' },
        ],
      });
      evaluationResponseMock.update.mockResolvedValue({});

      await listeners.onResponseSubmitted({ responseId: 'resp-2', cycleId: 'cycle-1' });

      expect(evaluationResponseMock.update).toHaveBeenCalled();
    });
  });
});
