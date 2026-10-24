import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { writeChainedAuditLog } from '../common/helpers/audit-chain';

jest.mock('../common/helpers/audit-chain', () => ({
  writeChainedAuditLog: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../common/helpers/tenant.helper', () => ({
  resolveDefaultTenantId: jest.fn().mockResolvedValue(1),
}));

const audit = writeChainedAuditLog as jest.Mock;
const DAY = 86_400_000;

describe('SettingsService', () => {
  let prisma: any;
  let service: SettingsService;

  const tenant = (over: object = {}) => ({
    id: 1,
    tenantCode: 'INNOVA',
    tenantName: 'Innova Lda',
    platformName: null,
    logoUrl: 'data:logo',
    faviconUrl: null,
    primaryColor: '#0F1F3D',
    defaultLanguage: 'pt',
    defaultTimezone: 'Africa/Luanda',
    defaultCurrency: 'AOA',
    dateFormat: 'DD/MM/YYYY',
    timeFormat: '24h',
    numberFormat: 'pt',
    nif: '5000000000',
    address: 'Rua X',
    phone: '+244',
    contactEmail: 'geral@x',
    website: null,
    sector: 'TI',
    country: 'AO',
    emailDomain: null,
    emailPattern: null,
    emailPolicyMode: 'SUGGEST',
    maxUsers: 100,
    userPolicyJson: null,
    updatedAt: new Date(),
    ...over,
  });
  const withTenant = (over: object = {}) =>
    prisma.tenantConfig.findUniqueOrThrow.mockResolvedValue(tenant(over));
  const withPolicy = (policy: object) => withTenant({ userPolicyJson: JSON.stringify(policy) });

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      tenantConfig: { findUniqueOrThrow: jest.fn(), update: jest.fn().mockResolvedValue({}) },
      role: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      department: { count: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      roleDepartmentScope: {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn().mockReturnValue('DEL'),
        createMany: jest.fn().mockReturnValue('CREATE'),
      },
      user: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
      refreshToken: { groupBy: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    prisma.read = prisma;
    withTenant();
    service = new SettingsService(prisma);
  });

  describe('getBranding / getOrganization', () => {
    it('branding só expõe o não sensível (sem NIF, morada, contactos)', async () => {
      const b = await service.getBranding();
      expect(b).toMatchObject({ tenantName: 'Innova Lda', primaryColor: '#0F1F3D' });
      for (const k of ['nif', 'address', 'phone', 'contactEmail', 'maxUsers', 'userPolicyJson']) {
        expect(b).not.toHaveProperty(k);
      }
    });

    it('platformName cai no nome da organização', async () => {
      expect((await service.getBranding()).platformName).toBe('Innova Lda');
      withTenant({ platformName: 'Academia' });
      expect((await service.getBranding()).platformName).toBe('Academia');
    });

    it('a vista de admin inclui os dados fiscais mas não a política interna', async () => {
      const o = await service.getOrganization();
      expect(o).toMatchObject({ nif: '5000000000', emailPolicyMode: 'SUGGEST' });
      expect(o).not.toHaveProperty('userPolicyJson');
    });

    it('getEmailPolicy devolve só as três chaves da política', async () => {
      withTenant({ emailDomain: 'innova.ao', emailPattern: 'p.a', emailPolicyMode: 'ENFORCE' });
      await expect(service.getEmailPolicy()).resolves.toEqual({
        emailDomain: 'innova.ao',
        emailPattern: 'p.a',
        emailPolicyMode: 'ENFORCE',
      });
    });
  });

  describe('updateOrganization', () => {
    const data = () => prisma.tenantConfig.update.mock.calls[0][0].data;

    it('grava só o que veio no payload', async () => {
      await service.updateOrganization({ tenantName: 'Novo', phone: undefined } as never, 4);
      expect(data()).toEqual({ tenantName: 'Novo' });
    });

    it('normaliza o domínio de email (minúsculas, sem @ nem espaços)', async () => {
      await service.updateOrganization({ emailDomain: '  @Innova.AO ' } as never);
      expect(data().emailDomain).toBe('innova.ao');
    });

    it('domínio vazio desactiva a regra (null), ao contrário dos outros campos', async () => {
      await service.updateOrganization({ emailDomain: '' } as never);
      expect(data().emailDomain).toBeNull();
    });

    it('payload vazio não escreve na base de dados', async () => {
      await service.updateOrganization({} as never, 4);
      expect(prisma.tenantConfig.update).not.toHaveBeenCalled();
    });

    it('a auditoria não guarda o logo (data-URL grande), só que mudou', async () => {
      await service.updateOrganization(
        { logoUrl: 'data:image/png;base64,AAAA', tenantName: 'N' } as never,
        4,
      );
      const meta = JSON.parse(audit.mock.calls[0][1].metadata);
      expect(meta).toEqual({ tenantName: 'N', logoChanged: true });
      expect(audit.mock.calls[0][1].metadata).not.toContain('AAAA');
    });
  });

  describe('política de utilizadores', () => {
    const saved = () => JSON.parse(prisma.tenantConfig.update.mock.calls[0][0].data.userPolicyJson);

    it('getUserPolicy junta as opções de campos obrigatórios', async () => {
      const p = await service.getUserPolicy();
      expect(p.requiredFieldOptions).toContain('phone');
      expect(p.invitesEnabled).toBe(true);
    });

    it('defaultRoleId inexistente → 400 e nada é gravado', async () => {
      prisma.role.findUnique.mockResolvedValue(null);
      await expect(service.updateUserPolicy({ defaultRoleId: 99 } as never)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.tenantConfig.update).not.toHaveBeenCalled();
    });

    it('defaultRoleId existente é aceite', async () => {
      prisma.role.findUnique.mockResolvedValue({ id: 3 });
      await service.updateUserPolicy({ defaultRoleId: 3 } as never);
      expect(saved().defaultRoleId).toBe(3);
    });

    it('normaliza domínios: minúsculas, sem @, sem espaços, sem vazios e sem duplicados', async () => {
      await service.updateUserPolicy({
        allowedEmailDomains: ['@Innova.AO', ' innova.ao ', '', '   ', 'OUTRA.com'],
      } as never);
      expect(saved().allowedEmailDomains).toEqual(['innova.ao', 'outra.com']);
    });

    it('ignora campos undefined e mantém os restantes', async () => {
      withPolicy({ inactiveAfterDays: 30, invitationExpiryDays: 3 });
      await service.updateUserPolicy(
        { invitesEnabled: false, inactiveAfterDays: undefined } as never,
        4,
      );
      expect(saved()).toMatchObject({
        invitesEnabled: false,
        inactiveAfterDays: 30,
        invitationExpiryDays: 3,
      });
    });

    it('audita antes e depois', async () => {
      await service.updateUserPolicy({ invitesEnabled: false } as never, 4);
      expect(audit.mock.calls[0][1]).toMatchObject({
        userId: 4,
        action: 'SETTINGS_USER_POLICY_UPDATE',
      });
    });
  });

  describe('âmbito por departamento', () => {
    it('getDepartmentScopes associa os departamentos a cada função', async () => {
      prisma.role.findMany.mockResolvedValue([
        { id: 1, name: 'RH' },
        { id: 2, name: 'ADMIN' },
      ]);
      prisma.department.findMany.mockResolvedValue([{ id: 10, name: 'TI' }]);
      prisma.roleDepartmentScope.findMany.mockResolvedValue([
        { roleId: 1, departmentId: 10 },
        { roleId: 1, departmentId: 11 },
      ]);
      const v = await service.getDepartmentScopes();
      expect(v.roles).toEqual([
        { id: 1, name: 'RH', departmentIds: [10, 11] },
        { id: 2, name: 'ADMIN', departmentIds: [] },
      ]);
    });

    describe('setDepartmentScope', () => {
      beforeEach(() => prisma.role.findUnique.mockResolvedValue({ id: 1, name: 'RH' }));

      it('função inexistente → 404', async () => {
        prisma.role.findUnique.mockResolvedValue(null);
        await expect(service.setDepartmentScope(9, [1], 4)).rejects.toBeInstanceOf(
          NotFoundException,
        );
        expect(prisma.$transaction).not.toHaveBeenCalled();
      });

      it('departamento inexistente → 400 (nada é apagado)', async () => {
        prisma.department.count.mockResolvedValue(1);
        await expect(service.setDepartmentScope(1, [10, 11], 4)).rejects.toBeInstanceOf(
          BadRequestException,
        );
        expect(prisma.$transaction).not.toHaveBeenCalled();
      });

      it('remove duplicados e substitui o âmbito numa transacção (apagar + criar)', async () => {
        prisma.department.count.mockResolvedValue(2);
        await expect(service.setDepartmentScope(1, [10, 11, 10], 4)).resolves.toEqual({
          roleId: 1,
          departmentIds: [10, 11],
        });
        expect(prisma.department.count).toHaveBeenCalledWith({ where: { id: { in: [10, 11] } } });
        expect(prisma.$transaction).toHaveBeenCalledWith(['DEL', 'CREATE']);
        expect(prisma.roleDepartmentScope.createMany).toHaveBeenCalledWith({
          data: [
            { roleId: 1, departmentId: 10 },
            { roleId: 1, departmentId: 11 },
          ],
        });
      });

      it('lista vazia remove a restrição (todos os departamentos) sem validar departamentos', async () => {
        await service.setDepartmentScope(1, [], 4);
        expect(prisma.department.count).not.toHaveBeenCalled();
        expect(prisma.roleDepartmentScope.createMany).toHaveBeenCalledWith({ data: [] });
      });

      it('audita a função e os departamentos', async () => {
        prisma.department.count.mockResolvedValue(1);
        await service.setDepartmentScope(1, [10], 4);
        expect(audit.mock.calls[0][1]).toMatchObject({
          action: 'SETTINGS_ROLE_DEPARTMENT_SCOPE',
          entityId: 1,
        });
        expect(JSON.parse(audit.mock.calls[0][1].metadata)).toEqual({
          role: 'RH',
          departmentIds: [10],
        });
      });
    });

    describe('getScopeForRole', () => {
      it.each([null, undefined, 0])('função %p → sem restrição', async roleId => {
        await expect(service.getScopeForRole(roleId as never)).resolves.toBeNull();
        expect(prisma.roleDepartmentScope.findMany).not.toHaveBeenCalled();
      });

      it('sem linhas → null (sem restrição); com linhas → ids', async () => {
        await expect(service.getScopeForRole(1)).resolves.toBeNull();
        prisma.roleDepartmentScope.findMany.mockResolvedValue([
          { departmentId: 4 },
          { departmentId: 5 },
        ]);
        await expect(service.getScopeForRole(1)).resolves.toEqual([4, 5]);
      });
    });
  });

  describe('applyUserPolicy', () => {
    it('sem política devolve o payload tal como está', async () => {
      const p = { email: 'a@b.c', roleId: 2 };
      await expect(service.applyUserPolicy(p)).resolves.toEqual(p);
    });

    it('convites desactivados → 400 só para convites, não para criação directa', async () => {
      withPolicy({ invitesEnabled: false });
      await expect(service.applyUserPolicy({ email: 'a@b.c' }, { invite: true })).rejects.toThrow(
        /Convites de utilizadores desactivados/,
      );
      await expect(service.applyUserPolicy({ email: 'a@b.c' })).resolves.toBeDefined();
    });

    it('aplica a função por omissão quando o payload não traz roleId', async () => {
      withPolicy({ defaultRoleId: 7 });
      await expect(service.applyUserPolicy({ email: 'a@b.c' })).resolves.toEqual({
        email: 'a@b.c',
        roleId: 7,
      });
    });

    it('um roleId explícito não é substituído pelo por omissão', async () => {
      withPolicy({ defaultRoleId: 7 });
      await expect(service.applyUserPolicy({ email: 'a@b.c', roleId: 2 })).resolves.toMatchObject({
        roleId: 2,
      });
    });

    it('criação directa exige todos os campos obrigatórios', async () => {
      withPolicy({ requiredFields: ['phone', 'departmentId'] });
      const err = await service.applyUserPolicy({ email: 'a@b.c' }).catch(e => e);
      expect(err).toBeInstanceOf(BadRequestException);
      expect(err.getResponse().message).toHaveLength(2);
    });

    it('o convite só exige função e departamento (o resto completa-se depois)', async () => {
      withPolicy({ requiredFields: ['phone', 'nif', 'departmentId'] });
      const err = await service
        .applyUserPolicy({ email: 'a@b.c' } as { email: string; roleId?: number }, { invite: true })
        .catch(e => e);
      expect(err.getResponse().message).toEqual([expect.stringContaining('departmentId')]);
    });

    it('restringe o domínio do email em convites e criações', async () => {
      withPolicy({ allowedEmailDomains: ['innova.ao'] });
      const err = await service.applyUserPolicy({ email: 'x@evil.com' }).catch(e => e);
      expect(err).toBeInstanceOf(BadRequestException);
      expect(err.getResponse().message).toEqual([
        expect.stringContaining('Domínio de email não autorizado: evil.com'),
      ]);
      await expect(service.applyUserPolicy({ email: 'x@innova.ao' })).resolves.toBeDefined();
    });
  });

  describe('listInactiveUsers', () => {
    const user = (id: number, daysOld: number) => ({
      id,
      fullName: `U${id}`,
      email: `u${id}@x`,
      createdAt: new Date(Date.now() - daysOld * DAY),
    });

    it('sem candidatos não consulta os tokens', async () => {
      await expect(service.listInactiveUsers()).resolves.toEqual({
        thresholdDays: 90,
        total: 0,
        items: [],
      });
      expect(prisma.refreshToken.groupBy).not.toHaveBeenCalled();
    });

    it('só considera contas activas criadas antes do limite', async () => {
      await service.listInactiveUsers(30);
      const where = prisma.user.findMany.mock.calls[0][0].where;
      expect(where).toMatchObject({ active: true, accountStatus: 'ACTIVE' });
      expect(where.createdAt.lt).toBeInstanceOf(Date);
    });

    it('inclui quem nunca fez login e quem fez há mais tempo que o limite; exclui quem entrou há pouco', async () => {
      prisma.user.findMany.mockResolvedValue([user(1, 400), user(2, 400), user(3, 400)]);
      prisma.refreshToken.groupBy.mockResolvedValue([
        { userId: 2, _max: { createdAt: new Date(Date.now() - 200 * DAY) } }, // antigo → inactivo
        { userId: 3, _max: { createdAt: new Date(Date.now() - 5 * DAY) } }, // recente → activo
      ]);
      const res = await service.listInactiveUsers();
      expect(res.items.map(i => i.id)).toEqual([1, 2]);
      expect(res.items[0].lastLoginAt).toBeNull();
      expect(res.total).toBe(2);
    });

    it('usa o limite da política, ou o indicado no pedido quando existe', async () => {
      withPolicy({ inactiveAfterDays: 45 });
      expect((await service.listInactiveUsers()).thresholdDays).toBe(45);
      expect((await service.listInactiveUsers(10)).thresholdDays).toBe(10);
    });

    it('limita a 500 candidatos', async () => {
      await service.listInactiveUsers();
      expect(prisma.user.findMany.mock.calls[0][0].take).toBe(500);
    });
  });

  describe('getUsersOverview', () => {
    it('conta por estado; suspensos incluem bloqueados; devolve o limite de utilizadores', async () => {
      prisma.user.count
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(80)
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(5);
      await expect(service.getUsersOverview()).resolves.toEqual({
        total: 100,
        active: 80,
        pending: 5,
        inactive: 10,
        suspended: 5,
        maxUsers: 100,
      });
      expect(prisma.user.count).toHaveBeenLastCalledWith({
        where: { accountStatus: { in: ['SUSPENDED', 'BLOCKED'] } },
      });
    });
  });
});
