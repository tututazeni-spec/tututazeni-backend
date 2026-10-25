import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DsrStatus } from '@prisma/client';
import { PrivacySettingsService } from './privacy-settings.service';
import {
  DEFAULT_PRIVACY_SETTINGS,
  currentConsentVersion,
  parsePrivacySettings,
  publishConsentVersion,
} from './privacy-settings';
import { writeChainedAuditLog } from '../common/helpers/audit-chain';

jest.mock('../common/helpers/audit-chain', () => ({
  writeChainedAuditLog: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../common/helpers/tenant.helper', () => ({
  resolveDefaultTenantId: jest.fn().mockResolvedValue(1),
}));

const audit = writeChainedAuditLog as jest.Mock;

describe('privacy-settings (helpers puros)', () => {
  it.each([null, undefined, ''])('defaults para %p', raw => {
    expect(parsePrivacySettings(raw)).toEqual(DEFAULT_PRIVACY_SETTINGS);
  });

  it('JSON inválido cai nos defaults', () => {
    expect(parsePrivacySettings('{x')).toEqual(DEFAULT_PRIVACY_SETTINGS);
  });

  it('o histórico de consentimento nunca é partilhado com os defaults', () => {
    const s = parsePrivacySettings(null);
    s.consentVersions.push({ version: 1, text: 'x', publishedAt: '' });
    expect(DEFAULT_PRIVACY_SETTINGS.consentVersions).toEqual([]);
  });

  it('sem consentVersions no JSON fica lista vazia, não undefined', () => {
    expect(parsePrivacySettings(JSON.stringify({ dpoName: 'Ana' })).consentVersions).toEqual([]);
  });

  it('currentConsentVersion: null sem histórico, senão a última', () => {
    expect(currentConsentVersion(DEFAULT_PRIVACY_SETTINGS)).toBeNull();
    const s = publishConsentVersion(publishConsentVersion(parsePrivacySettings(null), 'a'), 'b');
    expect(currentConsentVersion(s)).toMatchObject({ version: 2, text: 'b' });
  });

  it('publishConsentVersion acrescenta sem substituir nem mutar o original', () => {
    const base = publishConsentVersion(parsePrivacySettings(null), 'v1');
    const next = publishConsentVersion(base, 'v2');
    expect(base.consentVersions).toHaveLength(1);
    expect(next.consentVersions.map(v => v.version)).toEqual([1, 2]);
    expect(next.consentVersions[0].text).toBe('v1');
    expect(new Date(next.consentVersions[1].publishedAt).toString()).not.toBe('Invalid Date');
  });
});

describe('PrivacySettingsService', () => {
  let prisma: any;
  let service: PrivacySettingsService;

  const withRow = (json: object | null) =>
    prisma.tenantConfig.findUniqueOrThrow.mockResolvedValue({
      id: 1,
      privacySettingsJson: json ? JSON.stringify(json) : null,
    });
  const saved = () =>
    JSON.parse(prisma.tenantConfig.update.mock.calls[0][0].data.privacySettingsJson);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      tenantConfig: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 1, privacySettingsJson: null }),
        update: jest.fn().mockResolvedValue({}),
      },
      dataSubjectRequest: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        create: jest.fn().mockImplementation(async ({ data }) => ({ id: 5, ...data })),
        update: jest.fn().mockImplementation(async ({ data }) => ({ id: 5, ...data })),
      },
    };
    prisma.read = prisma;
    service = new PrivacySettingsService(prisma);
  });

  describe('get', () => {
    it('soma pedidos pendentes e em curso como "abertos", só do tenant', async () => {
      prisma.dataSubjectRequest.count.mockResolvedValueOnce(3).mockResolvedValueOnce(2);
      const v = await service.get();
      expect(v.openRequests).toBe(5);
      const wheres = prisma.dataSubjectRequest.count.mock.calls.map((c: any) => c[0].where);
      expect(wheres).toEqual([
        { tenantId: 1, status: DsrStatus.PENDING },
        { tenantId: 1, status: DsrStatus.IN_PROGRESS },
      ]);
    });

    it('inclui a versão de consentimento vigente (ou null)', async () => {
      expect((await service.get()).currentConsentVersion).toBeNull();
      withRow(publishConsentVersion(parsePrivacySettings(null), 'texto'));
      expect((await service.get()).currentConsentVersion).toMatchObject({
        version: 1,
        text: 'texto',
      });
    });
  });

  describe('update', () => {
    it('ignora campos undefined e preserva o histórico de consentimento', async () => {
      withRow(publishConsentVersion({ ...DEFAULT_PRIVACY_SETTINGS, dpoName: 'Ana' }, 'v1'));
      await service.update({ retentionDays: 365, dpoName: undefined } as never, 4);
      expect(saved()).toMatchObject({ retentionDays: 365, dpoName: 'Ana' });
      expect(saved().consentVersions).toHaveLength(1);
    });

    it('audita antes e depois', async () => {
      await service.update({ retentionDays: 10 } as never, 4);
      expect(audit.mock.calls[0][1]).toMatchObject({
        userId: 4,
        action: 'SETTINGS_PRIVACY_UPDATE',
      });
      const meta = JSON.parse(audit.mock.calls[0][1].metadata);
      expect(meta.before.retentionDays).toBe(1825);
      expect(meta.after.retentionDays).toBe(10);
    });

    it('falha ao auditar não impede a gravação', async () => {
      audit.mockRejectedValueOnce(new Error('x'));
      await expect(service.update({ exportEnabled: false } as never)).resolves.toBeDefined();
    });
  });

  describe('consentimento', () => {
    it('publicar acrescenta a versão seguinte e audita o número', async () => {
      withRow(publishConsentVersion(parsePrivacySettings(null), 'v1'));
      await service.publishConsentText({ text: 'v2' } as never, 4);
      expect(saved().consentVersions.map((v: any) => v.version)).toEqual([1, 2]);
      expect(JSON.parse(audit.mock.calls[0][1].metadata)).toEqual({ version: 2 });
    });

    it('listConsentVersions devolve da mais recente para a mais antiga, sem mutar', async () => {
      withRow(publishConsentVersion(publishConsentVersion(parsePrivacySettings(null), 'a'), 'b'));
      const list = await service.listConsentVersions();
      expect(list.map(v => v.version)).toEqual([2, 1]);
    });
  });

  describe('pedidos dos titulares', () => {
    describe('listRequests', () => {
      it('filtra por tenant e, se indicado, por estado', async () => {
        await service.listRequests({ status: DsrStatus.PENDING });
        expect(prisma.dataSubjectRequest.findMany.mock.calls[0][0].where).toEqual({
          tenantId: 1,
          status: DsrStatus.PENDING,
        });
        await service.listRequests({});
        expect(prisma.dataSubjectRequest.findMany.mock.calls[1][0].where).toEqual({ tenantId: 1 });
      });

      it.each([
        [{ page: 0, limit: 0 }, 1, 20],
        [{ page: -3, limit: -1 }, 1, 20],
        [{ page: 3, limit: 5000 }, 3, 100],
        [{ page: 2, limit: 10 }, 2, 10],
      ])('normaliza %j → página %i, limite %i', async (f, page, limit) => {
        const res = await service.listRequests(f);
        expect(res).toMatchObject({ page, limit });
        const q = prisma.dataSubjectRequest.findMany.mock.calls[0][0];
        expect(q.take).toBe(limit);
        expect(q.skip).toBe((page - 1) * limit);
      });
    });

    it('createRequest força o tenant e audita', async () => {
      const r = await service.createRequest({ type: 'ACCESS', tenantId: 999 } as never, 4);
      expect(prisma.dataSubjectRequest.create.mock.calls[0][0].data.tenantId).toBe(1);
      expect(r.id).toBe(5);
      expect(audit.mock.calls[0][1].action).toBe('SETTINGS_PRIVACY_DSR_CREATE');
    });

    describe('updateRequest', () => {
      it('inexistente → 404', async () => {
        prisma.dataSubjectRequest.findUnique.mockResolvedValue(null);
        await expect(service.updateRequest(5, {} as never, 4)).rejects.toBeInstanceOf(
          NotFoundException,
        );
      });

      it.each([DsrStatus.COMPLETED, DsrStatus.REJECTED])(
        'pedido já %s não pode voltar a ser alterado',
        async status => {
          prisma.dataSubjectRequest.findUnique.mockResolvedValue({ id: 5, status });
          await expect(
            service.updateRequest(5, { status: DsrStatus.IN_PROGRESS } as never, 4),
          ).rejects.toBeInstanceOf(BadRequestException);
          expect(prisma.dataSubjectRequest.update).not.toHaveBeenCalled();
        },
      );

      it.each([DsrStatus.COMPLETED, DsrStatus.REJECTED])(
        'encerrar como %s regista resolvedAt e quem tratou',
        async status => {
          prisma.dataSubjectRequest.findUnique.mockResolvedValue({
            id: 5,
            status: DsrStatus.PENDING,
          });
          await service.updateRequest(5, { status } as never, 4);
          expect(prisma.dataSubjectRequest.update.mock.calls[0][0].data).toMatchObject({
            status,
            handledById: 4,
            resolvedAt: expect.any(Date),
          });
        },
      );

      it('passar a "em curso" não define resolvedAt', async () => {
        prisma.dataSubjectRequest.findUnique.mockResolvedValue({
          id: 5,
          status: DsrStatus.PENDING,
        });
        await service.updateRequest(5, { status: DsrStatus.IN_PROGRESS } as never, 4);
        expect(prisma.dataSubjectRequest.update.mock.calls[0][0].data.resolvedAt).toBeUndefined();
      });

      it('audita a transição de estado', async () => {
        prisma.dataSubjectRequest.findUnique.mockResolvedValue({
          id: 5,
          status: DsrStatus.PENDING,
        });
        await service.updateRequest(5, { status: DsrStatus.COMPLETED } as never, 4);
        expect(JSON.parse(audit.mock.calls[0][1].metadata)).toEqual({
          id: 5,
          before: DsrStatus.PENDING,
          after: DsrStatus.COMPLETED,
        });
      });
    });
  });
});
