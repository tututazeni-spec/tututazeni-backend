import { buildOverview, OverviewInstanceRow, OverviewStepRow } from './process-overview';

const NOW = new Date('2026-06-15T12:00:00Z');
const d = (iso: string) => new Date(iso);

const inst = (over: Partial<OverviewInstanceRow> = {}): OverviewInstanceRow => ({
  status: 'IN_PROGRESS',
  startedAt: d('2026-06-01T00:00:00Z'),
  completedAt: null,
  slaDeadline: null,
  sourceModule: null,
  process: { category: 'RH', department: { id: 1, name: 'RH' } },
  ...over,
});

const step = (over: Partial<OverviewStepRow> = {}): OverviewStepRow => ({
  status: 'PENDING',
  slaDeadline: null,
  completedAt: null,
  step: { id: 1, title: 'Validar', type: 'TASK', responsible: { id: 7, fullName: 'Ana' } },
  ...over,
});

describe('buildOverview', () => {
  it('devolve zeros e nulls sem dados', () => {
    const r = buildOverview([], [], 0, NOW);
    expect(r.kpis).toEqual({
      total: 0,
      running: 0,
      overdue: 0,
      completed: 0,
      pendingApprovals: 0,
      avgDurationHours: null,
      onTimeRate: null,
    });
    expect(r.alerts).toEqual([]);
    expect(r.charts.byStatus).toEqual([]);
  });

  it('conta em atraso só entre IN_PROGRESS com prazo ultrapassado', () => {
    const r = buildOverview(
      [
        inst({ slaDeadline: d('2026-06-10T00:00:00Z') }),
        inst({ slaDeadline: d('2026-06-20T00:00:00Z') }),
        inst({ status: 'CANCELLED', slaDeadline: d('2026-06-10T00:00:00Z') }),
      ],
      [],
      0,
      NOW,
    );
    expect(r.kpis.running).toBe(2);
    expect(r.kpis.overdue).toBe(1);
  });

  it('tempo médio e cumprimento de prazo só consideram concluídas', () => {
    const r = buildOverview(
      [
        inst({
          status: 'COMPLETED',
          startedAt: d('2026-06-01T00:00:00Z'),
          completedAt: d('2026-06-01T10:00:00Z'),
          slaDeadline: d('2026-06-01T12:00:00Z'),
        }),
        inst({
          status: 'COMPLETED',
          startedAt: d('2026-06-02T00:00:00Z'),
          completedAt: d('2026-06-02T20:00:00Z'),
          slaDeadline: d('2026-06-02T12:00:00Z'),
        }),
        inst({
          status: 'CANCELLED',
          startedAt: d('2026-06-01T00:00:00Z'),
          completedAt: d('2026-06-05T00:00:00Z'),
        }),
      ],
      [],
      0,
      NOW,
    );
    expect(r.kpis.completed).toBe(2);
    expect(r.kpis.avgDurationHours).toBe(15);
    expect(r.kpis.onTimeRate).toBe(50);
    expect(r.charts.onTimeRateByMonth).toEqual([{ month: '2026-06', rate: 50 }]);
  });

  it('agrupa por módulo de origem e departamento', () => {
    const r = buildOverview(
      [
        inst({ sourceModule: 'Users' }),
        inst({ sourceModule: 'Users' }),
        inst({ sourceModule: null, process: { category: null, department: null } }),
      ],
      [],
      0,
      NOW,
    );
    expect(r.charts.bySourceModule).toEqual([
      { label: 'Users', count: 2 },
      { label: 'Não indicado', count: 1 },
    ]);
    expect(r.charts.byDepartment).toContainEqual({ label: 'Sem departamento', count: 1 });
  });

  it('série mensal limita-se aos últimos 12 meses, ordenada', () => {
    const rows = Array.from({ length: 14 }, (_, i) =>
      inst({ startedAt: new Date(Date.UTC(2025, i, 5)) }),
    );
    const r = buildOverview(rows, [], 0, NOW);
    expect(r.charts.createdVsCompleted).toHaveLength(12);
    expect(r.charts.createdVsCompleted[0].month).toBe('2025-03');
  });

  it('etapas atrasadas: pendentes fora do prazo e concluídas tarde', () => {
    const r = buildOverview(
      [],
      [
        step({ slaDeadline: d('2026-06-10T00:00:00Z') }),
        step({
          status: 'COMPLETED',
          slaDeadline: d('2026-06-10T00:00:00Z'),
          completedAt: d('2026-06-11T00:00:00Z'),
        }),
        step({
          status: 'COMPLETED',
          slaDeadline: d('2026-06-10T00:00:00Z'),
          completedAt: d('2026-06-09T00:00:00Z'),
        }),
      ],
      0,
      NOW,
    );
    expect(r.charts.mostDelayedSteps).toEqual([{ title: 'Validar', count: 2 }]);
  });

  it('carga por responsável conta só etapas pendentes', () => {
    const r = buildOverview([], [step(), step(), step({ status: 'COMPLETED' })], 0, NOW);
    expect(r.charts.workloadByResponsible).toEqual([{ label: 'Ana', count: 2 }]);
  });

  it('aprovações pendentes somam revisões de modelo e etapas REVIEW', () => {
    const r = buildOverview(
      [],
      [step({ step: { id: 2, title: 'Rever', type: 'REVIEW', responsible: null } })],
      3,
      NOW,
    );
    expect(r.kpis.pendingApprovals).toBe(4);
    expect(r.alerts).toContainEqual({
      level: 'info',
      message: 'Aprovações pendentes de decisão',
      count: 4,
    });
  });

  it('gera alertas de atraso e de prazos próximos', () => {
    const r = buildOverview(
      [inst({ slaDeadline: d('2026-06-10T00:00:00Z') })],
      [step({ slaDeadline: d('2026-06-16T00:00:00Z') })],
      0,
      NOW,
    );
    expect(r.alerts.map(a => a.level)).toEqual(['danger', 'warning']);
  });
});
