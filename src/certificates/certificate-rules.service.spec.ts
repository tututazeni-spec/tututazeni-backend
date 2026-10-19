import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CertificateRulesService } from './certificate-rules.service';
import { UpsertCertificateRuleDto } from './certificates-admin.dto';

const dtoOf = (over: Record<string, unknown> = {}) =>
  plainToInstance(UpsertCertificateRuleDto, {
    activityKind: 'COURSE',
    activityId: 10,
    mode: 'AUTOMATIC',
    criteria: { requireFullCompletion: true, minScore: 70 },
    ...over,
  });

describe('UpsertCertificateRuleDto', () => {
  it('aceita um caso válido', async () => {
    expect(await validate(dtoOf())).toHaveLength(0);
  });

  it('rejeita minScore 150', async () => {
    const errors = await validate(dtoOf({ criteria: { minScore: 150 } }));
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejeita minScore negativo e campos desconhecidos nos critérios', async () => {
    expect((await validate(dtoOf({ criteria: { minScore: -1 } }))).length).toBeGreaterThan(0);
    expect(
      (
        await validate(dtoOf({ criteria: { foo: true } }), {
          whitelist: true,
          forbidNonWhitelisted: true,
        })
      ).length,
    ).toBeGreaterThan(0);
  });

  it('rejeita validityDays fora de 1–3650', async () => {
    expect((await validate(dtoOf({ validityDays: 0 }))).length).toBeGreaterThan(0);
    expect((await validate(dtoOf({ validityDays: 4000 }))).length).toBeGreaterThan(0);
  });
});

describe('CertificateRulesService', () => {
  const prisma = {
    certificateRule: { findMany: jest.fn(), findUnique: jest.fn(), upsert: jest.fn() },
    course: { findUnique: jest.fn(), findMany: jest.fn() },
    event: { findUnique: jest.fn(), findMany: jest.fn() },
  };
  const audit = { log: jest.fn() };
  const svc = new CertificateRulesService(prisma as never, audit as never);

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.certificateRule.findUnique.mockResolvedValue(null);
    prisma.course.findUnique.mockResolvedValue({ id: 10 });
    prisma.certificateRule.upsert.mockImplementation(async ({ create }) => ({
      id: 1,
      updatedAt: new Date(),
      ...create,
    }));
  });

  it('critérios vazios → BadRequest e nada gravado', async () => {
    await expect(svc.upsertRule(dtoOf({ criteria: {} }), 1)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.certificateRule.upsert).not.toHaveBeenCalled();
  });

  it('critérios só com valores falsos → BadRequest (nenhum critério activo)', async () => {
    await expect(
      svc.upsertRule(dtoOf({ criteria: { requireFullCompletion: false } }), 1),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('TRAINING ainda sem suporte de factos → BadRequest', async () => {
    await expect(svc.upsertRule(dtoOf({ activityKind: 'TRAINING' }), 1)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('curso inexistente → NotFound', async () => {
    prisma.course.findUnique.mockResolvedValue(null);
    await expect(svc.upsertRule(dtoOf(), 1)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('caso válido faz upsert por chave composta e audita sem "before" na criação', async () => {
    const rule = await svc.upsertRule(dtoOf({ validityDays: 365 }), 7);
    expect(prisma.certificateRule.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { activityKind_activityId: { activityKind: 'COURSE', activityId: 10 } },
      }),
    );
    expect(rule.criteria).toEqual({ requireFullCompletion: true, minScore: 70 });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CERTIFICATE_RULE_UPSERTED',
        entity: 'CertificateRule',
        userId: 7,
        strict: true,
        before: undefined,
      }),
    );
  });

  it('listRules devolve critérios já interpretados e o título da atividade', async () => {
    prisma.certificateRule.findMany.mockResolvedValue([
      {
        id: 1,
        activityKind: 'COURSE',
        activityId: 10,
        mode: 'AUTOMATIC',
        criteria: '{"requireFullCompletion":true}',
        validityDays: null,
        active: true,
        updatedAt: new Date(),
      },
    ]);
    prisma.course.findMany.mockResolvedValue([{ id: 10, title: 'Segurança' }]);
    prisma.event.findMany.mockResolvedValue([]);
    const [r] = await svc.listRules();
    expect(r).toMatchObject({
      activityTitle: 'Segurança',
      criteria: { requireFullCompletion: true },
    });
  });
});
