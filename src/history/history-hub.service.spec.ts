import { ForbiddenException } from '@nestjs/common';
import { HistoryHubService, eventTypeOf } from './history-hub.service';
import { HistoryEventType, MovementType } from './history.dto';

type Fn = jest.Mock;

function makeService() {
  const read = {
    user: { findMany: jest.fn(), findUnique: jest.fn() } as Record<string, Fn>,
    orgChangeLog: { findMany: jest.fn() } as Record<string, Fn>,
    departmentTransferLog: { findMany: jest.fn() } as Record<string, Fn>,
    userAuditLog: { findMany: jest.fn() } as Record<string, Fn>,
    employeeCompensation: { findMany: jest.fn() } as Record<string, Fn>,
  };
  read.user.findMany.mockResolvedValue([]);
  read.orgChangeLog.findMany.mockResolvedValue([]);
  read.departmentTransferLog.findMany.mockResolvedValue([]);
  read.userAuditLog.findMany.mockResolvedValue([]);
  read.employeeCompensation.findMany.mockResolvedValue([]);
  const svc = new HistoryHubService({ read } as never);
  return { svc, read };
}

describe('eventTypeOf', () => {
  it.each([
    ['PROMOTION_APPROVED', HistoryEventType.PROMOTED],
    ['TRAINING_WAITLIST_PROMOTED', HistoryEventType.CHANGED],
    ['USER_DEACTIVATED', HistoryEventType.DEACTIVATED],
    ['USER_ACTIVATED', HistoryEventType.REACTIVATED],
    ['LEAVE_APPROVED', HistoryEventType.APPROVED],
    ['LEAVE_REJECTED', HistoryEventType.REJECTED],
    ['CREATE', HistoryEventType.CREATED],
    ['DELETE', HistoryEventType.DELETED],
    ['ARCHIVE', HistoryEventType.ARCHIVED],
    ['SOMETHING_ELSE', HistoryEventType.CHANGED],
  ])('%s → %s', (action, expected) => {
    expect(eventTypeOf(action)).toBe(expected);
  });
});

describe('HistoryHubService.assertCanViewUser', () => {
  it('ADMIN e RH vêem qualquer colaborador', async () => {
    const { svc, read } = makeService();
    await expect(
      svc.assertCanViewUser({ id: 1, role: { name: 'RH' } }, 9),
    ).resolves.toBeUndefined();
    expect(read.user.findUnique).not.toHaveBeenCalled();
  });

  it('o próprio vê-se a si mesmo', async () => {
    const { svc } = makeService();
    await expect(
      svc.assertCanViewUser({ id: 5, role: { name: 'COLABORADOR' } }, 5),
    ).resolves.toBeUndefined();
  });

  it('líder vê a sua equipa directa', async () => {
    const { svc, read } = makeService();
    read.user.findUnique.mockResolvedValue({ managerId: 2 });
    await expect(
      svc.assertCanViewUser({ id: 2, role: { name: 'LIDER' } }, 9),
    ).resolves.toBeUndefined();
  });

  it('líder NÃO vê colaborador de outra equipa', async () => {
    const { svc, read } = makeService();
    read.user.findUnique.mockResolvedValue({ managerId: 77 });
    await expect(
      svc.assertCanViewUser({ id: 2, role: { name: 'LIDER' } }, 9),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('HistoryHubService.getMovements', () => {
  it('junta OrgChangeLog, transferências, UserAuditLog e admissões/saídas reais', async () => {
    const { svc, read } = makeService();
    read.orgChangeLog.findMany.mockResolvedValue([
      {
        id: 1,
        userId: 10,
        changeType: 'HIRE',
        effectiveDate: new Date('2026-01-10'),
        performedById: 1,
        fromDepartment: null,
        toDepartment: { name: 'Comercial' },
        fromPosition: null,
        toPosition: { name: 'Vendedor' },
        fromManagerId: null,
        toManagerId: null,
        reason: null,
        notes: null,
      },
    ]);
    read.departmentTransferLog.findMany.mockResolvedValue([
      {
        id: 2,
        userId: 11,
        transferredAt: new Date('2026-03-01'),
        fromDepartment: { name: 'Comercial' },
        toDepartment: { name: 'Logística' },
        reason: 'Reorganização',
      },
    ]);
    read.userAuditLog.findMany.mockResolvedValue([
      {
        id: 3,
        userId: 12,
        performedById: 1,
        action: 'POSITION_CHANGED',
        meta: JSON.stringify({ from: 'Analista', to: 'Coordenador' }),
        createdAt: new Date('2026-04-01'),
      },
      // primeira activação (sem desactivação anterior) → NÃO é reactivação
      {
        id: 4,
        userId: 12,
        performedById: 12,
        action: 'USER_ACTIVATED',
        meta: null,
        createdAt: new Date('2026-02-01'),
      },
      // desactivada e depois reactivada → reactivação
      {
        id: 5,
        userId: 13,
        performedById: 1,
        action: 'USER_DEACTIVATED',
        meta: null,
        createdAt: new Date('2026-05-01'),
      },
      {
        id: 6,
        userId: 13,
        performedById: 1,
        action: 'USER_ACTIVATED',
        meta: null,
        createdAt: new Date('2026-06-01'),
      },
    ]);
    // hire de 10 já vem do OrgChangeLog → não duplica; 14 só tem hireDate
    read.user.findMany.mockImplementation(({ where }: { where?: Record<string, unknown> }) => {
      if (where && 'hireDate' in where)
        return Promise.resolve([
          { id: 10, hireDate: new Date('2026-01-10') },
          { id: 14, hireDate: new Date('2026-02-15') },
        ]);
      if (where && 'exitDate' in where)
        return Promise.resolve([{ id: 15, exitDate: new Date('2026-07-01') }]);
      return Promise.resolve([
        { id: 10, fullName: 'A' },
        { id: 11, fullName: 'B' },
        { id: 12, fullName: 'C' },
        { id: 13, fullName: 'D' },
        { id: 14, fullName: 'E' },
        { id: 15, fullName: 'F' },
        { id: 1, fullName: 'Admin' },
      ]);
    });

    const res = await svc.getMovements({ page: 1, limit: 50 });
    const byType = (t: MovementType) => res.data.filter(m => m.type === t);

    expect(
      byType(MovementType.ADMISSION)
        .map(m => m.employee?.fullName)
        .sort(),
    ).toEqual(['A', 'E']);
    expect(byType(MovementType.TRANSFER)[0]).toMatchObject({
      prevDepartment: 'Comercial',
      newDepartment: 'Logística',
      reason: 'Reorganização',
    });
    expect(byType(MovementType.POSITION_CHANGE)[0]).toMatchObject({
      prevPosition: 'Analista',
      newPosition: 'Coordenador',
      registeredBy: { fullName: 'Admin' },
    });
    expect(byType(MovementType.REACTIVATION)).toHaveLength(1);
    expect(byType(MovementType.REACTIVATION)[0].employee?.fullName).toBe('D');
    expect(byType(MovementType.EXIT)).toHaveLength(1);
    // a admissão derivada só de hireDate não inventa cargo/departamento
    const hireOnly = byType(MovementType.ADMISSION).find(m => m.employee?.fullName === 'E');
    expect(hireOnly?.newDepartment).toBeNull();
    expect(hireOnly?.newPosition).toBeNull();
    expect(res.total).toBe(res.data.length);
  });

  it('filtra por tipo de movimento', async () => {
    const { svc, read } = makeService();
    read.departmentTransferLog.findMany.mockResolvedValue([
      {
        id: 2,
        userId: 11,
        transferredAt: new Date('2026-03-01'),
        fromDepartment: null,
        toDepartment: { name: 'Logística' },
        reason: null,
      },
    ]);
    const res = await svc.getMovements({ movementType: MovementType.PROMOTION });
    expect(res.data).toHaveLength(0);
  });
});

describe('HistoryHubService.salaryChanges', () => {
  it('só conta como alteração quando o salário base muda face ao registo anterior do mesmo colaborador', async () => {
    const { svc, read } = makeService();
    read.employeeCompensation.findMany.mockResolvedValue([
      { id: 1, userId: 1, effectiveFrom: new Date('2025-01-01'), baseSalary: 100 },
      { id: 2, userId: 1, effectiveFrom: new Date('2026-01-01'), baseSalary: 120 },
      { id: 3, userId: 1, effectiveFrom: new Date('2026-06-01'), baseSalary: 120 },
      { id: 4, userId: 2, effectiveFrom: new Date('2026-01-01'), baseSalary: 90 },
    ]);
    const changes = await svc.salaryChanges({});
    expect(changes).toEqual([{ id: 2, userId: 1, at: new Date('2026-01-01'), from: 100, to: 120 }]);
  });
});
