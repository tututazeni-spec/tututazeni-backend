import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CrmPartnersService } from './crm-partners.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';

const partner = {
  id: 'par-1',
  deletedAt: null,
  country: 'Angola',
  province: 'LUANDA',
  municipality: 'Luanda',
  address: 'Rua A',
  customFields: null as Record<string, unknown> | null,
};

const mockPrisma: Record<string, any> = {
  partner: { findUnique: jest.fn(), update: jest.fn() },
  user: { findUnique: jest.fn() },
  partnerLocation: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  partnerConsent: { findUnique: jest.fn(), upsert: jest.fn() },
  partnerCustomFieldDefinition: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
};
const mockAudit = { logEntity: jest.fn() };

describe('CrmPartnersService — §14 localizações, §15 responsável, §16 consentimentos, §17 campos personalizados', () => {
  let service: CrmPartnersService;

  beforeEach(async () => {
    Object.defineProperty(mockPrisma, 'read', { get: () => mockPrisma, configurable: true });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CrmPartnersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();
    service = module.get(CrmPartnersService);
    jest.resetAllMocks();
    mockPrisma.partner.findUnique.mockResolvedValue({ ...partner });
  });

  describe('localizações', () => {
    it('devolve a sede do parceiro + filiais e as províncias abrangidas sem duplicados', async () => {
      mockPrisma.partnerLocation.findMany.mockResolvedValue([
        { id: 'l1', province: 'BENGUELA' },
        { id: 'l2', province: 'LUANDA' },
        { id: 'l3', province: null },
      ]);
      const res = await service.getLocations('par-1');
      expect(res.headquarters).toEqual({
        country: 'Angola',
        province: 'LUANDA',
        municipality: 'Luanda',
        address: 'Rua A',
      });
      expect(res.provincesCovered.sort()).toEqual(['BENGUELA', 'LUANDA']);
    });

    it('rejeita registar uma sede como filial', async () => {
      await expect(
        service.addLocation('par-1', { name: 'X', type: 'HEADQUARTERS' } as any, 1),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.partnerLocation.create).not.toHaveBeenCalled();
    });

    it('404 ao actualizar localização de outro parceiro', async () => {
      mockPrisma.partnerLocation.findFirst.mockResolvedValue(null);
      await expect(service.updateLocation('par-1', 'l9', { name: 'Y' }, 1)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrisma.partnerLocation.findFirst.mock.calls[0][0].where).toMatchObject({
        id: 'l9',
        partnerId: 'par-1',
      });
    });
  });

  describe('responsável interno', () => {
    const current = {
      deletedAt: null,
      assignedToId: 5,
      assignedTo: null,
      internalUnit: null,
      internalDepartment: null,
      internalTeam: null,
      assignedAt: null,
      relationshipStatus: 'DEVELOPING',
    };

    it('actualiza assignedAt quando o gestor muda', async () => {
      mockPrisma.partner.findUnique.mockResolvedValue(current);
      mockPrisma.user.findUnique.mockResolvedValue({ id: 9 });
      mockPrisma.partner.update.mockResolvedValue({});
      await service.updateResponsible('par-1', { assignedToId: 9 }, 1);
      expect(mockPrisma.partner.update.mock.calls[0][0].data.assignedAt).toBeInstanceOf(Date);
    });

    it('não mexe em assignedAt se o gestor é o mesmo', async () => {
      mockPrisma.partner.findUnique.mockResolvedValue(current);
      mockPrisma.user.findUnique.mockResolvedValue({ id: 5 });
      mockPrisma.partner.update.mockResolvedValue({});
      await service.updateResponsible('par-1', { assignedToId: 5, internalTeam: 'T1' }, 1);
      expect(mockPrisma.partner.update.mock.calls[0][0].data).not.toHaveProperty('assignedAt');
    });

    it('rejeita gestor inexistente', async () => {
      mockPrisma.partner.findUnique.mockResolvedValue(current);
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.updateResponsible('par-1', { assignedToId: 999 }, 1)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('consentimentos', () => {
    it('sem registo devolve tudo negado (opt-in explícito)', async () => {
      mockPrisma.partnerConsent.findUnique.mockResolvedValue(null);
      const res: any = await service.getConsent('par-1');
      expect(res.emailAllowed).toBe(false);
      expect(res.consentDate).toBeNull();
    });

    it('define consentDate ao conceder e não ao apenas negar', async () => {
      mockPrisma.partnerConsent.upsert.mockResolvedValue({ id: 'c1' });
      await service.upsertConsent('par-1', { emailAllowed: true }, 1);
      expect(mockPrisma.partnerConsent.upsert.mock.calls[0][0].update.consentDate).toBeInstanceOf(
        Date,
      );

      await service.upsertConsent('par-1', { emailAllowed: false, notes: 'revogou' }, 1);
      const update = mockPrisma.partnerConsent.upsert.mock.calls[1][0].update;
      expect(update).not.toHaveProperty('consentDate');
      expect(update.notes).toBe('revogou');
    });
  });

  describe('campos personalizados', () => {
    const defs = [
      { key: 'cert', type: 'SELECT', options: ['ISO 9001', 'ISO 14001'], required: true },
      { key: 'beneficiaries', type: 'NUMBER', options: [], required: false },
      { key: 'areas', type: 'MULTI_SELECT', options: ['A', 'B'], required: false },
    ];

    beforeEach(() => {
      mockPrisma.partnerCustomFieldDefinition.findMany.mockResolvedValue(defs);
      mockPrisma.partner.update.mockResolvedValue({});
    });

    it('guarda valores válidos fazendo merge com os existentes', async () => {
      mockPrisma.partner.findUnique.mockResolvedValue({
        ...partner,
        customFields: { cert: 'ISO 9001' },
      });
      await service.setCustomFieldValues('par-1', { beneficiaries: 5000, areas: ['A'] }, 1);
      expect(mockPrisma.partner.update.mock.calls[0][0].data.customFields).toEqual({
        cert: 'ISO 9001',
        beneficiaries: 5000,
        areas: ['A'],
      });
    });

    it.each([
      ['chave desconhecida', { nope: 1 }],
      ['tipo errado', { beneficiaries: '5000' }],
      ['opção inválida', { cert: 'ISO 0' }],
      ['multi-select com opção inválida', { areas: ['A', 'Z'] }],
      ['remover campo obrigatório', { cert: null }],
    ])('rejeita %s', async (_label, values) => {
      await expect(service.setCustomFieldValues('par-1', values as any, 1)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPrisma.partner.update).not.toHaveBeenCalled();
    });

    it('null remove um campo opcional', async () => {
      mockPrisma.partner.findUnique.mockResolvedValue({
        ...partner,
        customFields: { cert: 'ISO 9001', beneficiaries: 10 },
      });
      await service.setCustomFieldValues('par-1', { beneficiaries: null }, 1);
      expect(mockPrisma.partner.update.mock.calls[0][0].data.customFields).toEqual({
        cert: 'ISO 9001',
      });
    });

    it('lista obrigatórios em falta', async () => {
      const res = await service.getCustomFieldValues('par-1');
      expect(res.missingRequired).toEqual(['cert']);
    });

    it('rejeita chave duplicada (incluindo apagadas) e SELECT sem opções', async () => {
      mockPrisma.partnerCustomFieldDefinition.findUnique.mockResolvedValue({ id: 'x' });
      await expect(
        service.createCustomFieldDefinition({ key: 'cert', label: 'C' } as any, 1),
      ).rejects.toThrow(/Já existe/);
      await expect(
        service.createCustomFieldDefinition({ key: 'k2', label: 'C', type: 'SELECT' } as any, 1),
      ).rejects.toThrow(/opção/);
    });
  });
});
