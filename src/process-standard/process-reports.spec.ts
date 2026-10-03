import {
  buildIndicators,
  groupInstances,
  indicatorSets,
  ReportInput,
  ReportInstance,
} from './process-reports';

const NOW = new Date('2026-10-05T10:00:00Z');
const d = (s: string) => new Date(s);

const inst = (id: number, over: Partial<ReportInstance> = {}): ReportInstance => ({
  id,
  code: `PROC-${id}`,
  title: `P${id}`,
  status: 'COMPLETED',
  priority: 'NORMAL',
  startedAt: d('2026-09-01T00:00:00Z'),
  completedAt: d('2026-09-02T00:00:00Z'),
  slaDeadline: d('2026-09-03T00:00:00Z'),
  sourceModule: 'Users',
  currentResponsible: { id: 1, fullName: 'Ana' },
  process: {
    id: 1,
    code: 'T1',
    title: 'Onboarding',
    category: 'RH',
    department: { id: 1, name: 'RH' },
  },
  ...over,
});

const input = (over: Partial<ReportInput> = {}): ReportInput => ({
  instances: [],
  steps: [],
  approvals: [],
  reopenedInstanceIds: new Set(),
  ...over,
});

describe('buildIndicators', () => {
  const instances = [
    inst(1), // concluído dentro do prazo, 24h
    inst(2, { completedAt: d('2026-09-05T00:00:00Z') }), // concluído com atraso, 96h
    inst(3, { status: 'CANCELLED', completedAt: null }),
    inst(4, { status: 'ON_HOLD', completedAt: null }),
    inst(5, { status: 'IN_PROGRESS', completedAt: null, slaDeadline: d('2026-09-10T00:00:00Z') }),
  ];

  it('taxa de conclusão exclui cancelados e suspensos do denominador', () => {
    const r = buildIndicators(input({ instances }), NOW);
    expect(r.completionRate).toEqual({ value: 66.7, numerator: 2, denominator: 3 });
  });

  it('cumprimento de prazo só conta concluídos com prazo', () => {
    const r = buildIndicators(input({ instances }), NOW);
    expect(r.onTimeRate).toEqual({ value: 50, numerator: 1, denominator: 2 });
  });

  it('tempo médio de conclusão só usa concluídos', () => {
    const r = buildIndicators(input({ instances }), NOW);
    expect(r.avgCompletionHours).toEqual({ value: 60, samples: 2 });
  });

  it('devolve null (e não 0) quando não há denominador', () => {
    const r = buildIndicators(input(), NOW);
    expect(r.completionRate.value).toBeNull();
    expect(r.avgCompletionHours.value).toBeNull();
    expect(r.rejectionRate.value).toBeNull();
  });

  it('rejeição usa aprovações decididas; devolução e reabertura contam processos', () => {
    const r = buildIndicators(
      input({
        instances,
        approvals: [
          { instanceId: 1, status: 'APPROVED' },
          { instanceId: 2, status: 'REJECTED' },
          { instanceId: 2, status: 'RETURNED' },
          { instanceId: 5, status: 'PENDING' },
        ],
        steps: [
          {
            instanceId: 1,
            status: 'COMPLETED',
            startedAt: d('2026-09-01T00:00:00Z'),
            completedAt: d('2026-09-01T10:00:00Z'),
            returnCount: 1,
            stepTitle: 'Rever',
          },
        ],
        reopenedInstanceIds: new Set([1, 99]),
      }),
      NOW,
    );
    expect(r.rejectionRate).toEqual({ value: 33.3, numerator: 1, denominator: 3 });
    expect(r.returnRate).toEqual({ value: 40, numerator: 2, denominator: 5 });
    expect(r.reopenRate).toEqual({ value: 20, numerator: 1, denominator: 5 });
    expect(r.avgHoursByStep).toEqual([{ stepTitle: 'Rever', hours: 10, samples: 1 }]);
  });
});

describe('indicatorSets', () => {
  it('identifica atrasados, concluídos a tempo e com atraso', () => {
    const instances = [
      inst(1),
      inst(2, { completedAt: d('2026-09-05T00:00:00Z') }),
      inst(3, { status: 'IN_PROGRESS', completedAt: null, slaDeadline: d('2026-10-01T00:00:00Z') }),
    ];
    const s = indicatorSets(input({ instances }), NOW);
    expect([...s.onTime]).toEqual([1]);
    expect([...s.late]).toEqual([2]);
    expect([...s.overdue]).toEqual([3]);
  });
});

describe('groupInstances', () => {
  it('agrupa por departamento com totais e taxas', () => {
    const rows = groupInstances(
      [
        inst(1),
        inst(2, { process: { ...inst(2).process, department: { id: 2, name: 'TI' } } }),
        inst(3, {
          status: 'IN_PROGRESS',
          completedAt: null,
          slaDeadline: d('2026-10-01T00:00:00Z'),
        }),
      ],
      'department',
      NOW,
    );
    const rh = rows.find(r => r.label === 'RH');
    expect(rh).toMatchObject({ total: 2, completed: 1, overdue: 1, completionRate: 50 });
    expect(rows.find(r => r.label === 'TI')?.total).toBe(1);
  });

  it('ordena meses cronologicamente', () => {
    const rows = groupInstances(
      [
        inst(1, { startedAt: d('2026-09-01T00:00:00Z') }),
        inst(2, { startedAt: d('2026-07-01T00:00:00Z') }),
      ],
      'month',
      NOW,
    );
    expect(rows.map(r => r.key)).toEqual(['2026-07', '2026-09']);
  });
});
