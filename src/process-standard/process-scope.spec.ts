import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { ProcessStandardService } from './process-standard.service';
import { inDepartmentScope, instanceScopeWhere, processScope } from './process-scope';

const u = (role: string, id = 1, departmentId: number | null = null): any => ({
  id,
  role: { name: role },
  departmentId,
});

describe('process-scope (§20)', () => {
  it('ADMIN/RH/AUDITOR têm âmbito total', () => {
    for (const r of ['ADMIN', 'RH', 'AUDITOR']) {
      expect(processScope(u(r)).fullAccess).toBe(true);
      expect(instanceScopeWhere(u(r))).toEqual({});
    }
  });

  it('GESTOR fica limitado ao departamento e sub-departamentos directos', () => {
    const g = u('GESTOR', 7, 10);
    const where: any = instanceScopeWhere(g);
    expect(where.OR).toEqual(
      expect.arrayContaining([{ departmentId: 10 }, { department: { parentId: 10 } }]),
    );
    expect(inDepartmentScope(g, { id: 10, parentId: null })).toBe(true);
    expect(inDepartmentScope(g, { id: 11, parentId: 10 })).toBe(true);
    expect(inDepartmentScope(g, { id: 12, parentId: 99 })).toBe(false);
    expect(inDepartmentScope(g, null)).toBe(false);
  });

  it('GESTOR sem departamento só vê as suas participações', () => {
    const g = u('GESTOR', 7, null);
    const where: any = instanceScopeWhere(g);
    expect(where.OR.some((c: any) => 'departmentId' in c)).toBe(false);
    expect(inDepartmentScope(g, { id: 10, parentId: null })).toBe(false);
  });

  it('COLABORADOR só vê participações', () => {
    const where: any = instanceScopeWhere(u('COLABORADOR', 5));
    expect(where.OR).toContainEqual({ targetUserId: 5 });
    expect(inDepartmentScope(u('COLABORADOR', 5, 10), { id: 10, parentId: null })).toBe(false);
  });
});

describe('ProcessStandardService.startInstance — autorização e dados obrigatórios (§19/§20)', () => {
  const prisma: any = {
    user: { findUnique: jest.fn() },
    processInstance: { findFirst: jest.fn().mockResolvedValue(null) },
  };
  const service = new ProcessStandardService(prisma);
  const tpl = (accessRoles: string[], involvedModules: string[] = []) => ({
    id: 1,
    status: 'ACTIVE',
    effectiveFrom: null,
    accessRoles,
    involvedModules,
    steps: [],
  });

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue({
      departmentId: 20,
      unitId: null,
      department: { id: 20, parentId: null },
    });
  });

  it('COLABORADOR não inicia em modelo não aberto à sua função', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue(tpl([]) as any);
    await expect(service.startInstance(1, 5, {}, u('COLABORADOR', 5))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('COLABORADOR não inicia em nome de outro', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue(tpl(['COLABORADOR']) as any);
    await expect(
      service.startInstance(1, 5, { targetUserId: 9 }, u('COLABORADOR', 5)),
    ).rejects.toThrow(ForbiddenException);
  });

  it('GESTOR não inicia para colaborador de outro departamento', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue(tpl([]) as any);
    await expect(
      service.startInstance(1, 7, { targetUserId: 9 }, u('GESTOR', 7, 10)),
    ).rejects.toThrow(/âmbito departamental/);
  });

  it('exige colaborador e identificador da entidade ao perfil de gestão', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue(tpl([], []) as any);
    await expect(
      service.startInstance(1, 1, { sourceModule: 'Courses' }, u('ADMIN', 1), {
        validateRequirements: true,
      }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.startInstance(1, 1, { sourceModule: 'Users' }, u('ADMIN', 1), {
        validateRequirements: true,
      }),
    ).rejects.toThrow(/colaborador/);
  });

  it('getStartRequirements usa o módulo escolhido ou o primeiro do modelo', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue(tpl([], ['Courses']) as any);
    expect((await service.getStartRequirements(1)).entityType).toBe('Curso');
    expect((await service.getStartRequirements(1, 'Onboarding')).collaborator).toBe(true);
  });
});
