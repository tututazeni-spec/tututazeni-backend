import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BUILTIN_TEMPLATES } from './builtin-templates';
import { CertificateTemplatesService } from './certificate-templates.service';
import { TemplateConfig } from './template-config';

const p2002 = () =>
  new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' });
const cfg = (i = 0): TemplateConfig => structuredClone(BUILTIN_TEMPLATES[i].config);
const row = (i: number, over: Record<string, unknown> = {}) => ({
  id: BUILTIN_TEMPLATES[i].id,
  name: BUILTIN_TEMPLATES[i].name,
  description: BUILTIN_TEMPLATES[i].description,
  isSystem: true,
  layoutKey: BUILTIN_TEMPLATES[i].config.layoutKey,
  config: JSON.stringify(BUILTIN_TEMPLATES[i].config),
  currentVersion: 1,
  updatedAt: new Date('2026-10-20'),
  ...over,
});

describe('CertificateTemplatesService', () => {
  const tx = {
    certificateTemplate: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    certificateTemplateVersion: { create: jest.fn() },
  };
  const prisma = {
    certificateTemplate: {
      count: jest.fn(),
      createMany: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    certificateTemplateVersion: {
      createMany: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    certificateAsset: { findUnique: jest.fn(), findMany: jest.fn() },
    user: { findMany: jest.fn() },
    $transaction: jest.fn(),
  };
  const audit = { log: jest.fn() };
  const assets = { loadForRender: jest.fn() };
  const svc = new CertificateTemplatesService(prisma as never, audit as never, assets as never);

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.certificateTemplate.count.mockResolvedValue(9);
    prisma.certificateTemplate.findMany.mockResolvedValue(BUILTIN_TEMPLATES.map((_t, i) => row(i)));
    prisma.certificateTemplate.findFirst.mockResolvedValue(row(0));
    prisma.certificateTemplateVersion.findMany.mockResolvedValue([]);
    prisma.user.findMany.mockResolvedValue([]);
    prisma.$transaction.mockImplementation(async (fn: (t: unknown) => unknown) => fn(tx));
    tx.certificateTemplate.findUnique.mockResolvedValue({ currentVersion: 1 });
    tx.certificateTemplate.update.mockResolvedValue({});
    tx.certificateTemplateVersion.create.mockResolvedValue({});
    assets.loadForRender.mockResolvedValue({});
  });

  describe('list', () => {
    it('devolve exactamente os 9 de sistema, na ordem dos conceitos', async () => {
      const r = await svc.list();
      expect(r).toHaveLength(9);
      expect(r.map(t => t.name)).toEqual(BUILTIN_TEMPLATES.map(t => t.name));
      expect(prisma.certificateTemplate.findMany.mock.calls[0][0].where).toMatchObject({
        isSystem: true,
        deletedAt: null,
      });
      expect(prisma.certificateTemplate.createMany).not.toHaveBeenCalled();
    });

    it('cria os 9 (idempotente, com skipDuplicates) quando faltam', async () => {
      prisma.certificateTemplate.count.mockResolvedValue(3);
      await svc.list();
      const call = prisma.certificateTemplate.createMany.mock.calls[0][0];
      expect(call.skipDuplicates).toBe(true);
      expect(call.data.map((d: { id: string }) => d.id)).toEqual(BUILTIN_TEMPLATES.map(t => t.id));
      expect(call.data[0]).toMatchObject({
        isSystem: true,
        currentVersion: 1,
        html: '',
        createdById: null,
      });
      const versions = prisma.certificateTemplateVersion.createMany.mock.calls[0][0];
      expect(versions.skipDuplicates).toBe(true);
      expect(versions.data).toHaveLength(9);
      expect(versions.data.every((v: { version: number }) => v.version === 1)).toBe(true);
    });

    it('o resumo inclui as cores e a versão actual, sem a configuração completa', async () => {
      const [first] = await svc.list();
      expect(first).toMatchObject({
        id: BUILTIN_TEMPLATES[0].id,
        currentVersion: 1,
        colors: BUILTIN_TEMPLATES[0].config.colors,
      });
      expect(first).not.toHaveProperty('config');
    });
  });

  describe('get', () => {
    it('devolve a configuração actual e as versões com o nome do autor', async () => {
      prisma.certificateTemplateVersion.findMany.mockResolvedValue([
        { version: 2, createdAt: new Date('2026-10-21'), createdById: 5 },
        { version: 1, createdAt: new Date('2026-10-20'), createdById: null },
      ]);
      prisma.user.findMany.mockResolvedValue([{ id: 5, fullName: 'Rita RH' }]);
      const r = await svc.get(BUILTIN_TEMPLATES[0].id);
      expect(r.config.layoutKey).toBe('corporativo-classico');
      expect(r.versions).toEqual([
        {
          version: 2,
          createdAt: new Date('2026-10-21'),
          createdByName: 'Rita RH',
          restoredFromVersion: undefined,
        },
        {
          version: 1,
          createdAt: new Date('2026-10-20'),
          createdByName: null,
          restoredFromVersion: undefined,
        },
      ]);
    });

    it('template que não é de sistema ou inexistente → 404', async () => {
      prisma.certificateTemplate.findFirst.mockResolvedValue(null);
      await expect(svc.get('qualquer')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.certificateTemplate.findFirst.mock.calls[0][0].where).toMatchObject({
        isSystem: true,
      });
    });
  });

  describe('saveVersion', () => {
    const id = BUILTIN_TEMPLATES[0].id;

    it('configuração inválida → 400 com todos os erros', async () => {
      const bad = cfg();
      bad.colors.primary = 'red';
      bad.texts.recognition = '{{inventada}}';
      const err = await svc.saveVersion(id, bad, 9).catch(e => e);
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err.getResponse() as { message: string[] }).message.length).toBeGreaterThanOrEqual(2);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('não permite mudar o layout do modelo', async () => {
      const other = cfg();
      other.layoutKey = 'faixa-lateral';
      await expect(svc.saveVersion(id, other, 9)).rejects.toThrow(/layout/i);
    });

    it('imagem inexistente → 404 e de outro tipo → 400', async () => {
      const c = cfg();
      c.assets = { logoId: 'asset12345678' };
      prisma.certificateAsset.findUnique.mockResolvedValueOnce(null);
      await expect(svc.saveVersion(id, c, 9)).rejects.toBeInstanceOf(NotFoundException);
      prisma.certificateAsset.findUnique.mockResolvedValueOnce({ kind: 'BACKGROUND' });
      await expect(svc.saveVersion(id, c, 9)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('sucesso: v1 → v2, grava a versão, actualiza a configuração e audita', async () => {
      const c = cfg();
      c.texts.title = 'NOVO TÍTULO';
      const r = await svc.saveVersion(id, c, 9);
      expect(tx.certificateTemplateVersion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ templateId: id, version: 2, createdById: 9 }),
      });
      expect(
        JSON.parse(tx.certificateTemplateVersion.create.mock.calls[0][0].data.config).texts.title,
      ).toBe('NOVO TÍTULO');
      expect(tx.certificateTemplate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id },
          data: expect.objectContaining({ currentVersion: 2 }),
        }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CERTIFICATE_TEMPLATE_SAVED', userId: 9, strict: true }),
      );
      expect(r).toBeDefined();
    });

    it('P2002 (guardar em simultâneo) repete e fica na versão seguinte, sem duplicar nem perder', async () => {
      tx.certificateTemplateVersion.create.mockRejectedValueOnce(p2002()).mockResolvedValueOnce({});
      tx.certificateTemplate.findUnique
        .mockResolvedValueOnce({ currentVersion: 1 })
        .mockResolvedValueOnce({ currentVersion: 2 });
      await svc.saveVersion(id, cfg(), 9);
      expect(tx.certificateTemplateVersion.create).toHaveBeenCalledTimes(2);
      expect(tx.certificateTemplateVersion.create.mock.calls[1][0].data.version).toBe(3);
    });

    it('3 conflitos seguidos → 409', async () => {
      tx.certificateTemplateVersion.create.mockRejectedValue(p2002());
      await expect(svc.saveVersion(id, cfg(), 9)).rejects.toBeInstanceOf(ConflictException);
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('template desconhecido → 404', async () => {
      prisma.certificateTemplate.findFirst.mockResolvedValue(null);
      await expect(svc.saveVersion('x', cfg(), 9)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('restoreVersion', () => {
    const id = BUILTIN_TEMPLATES[0].id;
    const old = () => {
      const c = cfg();
      c.texts.title = 'TÍTULO ANTIGO';
      return { config: JSON.stringify(c) };
    };

    beforeEach(() => {
      prisma.certificateTemplate.findFirst.mockResolvedValue(row(0, { currentVersion: 3 }));
      tx.certificateTemplate.findUnique.mockResolvedValue({ currentVersion: 3 });
      prisma.certificateTemplateVersion.findUnique.mockResolvedValue(old());
    });

    it('cria a versão n+1 como cópia da escolhida, com a origem, e audita', async () => {
      await svc.restoreVersion(id, 1, 9);
      const data = tx.certificateTemplateVersion.create.mock.calls[0][0].data;
      expect(data).toMatchObject({
        templateId: id,
        version: 4,
        createdById: 9,
        restoredFromVersion: 1,
      });
      expect(JSON.parse(data.config).texts.title).toBe('TÍTULO ANTIGO');
      expect(tx.certificateTemplate.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ currentVersion: 4 }) }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CERTIFICATE_TEMPLATE_RESTORED',
          userId: 9,
          strict: true,
          metadata: { templateId: id, restoredFromVersion: 1, newVersion: 4 },
        }),
      );
    });

    it('versão já actual → 400 e nada é criado', async () => {
      await expect(svc.restoreVersion(id, 3, 9)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('versão inexistente → 404', async () => {
      prisma.certificateTemplateVersion.findUnique.mockResolvedValue(null);
      await expect(svc.restoreVersion(id, 9, 9)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('modelo desconhecido → 404', async () => {
      prisma.certificateTemplate.findFirst.mockResolvedValue(null);
      await expect(svc.restoreVersion('x', 1, 9)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('configuração antiga danificada → 400', async () => {
      prisma.certificateTemplateVersion.findUnique.mockResolvedValue({ config: '{nope' });
      await expect(svc.restoreVersion(id, 1, 9)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('imagem entretanto desaparecida → 404 e nada é criado', async () => {
      const c = cfg();
      c.assets = { logoId: 'asset12345678' };
      prisma.certificateTemplateVersion.findUnique.mockResolvedValue({ config: JSON.stringify(c) });
      prisma.certificateAsset.findUnique.mockResolvedValue(null);
      await expect(svc.restoreVersion(id, 1, 9)).rejects.toBeInstanceOf(NotFoundException);
      expect(tx.certificateTemplateVersion.create).not.toHaveBeenCalled();
    });
  });

  describe('preview', () => {
    it('gera um PDF com dados de exemplo e não grava nada', async () => {
      const pdf = await svc.preview(cfg(2));
      expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('configuração inválida → 400', async () => {
      const bad = cfg();
      bad.colors.text = '#FFFFFF';
      bad.colors.background = '#FFFFFF';
      await expect(svc.preview(bad)).rejects.toBeInstanceOf(BadRequestException);
    });

    it.each(BUILTIN_TEMPLATES.map(t => [t.name, t.config] as const))(
      'pré-visualiza %s',
      async (_n, config) => {
        expect((await svc.preview(config)).subarray(0, 5).toString()).toBe('%PDF-');
      },
    );
  });

  describe('setInUse', () => {
    it('marca só o escolhido como em uso e regista a auditoria', async () => {
      prisma.certificateTemplate.findMany.mockResolvedValue(
        BUILTIN_TEMPLATES.map((_t, i) => ({ ...row(i), isDefault: i === 3 })),
      );
      const list = await svc.setInUse(BUILTIN_TEMPLATES[3].id, 7);
      expect(tx.certificateTemplate.updateMany).toHaveBeenCalledWith({
        where: { isSystem: true, isDefault: true },
        data: { isDefault: false },
      });
      expect(tx.certificateTemplate.update).toHaveBeenCalledWith({
        where: { id: BUILTIN_TEMPLATES[3].id },
        data: { isDefault: true },
      });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CERTIFICATE_TEMPLATE_SET_IN_USE', userId: 7 }),
      );
      expect(list.filter(t => t.inUse).map(t => t.id)).toEqual([BUILTIN_TEMPLATES[3].id]);
    });

    it('modelo desconhecido → 404 e nada é alterado', async () => {
      prisma.certificateTemplate.findFirst.mockResolvedValue(null);
      await expect(svc.setInUse('legado-1', 7)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('resolveForIssuance', () => {
    it('sem id e sem modelo marcado usa o corporativo clássico e devolve a versão actual', async () => {
      prisma.certificateTemplate.findFirst
        .mockResolvedValueOnce(null) // nenhum modelo em uso marcado
        .mockResolvedValueOnce(row(0));
      const r = await svc.resolveForIssuance(undefined);
      expect(prisma.certificateTemplate.findFirst.mock.calls[1][0].where).toMatchObject({
        id: 'tpl-1-corporativo-classico',
        isSystem: true,
      });
      expect(r).toMatchObject({ id: 'tpl-1-corporativo-classico', version: 1 });
      expect(r.config.layoutKey).toBe('corporativo-classico');
    });

    it('sem id usa o modelo em uso na plataforma', async () => {
      prisma.certificateTemplate.findFirst
        .mockResolvedValueOnce({ id: BUILTIN_TEMPLATES[2].id })
        .mockResolvedValueOnce(row(2));
      const r = await svc.resolveForIssuance(undefined);
      expect(prisma.certificateTemplate.findFirst.mock.calls[1][0].where).toMatchObject({
        id: BUILTIN_TEMPLATES[2].id,
        isSystem: true,
      });
      expect(r.id).toBe(BUILTIN_TEMPLATES[2].id);
    });

    it('id desconhecido ou legado → 404', async () => {
      prisma.certificateTemplate.findFirst.mockResolvedValue(null);
      await expect(svc.resolveForIssuance('legado-1234')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
