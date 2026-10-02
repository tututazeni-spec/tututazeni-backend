import {
  AvatarTrainingRetentionService,
  REDACTED_CONTENT,
} from './avatar-training-retention.service';

describe('AvatarTrainingRetentionService', () => {
  const prisma = { avatarTrainingInteraction: { updateMany: jest.fn() } };
  const audit = { log: jest.fn() };
  let svc: AvatarTrainingRetentionService;
  const saved = process.env.AVATAR_TRAINING_RETENTION_DAYS;
  const NOW = new Date('2026-10-02T12:00:00Z');

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.AVATAR_TRAINING_RETENTION_DAYS;
    prisma.avatarTrainingInteraction.updateMany.mockResolvedValue({ count: 3 });
    svc = new AvatarTrainingRetentionService(prisma as any, audit as any);
  });
  afterAll(() => {
    if (saved === undefined) delete process.env.AVATAR_TRAINING_RETENTION_DAYS;
    else process.env.AVATAR_TRAINING_RETENTION_DAYS = saved;
  });

  it('por omissão retém 365 dias', () => {
    expect(svc.retentionDays()).toBe(365);
  });

  it('valor inválido ou negativo volta ao padrão', () => {
    process.env.AVATAR_TRAINING_RETENTION_DAYS = 'abc';
    expect(svc.retentionDays()).toBe(365);
    process.env.AVATAR_TRAINING_RETENTION_DAYS = '-5';
    expect(svc.retentionDays()).toBe(365);
  });

  it('0 desactiva a retenção e não toca na BD', async () => {
    process.env.AVATAR_TRAINING_RETENTION_DAYS = '0';
    const r = await svc.purgeExpiredTranscripts(1, NOW);
    expect(r).toEqual({ enabled: false, retentionDays: 0, redacted: 0 });
    expect(prisma.avatarTrainingInteraction.updateMany).not.toHaveBeenCalled();
  });

  it('anonimiza só texto livre, de tentativas fechadas, antes do corte', async () => {
    process.env.AVATAR_TRAINING_RETENTION_DAYS = '30';
    const r = await svc.purgeExpiredTranscripts(7, NOW);
    const arg = prisma.avatarTrainingInteraction.updateMany.mock.calls[0][0];

    expect(arg.where.interactionType.in).toEqual(['USER_MESSAGE', 'HELP_REQUEST', 'AVATAR_MESSAGE']);
    expect(arg.where.interactionType.in).not.toContain('USER_ANSWER');
    expect(arg.where.attempt.status.notIn).toEqual(['IN_PROGRESS', 'PAUSED']);
    expect(arg.where.content).toEqual({ not: REDACTED_CONTENT }); // idempotente
    expect(arg.where.createdAt.lt).toEqual(new Date('2026-09-02T12:00:00Z'));
    expect(arg.data).toEqual({ content: REDACTED_CONTENT, metadata: null });
    expect(r.redacted).toBe(3);
  });

  it('audita quando há utilizador e algo foi removido', async () => {
    await svc.purgeExpiredTranscripts(7, NOW);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 7, entity: 'AvatarTrainingInteraction' }),
    );
  });

  it('não audita sem utilizador (cron) nem quando nada foi removido', async () => {
    await svc.purgeExpiredTranscripts(undefined, NOW);
    prisma.avatarTrainingInteraction.updateMany.mockResolvedValue({ count: 0 });
    await svc.purgeExpiredTranscripts(7, NOW);
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('scheduledPurge engole falhas (nunca derruba o processo)', async () => {
    prisma.avatarTrainingInteraction.updateMany.mockRejectedValue(new Error('db'));
    await expect(svc.scheduledPurge()).resolves.toBeUndefined();
  });
});
