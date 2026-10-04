import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CrmFundersService } from './crm-funders.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import { NotificationsService } from '../notifications/notifications.service';

const funder = { id: 'fun-1', deletedAt: null, assignedToId: 1, customFields: null };

const mockPrisma: Record<string, any> = {
  funder: { findUnique: jest.fn(), update: jest.fn() },
  user: { findUnique: jest.fn() },
  funderDocument: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    aggregate: jest.fn(),
  },
  funderCustomFieldDefinition: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  funderConsent: { findUnique: jest.fn(), upsert: jest.fn() },
  auditLog: { findMany: jest.fn(), count: jest.fn() },
  $transaction: jest.fn(),
};
const mockAudit = { logEntity: jest.fn() };

describe('CrmFundersService — §16 documentos, §17 responsável, §18 notas, §19 privacidade', () => {
  let service: CrmFundersService;

  beforeEach(async () => {
    Object.defineProperty(mockPrisma, 'read', { get: () => mockPrisma, configurable: true });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CrmFundersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
        { provide: NotificationsService, useValue: { enqueueSend: jest.fn() } },
      ],
    }).compile();
    service = module.get(CrmFundersService);
    jest.resetAllMocks();
    mockPrisma.funder.findUnique.mockResolvedValue({ ...funder });
    mockPrisma.$transaction.mockImplementation((fn: any) => fn(mockPrisma));
  });

  describe('§16 documentos', () => {
    const base = { type: 'CONTRACT', name: 'Acordo', fileUrl: 'https://x/a.pdf' } as any;

    it('rejeita nome duplicado (deve usar nova versão)', async () => {
      mockPrisma.funderDocument.findFirst.mockResolvedValue({ id: 'd1' });
      await expect(service.addDocument('fun-1', base, 1)).rejects.toThrow(BadRequestException);
      expect(mockPrisma.funderDocument.create).not.toHaveBeenCalled();
    });

    it('numera a versão a seguir à maior existente (incluindo apagadas)', async () => {
      mockPrisma.funderDocument.findFirst.mockResolvedValue(null);
      mockPrisma.funderDocument.aggregate.mockResolvedValue({ _max: { version: 3 } });
      mockPrisma.funderDocument.create.mockResolvedValue({ id: 'd2' });
      await service.addDocument('fun-1', base, 7);
      expect(mockPrisma.funderDocument.create.mock.calls[0][0].data).toMatchObject({
        funderId: 'fun-1',
        uploadedById: 7,
        version: 4,
      });
    });

    it('rejeita validade anterior à data do documento', async () => {
      mockPrisma.funderDocument.findFirst.mockResolvedValue(null);
      await expect(
        service.addDocument(
          'fun-1',
          { ...base, documentDate: '2026-05-01', validUntil: '2026-01-01' },
          1,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('nova versão herda nome/tipo e incrementa', async () => {
      mockPrisma.funderDocument.findFirst.mockResolvedValue({
        id: 'd1',
        name: 'Acordo',
        type: 'CONTRACT',
        responsibleId: 2,
      });
      mockPrisma.funderDocument.aggregate.mockResolvedValue({ _max: { version: 1 } });
      mockPrisma.funderDocument.create.mockResolvedValue({ id: 'd2', name: 'Acordo', version: 2 });
      await service.addDocumentVersion('fun-1', 'd1', { fileUrl: 'https://x/b.pdf' }, 5);
      expect(mockPrisma.funderDocument.create.mock.calls[0][0].data).toMatchObject({
        name: 'Acordo',
        type: 'CONTRACT',
        responsibleId: 2,
        status: 'VALID',
        version: 2,
      });
    });

    it('lista só a última versão e marca validade vencida como EXPIRED', async () => {
      mockPrisma.funderDocument.findMany.mockResolvedValue([
        { id: 'd2', name: 'Acordo', version: 2, status: 'VALID', validUntil: new Date('2020-01-01') },
        { id: 'd1', name: 'Acordo', version: 1, status: 'VALID', validUntil: null },
        { id: 'd3', name: 'Orçamento', version: 1, status: 'VALID', validUntil: null },
      ]);
      const r = await service.getDocuments('fun-1');
      expect(r.map(d => d.id)).toEqual(['d2', 'd3']);
      expect(r[0].status).toBe('EXPIRED');
      expect(await service.getDocuments('fun-1', true)).toHaveLength(3);
    });

    it('remover documento inexistente devolve 404', async () => {
      mockPrisma.funderDocument.findFirst.mockResolvedValue(null);
      await expect(service.removeDocument('fun-1', 'x', 1)).rejects.toThrow(NotFoundException);
    });
  });

  describe('§17 responsável interno', () => {
    beforeEach(() => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 9 });
      mockPrisma.funder.update.mockResolvedValue({});
    });

    it('define assignedAt automaticamente quando o gestor muda', async () => {
      await service.updateResponsible('fun-1', { assignedToId: 9 }, 3);
      const data = mockPrisma.funder.update.mock.calls[0][0].data;
      expect(data.assignedAt).toBeInstanceOf(Date);
      expect(data.updatedById).toBe(3);
    });

    it('não mexe em assignedAt se o gestor é o mesmo', async () => {
      await service.updateResponsible('fun-1', { assignedToId: 1, internalTeam: 'A' }, 3);
      expect(mockPrisma.funder.update.mock.calls[0][0].data.assignedAt).toBeUndefined();
    });

    it('rejeita responsável financeiro inexistente', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.updateResponsible('fun-1', { financialManagerId: 99 }, 1),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.funder.update).not.toHaveBeenCalled();
    });

    it('financiador removido devolve 404', async () => {
      mockPrisma.funder.findUnique.mockResolvedValue({ deletedAt: new Date() });
      await expect(service.getResponsible('fun-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('§18 notas, tags e campos personalizados', () => {
    it('normaliza tags: apara, ignora vazias e deduplica sem maiúsculas', async () => {
      mockPrisma.funder.update.mockResolvedValue({});
      await service.updateNotes('fun-1', { tags: [' ONG ', 'ong', '', 'Saúde'] }, 1);
      expect(mockPrisma.funder.update.mock.calls[0][0].data.tags).toEqual(['ONG', 'Saúde']);
    });

    it('chave apagada continua reservada', async () => {
      mockPrisma.funderCustomFieldDefinition.findUnique.mockResolvedValue({ id: 'old' });
      await expect(
        service.createCustomFieldDefinition({ key: 'idioma', label: 'Idioma' }, 1),
      ).rejects.toThrow(BadRequestException);
    });

    it('SELECT exige opções e TEXT não as aceita', async () => {
      await expect(
        service.createCustomFieldDefinition({ key: 'ab', label: 'x', type: 'SELECT' as any }, 1),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.createCustomFieldDefinition({ key: 'ab', label: 'x', options: ['a'] }, 1),
      ).rejects.toThrow(BadRequestException);
    });

    describe('valores', () => {
      beforeEach(() => {
        mockPrisma.funderCustomFieldDefinition.findMany.mockResolvedValue([
          { key: 'nivel', type: 'SELECT', options: ['A', 'B'], required: true },
          { key: 'anos', type: 'NUMBER', options: [], required: false },
        ]);
        mockPrisma.funder.update.mockResolvedValue({});
      });

      it('valida o tipo e a opção', async () => {
        await expect(service.setCustomFieldValues('fun-1', { anos: '3' }, 1)).rejects.toThrow(
          BadRequestException,
        );
        await expect(service.setCustomFieldValues('fun-1', { nivel: 'C' }, 1)).rejects.toThrow(
          BadRequestException,
        );
      });

      it('rejeita chave desconhecida e remoção de obrigatório', async () => {
        await expect(service.setCustomFieldValues('fun-1', { zzz: 1 }, 1)).rejects.toThrow(
          BadRequestException,
        );
        await expect(service.setCustomFieldValues('fun-1', { nivel: null }, 1)).rejects.toThrow(
          BadRequestException,
        );
      });

      it('grava valores válidos fundindo com os existentes', async () => {
        mockPrisma.funder.findUnique.mockResolvedValue({ ...funder, customFields: { anos: 2 } });
        await service.setCustomFieldValues('fun-1', { nivel: 'A' }, 1);
        expect(mockPrisma.funder.update.mock.calls[0][0].data.customFields).toEqual({
          anos: 2,
          nivel: 'A',
        });
      });

      it('lista obrigatórios em falta', async () => {
        const r = await service.getCustomFieldValues('fun-1');
        expect(r.missingRequired).toEqual(['nivel']);
      });
    });
  });

  describe('§19 privacidade e controlo', () => {
    it('sem registo = tudo negado', async () => {
      mockPrisma.funderConsent.findUnique.mockResolvedValue(null);
      const r: any = await service.getConsent('fun-1');
      expect(r.emailAllowed).toBe(false);
      expect(r.reportComms).toBe(false);
      expect(r.consentDate).toBeNull();
    });

    it('consentDate automático ao conceder, e não ao só negar', async () => {
      mockPrisma.funderConsent.upsert.mockResolvedValue({ id: 'c1' });
      mockPrisma.funder.update.mockResolvedValue({});
      await service.upsertConsent('fun-1', { emailAllowed: true }, 4);
      expect(mockPrisma.funderConsent.upsert.mock.calls[0][0].update).toMatchObject({
        emailAllowed: true,
        updatedById: 4,
      });
      expect(mockPrisma.funderConsent.upsert.mock.calls[0][0].update.consentDate).toBeInstanceOf(
        Date,
      );

      await service.upsertConsent('fun-1', { emailAllowed: false }, 4);
      expect(
        mockPrisma.funderConsent.upsert.mock.calls[1][0].update.consentDate,
      ).toBeUndefined();
    });

    it('record-info devolve criador e último editor', async () => {
      mockPrisma.funder.findUnique.mockResolvedValue({
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        updatedById: 5,
        createdBy: { id: 1, fullName: 'A' },
      });
      mockPrisma.user.findUnique.mockResolvedValue({ id: 5, fullName: 'B' });
      const r = await service.getRecordInfo('fun-1');
      expect(r.createdBy).toEqual({ id: 1, fullName: 'A' });
      expect(r.updatedBy).toEqual({ id: 5, fullName: 'B' });
    });

    it('changelog filtra pelo id do financiador e faz parse do metadata', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([
        { id: 1, action: 'UPDATE', entity: 'FunderNotes', metadata: '{"funderId":"fun-1"}' },
        { id: 2, action: 'CREATE', entity: 'Funder', metadata: 'not-json' },
      ]);
      mockPrisma.auditLog.count.mockResolvedValue(2);
      const r = await service.getChangeLog('fun-1', {});
      expect(mockPrisma.auditLog.findMany.mock.calls[0][0].where.metadata).toEqual({
        contains: 'fun-1',
      });
      expect(r.data[0].details).toEqual({ funderId: 'fun-1' });
      expect(r.data[1].details).toBe('not-json');
      expect(r.total).toBe(2);
    });
  });
});
