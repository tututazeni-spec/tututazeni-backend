import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CertificateSettingsService } from './certificate-settings.service';
import {
  DEFAULT_CERTIFICATE_SETTINGS,
  formatCertificateNumber,
  parseCertificateSettings,
} from './certificate-settings';
import { writeChainedAuditLog } from '../common/helpers/audit-chain';

jest.mock('../common/helpers/audit-chain', () => ({
  writeChainedAuditLog: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../common/helpers/tenant.helper', () => ({
  resolveDefaultTenantId: jest.fn().mockResolvedValue(1),
}));

const audit = writeChainedAuditLog as jest.Mock;

describe('certificate-settings (helpers puros)', () => {
  it.each([null, undefined, ''])('defaults para %p', raw => {
    expect(parseCertificateSettings(raw)).toEqual(DEFAULT_CERTIFICATE_SETTINGS);
  });

  it('JSON inválido cai nos defaults; merge parcial preserva o resto', () => {
    expect(parseCertificateSettings('{x')).toEqual(DEFAULT_CERTIFICATE_SETTINGS);
    expect(parseCertificateSettings(JSON.stringify({ numberingPrefix: 'AC-' }))).toMatchObject({
      numberingPrefix: 'AC-',
      numberingPadding: 6,
    });
  });

  describe('formatCertificateNumber', () => {
    const s = (over = {}) => ({ ...DEFAULT_CERTIFICATE_SETTINGS, ...over });

    it('prefixo + sequência com zeros à esquerda', () => {
      expect(formatCertificateNumber(s())).toBe('CERT-000001');
      expect(
        formatCertificateNumber(
          s({ numberingPrefix: 'AC/', numberingNextSeq: 42, numberingPadding: 4 }),
        ),
      ).toBe('AC/0042');
    });

    it('uma sequência maior que o padding não é truncada', () => {
      expect(formatCertificateNumber(s({ numberingNextSeq: 1234567, numberingPadding: 3 }))).toBe(
        'CERT-1234567',
      );
    });

    it('padding 0 e prefixo vazio dão só o número', () => {
      expect(
        formatCertificateNumber(
          s({ numberingPrefix: '', numberingPadding: 0, numberingNextSeq: 9 }),
        ),
      ).toBe('9');
    });
  });
});

describe('CertificateSettingsService', () => {
  let prisma: any;
  let service: CertificateSettingsService;
  const saved = () =>
    JSON.parse(prisma.tenantConfig.update.mock.calls[0][0].data.certificateSettingsJson);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      tenantConfig: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 1, certificateSettingsJson: null }),
        update: jest.fn().mockResolvedValue({}),
      },
      certificateTemplate: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        create: jest.fn().mockImplementation(async ({ data }) => ({ id: 't-new', ...data })),
        update: jest
          .fn()
          .mockImplementation(async ({ where, data }) => ({ id: where.id, ...data })),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    prisma.read = prisma;
    service = new CertificateSettingsService(prisma);
  });

  describe('definições globais', () => {
    it('get inclui a pré-visualização do próximo número', async () => {
      expect((await service.get()).nextNumberPreview).toBe('CERT-000001');
    });

    it('update ignora campos undefined, mantém a sequência e actualiza a pré-visualização', async () => {
      prisma.tenantConfig.findUniqueOrThrow.mockResolvedValue({
        id: 1,
        certificateSettingsJson: JSON.stringify({ numberingNextSeq: 77, signatoryName: 'Ana' }),
      });
      await service.update({ numberingPrefix: 'X-', signatoryName: undefined } as never, 4);
      expect(saved()).toMatchObject({
        numberingNextSeq: 77,
        signatoryName: 'Ana',
        numberingPrefix: 'X-',
      });
    });

    it('um valor null explícito limpa o campo (assinatura removida)', async () => {
      prisma.tenantConfig.findUniqueOrThrow.mockResolvedValue({
        id: 1,
        certificateSettingsJson: JSON.stringify({ signatureUrl: 'data:x' }),
      });
      await service.update({ signatureUrl: null } as never);
      expect(saved().signatureUrl).toBeNull();
    });

    it('audita antes e depois', async () => {
      await service.update({ numberingPrefix: 'Z-' } as never, 4);
      const meta = JSON.parse(audit.mock.calls[0][1].metadata);
      expect(meta.before.numberingPrefix).toBe('CERT-');
      expect(meta.after.numberingPrefix).toBe('Z-');
    });
  });

  describe('templates', () => {
    const existing = { id: 't1', type: 'COURSE', name: 'Padrão', isDefault: false };

    it('lista só os não apagados, por tipo, predefinido primeiro', async () => {
      await service.listTemplates();
      expect(prisma.certificateTemplate.findMany).toHaveBeenCalledWith({
        where: { deletedAt: null },
        orderBy: [{ type: 'asc' }, { isDefault: 'desc' }, { name: 'asc' }],
      });
    });

    describe('createTemplate', () => {
      it('como predefinido, retira primeiro o estatuto aos outros do mesmo tipo', async () => {
        await service.createTemplate({ name: 'N', type: 'COURSE', isDefault: true } as never, 4);
        expect(prisma.certificateTemplate.updateMany).toHaveBeenCalledWith({
          where: { type: 'COURSE', isDefault: true, id: undefined },
          data: { isDefault: false },
        });
        expect(prisma.certificateTemplate.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
          prisma.certificateTemplate.create.mock.invocationCallOrder[0],
        );
      });

      it('sem isDefault não mexe nos outros e regista quem criou', async () => {
        await service.createTemplate({ name: 'N', type: 'COURSE' } as never, 4);
        expect(prisma.certificateTemplate.updateMany).not.toHaveBeenCalled();
        expect(prisma.certificateTemplate.create.mock.calls[0][0].data.createdById).toBe(4);
      });
    });

    describe('updateTemplate', () => {
      it('inexistente ou apagado → 404', async () => {
        prisma.certificateTemplate.findFirst.mockResolvedValue(null);
        await expect(service.updateTemplate('t1', {} as never, 4)).rejects.toBeInstanceOf(
          NotFoundException,
        );
        expect(prisma.certificateTemplate.findFirst).toHaveBeenCalledWith({
          where: { id: 't1', deletedAt: null },
        });
      });

      it('tornar predefinido exclui o próprio da limpeza e usa o tipo existente', async () => {
        prisma.certificateTemplate.findFirst.mockResolvedValue(existing);
        await service.updateTemplate('t1', { isDefault: true } as never, 4);
        expect(prisma.certificateTemplate.updateMany).toHaveBeenCalledWith({
          where: { type: 'COURSE', isDefault: true, id: { not: 't1' } },
          data: { isDefault: false },
        });
      });

      it('se o tipo muda ao mesmo tempo, limpa os predefinidos do tipo novo', async () => {
        prisma.certificateTemplate.findFirst.mockResolvedValue(existing);
        await service.updateTemplate('t1', { isDefault: true, type: 'TRAINING' } as never, 4);
        expect(prisma.certificateTemplate.updateMany.mock.calls[0][0].where.type).toBe('TRAINING');
      });

      it('sem isDefault não mexe nos outros', async () => {
        prisma.certificateTemplate.findFirst.mockResolvedValue(existing);
        await service.updateTemplate('t1', { name: 'Novo nome' } as never, 4);
        expect(prisma.certificateTemplate.updateMany).not.toHaveBeenCalled();
      });
    });

    describe('deleteTemplate', () => {
      it('inexistente → 404', async () => {
        prisma.certificateTemplate.findFirst.mockResolvedValue(null);
        await expect(service.deleteTemplate('t1', 4)).rejects.toBeInstanceOf(NotFoundException);
      });

      it('recusa apagar o predefinido do tipo (certificados novos ficariam sem modelo)', async () => {
        prisma.certificateTemplate.findFirst.mockResolvedValue({ ...existing, isDefault: true });
        await expect(service.deleteTemplate('t1', 4)).rejects.toBeInstanceOf(BadRequestException);
        expect(prisma.certificateTemplate.update).not.toHaveBeenCalled();
      });

      it('apaga por soft-delete (deletedAt), nunca fisicamente', async () => {
        prisma.certificateTemplate.findFirst.mockResolvedValue(existing);
        await expect(service.deleteTemplate('t1', 4)).resolves.toEqual({ id: 't1', deleted: true });
        expect(prisma.certificateTemplate.update).toHaveBeenCalledWith({
          where: { id: 't1' },
          data: { deletedAt: expect.any(Date) },
        });
        expect(audit.mock.calls[0][1].action).toBe('SETTINGS_CERTIFICATE_TEMPLATE_DELETE');
      });
    });

    describe('setDefaultTemplate', () => {
      it('inexistente → 404', async () => {
        prisma.certificateTemplate.findFirst.mockResolvedValue(null);
        await expect(service.setDefaultTemplate('t1', 4)).rejects.toBeInstanceOf(NotFoundException);
      });

      it('retira o estatuto aos outros do mesmo tipo e marca este', async () => {
        prisma.certificateTemplate.findFirst.mockResolvedValue(existing);
        const t = await service.setDefaultTemplate('t1', 4);
        expect(prisma.certificateTemplate.updateMany.mock.calls[0][0].where).toEqual({
          type: 'COURSE',
          isDefault: true,
          id: { not: 't1' },
        });
        expect(t).toMatchObject({ id: 't1', isDefault: true });
      });
    });
  });
});
