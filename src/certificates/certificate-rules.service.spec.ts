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

  it('aceita templateId de um modelo de sistema e rejeita formatos estranhos', async () => {
    expect(await validate(dtoOf({ templateId: 'tpl-3-executivo-premium' }))).toHaveLength(0);
    for (const bad of ['TPL-3', 'tpl 3', "tpl-1'; DROP TABLE x", '', 'x'.repeat(80), 'tpl-']) {
      expect((await validate(dtoOf({ templateId: bad }))).length).toBeGreaterThan(0);
    }
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
    training: { findUnique: jest.fn(), findMany: jest.fn() },
    learningPath: { findUnique: jest.fn(), findMany: jest.fn() },
    certificateTemplate: { findFirst: jest.fn() },
  };
  const audit = { log: jest.fn() };
  const svc = new CertificateRulesService(prisma as never, audit as never);

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.certificateRule.findUnique.mockResolvedValue(null);
    prisma.course.findUnique.mockResolvedValue({ id: 10 });
    prisma.certificateTemplate.findFirst.mockResolvedValue({ id: 'tpl-3-executivo-premium' });
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

  it('com templateId confirma que é um modelo de sistema e grava-o na regra', async () => {
    await svc.upsertRule(dtoOf({ templateId: 'tpl-3-executivo-premium' }), 7);
    expect(prisma.certificateTemplate.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'tpl-3-executivo-premium', isSystem: true, deletedAt: null },
      }),
    );
    const call = prisma.certificateRule.upsert.mock.calls[0][0];
    expect(call.create.templateId).toBe('tpl-3-executivo-premium');
    expect(call.update.templateId).toBe('tpl-3-executivo-premium');
  });

  it('modelo inexistente ou legado → 404 e nada gravado', async () => {
    prisma.certificateTemplate.findFirst.mockResolvedValue(null);
    await expect(svc.upsertRule(dtoOf({ templateId: 'tpl-legado-1' }), 7)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.certificateRule.upsert).not.toHaveBeenCalled();
  });

  it('sem templateId a regra volta ao modelo por omissão (null) e não consulta modelos', async () => {
    await svc.upsertRule(dtoOf(), 7);
    expect(prisma.certificateTemplate.findFirst).not.toHaveBeenCalled();
    expect(prisma.certificateRule.upsert.mock.calls[0][0].update.templateId).toBeNull();
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
        templateId: 'tpl-2-moderno-minimalista',
        active: true,
        updatedAt: new Date(),
      },
    ]);
    prisma.course.findMany.mockResolvedValue([{ id: 10, title: 'Segurança' }]);
    prisma.event.findMany.mockResolvedValue([]);
    prisma.training.findMany.mockResolvedValue([]);
    prisma.learningPath.findMany.mockResolvedValue([]);
    const [r] = await svc.listRules();
    expect(r).toMatchObject({
      activityTitle: 'Segurança',
      templateId: 'tpl-2-moderno-minimalista',
      criteria: { requireFullCompletion: true },
    });
  });
});
