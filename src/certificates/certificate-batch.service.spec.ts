import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BadRequestException } from '@nestjs/common';
import { CertificateBatchService } from './certificate-batch.service';
import { BatchIssueDto } from './certificates-lifecycle.dto';

const dtoOf = (over: Record<string, unknown> = {}) =>
  plainToInstance(BatchIssueDto, {
    activityKind: 'COURSE',
    activityId: 10,
    userIds: [1, 2],
    ...over,
  });

describe('BatchIssueDto', () => {
  it('aceita 1 a 500 titulares sem repetidos', async () => {
    expect(await validate(dtoOf())).toHaveLength(0);
    expect(
      await validate(dtoOf({ userIds: Array.from({ length: 500 }, (_, i) => i + 1) })),
    ).toHaveLength(0);
  });
  it('rejeita lista vazia, 501 e repetidos', async () => {
    expect((await validate(dtoOf({ userIds: [] }))).length).toBeGreaterThan(0);
    expect(
      (await validate(dtoOf({ userIds: Array.from({ length: 501 }, (_, i) => i + 1) }))).length,
    ).toBeGreaterThan(0);
    expect((await validate(dtoOf({ userIds: [1, 1] }))).length).toBeGreaterThan(0);
  });
});

describe('CertificateBatchService', () => {
  const prisma = {
    enrollment: { findMany: jest.fn() },
    eventParticipant: { findMany: jest.fn() },
  };
  const issuance = { issue: jest.fn() };
  const audit = { log: jest.fn() };
  const svc = new CertificateBatchService(prisma as never, issuance as never, audit as never);

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.enrollment.findMany.mockResolvedValue([]);
    prisma.eventParticipant.findMany.mockResolvedValue([]);
  });

  it('sem userIds nem allEligible → 400', async () => {
    await expect(svc.issueBatch(dtoOf({ userIds: undefined }), 9)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('userIds e allEligible em simultâneo → 400', async () => {
    await expect(svc.issueBatch(dtoOf({ allEligible: true }), 9)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('allEligible em TRAINING → 400', async () => {
    await expect(
      svc.issueBatch(dtoOf({ activityKind: 'TRAINING', userIds: undefined, allEligible: true }), 9),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allEligible com mais de 500 concluintes → 400 e nada é emitido', async () => {
    prisma.enrollment.findMany.mockResolvedValue(
      Array.from({ length: 501 }, (_, i) => ({ userId: i + 1 })),
    );
    await expect(
      svc.issueBatch(dtoOf({ userIds: undefined, allEligible: true }), 9),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(issuance.issue).not.toHaveBeenCalled();
  });

  it('allEligible em COURSE consulta matrículas concluídas', async () => {
    prisma.enrollment.findMany.mockResolvedValue([{ userId: 4 }]);
    issuance.issue.mockResolvedValue({ outcome: 'ISSUED', certificate: { id: 1 } });
    await svc.issueBatch(dtoOf({ userIds: undefined, allEligible: true }), 9);
    expect(prisma.enrollment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { courseId: 10, status: 'COMPLETED' } }),
    );
    expect(issuance.issue).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 4,
        activityKind: 'COURSE',
        activityId: 10,
        actorId: 9,
        trigger: 'MANUAL',
      }),
    );
  });

  it('allEligible em EVENT consulta participantes presentes', async () => {
    prisma.eventParticipant.findMany.mockResolvedValue([{ userId: 7 }]);
    issuance.issue.mockResolvedValue({ outcome: 'ISSUED', certificate: { id: 1 } });
    await svc.issueBatch(
      dtoOf({ activityKind: 'EVENT', userIds: undefined, allEligible: true }),
      9,
    );
    expect(prisma.eventParticipant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { eventId: 10, status: 'PRESENT' } }),
    );
  });

  it('resultado misto: cada titular é tratado à parte e os válidos ficam emitidos', async () => {
    issuance.issue
      .mockResolvedValueOnce({ outcome: 'ISSUED', certificate: { id: 1 } })
      .mockResolvedValueOnce({ outcome: 'EXISTS', certificate: { id: 2 } })
      .mockResolvedValueOnce({ outcome: 'NOT_ELIGIBLE', missing: ['MIN_SCORE_NOT_MET'] })
      .mockRejectedValueOnce(new Error('titular inexistente'))
      .mockResolvedValueOnce({ outcome: 'ISSUED', certificate: { id: 5 } });
    const r = await svc.issueBatch(dtoOf({ userIds: [1, 2, 3, 4, 5] }), 9);
    expect(r).toMatchObject({ total: 5, issued: 2, existing: 1, failed: 2 });
    expect(r.results[2]).toMatchObject({
      userId: 3,
      outcome: 'NOT_ELIGIBLE',
      missing: ['Nota mínima não atingida'],
    });
    expect(r.results[3]).toMatchObject({
      userId: 4,
      outcome: 'ERROR',
      error: 'titular inexistente',
    });
    expect(issuance.issue).toHaveBeenCalledTimes(5);
  });

  it('audita uma só vez, só com contagens', async () => {
    issuance.issue.mockResolvedValue({ outcome: 'ISSUED', certificate: { id: 1 } });
    await svc.issueBatch(dtoOf(), 9);
    expect(audit.log).toHaveBeenCalledTimes(1);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CERTIFICATE_BATCH_ISSUED',
        userId: 9,
        metadata: expect.objectContaining({ total: 2, issued: 2 }),
      }),
    );
    expect(JSON.stringify(audit.log.mock.calls[0][0].metadata)).not.toContain('userIds');
  });
});
