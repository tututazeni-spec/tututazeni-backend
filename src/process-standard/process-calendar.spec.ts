import {
  buildIcs,
  CalendarItem,
  classifyDue,
  detectAssignmentConflicts,
  plannedDurationHours,
} from './process-calendar';

const NOW = new Date('2026-10-05T10:00:00Z');

const item = (over: Partial<CalendarItem>): CalendarItem => ({
  key: 'T1-1',
  kind: 'TASK',
  instanceId: 1,
  stepId: 1,
  code: 'PROC-1-T01',
  title: 'Tarefa',
  processTitle: 'Processo',
  processCode: 'P1',
  assignee: { id: 7, fullName: 'Ana' },
  department: null,
  startAt: new Date('2026-10-01T09:00:00Z'),
  dueAt: new Date('2026-10-06T09:00:00Z'),
  durationHours: 2,
  status: 'PENDING',
  priority: 'NORMAL',
  dependencies: [],
  approvalDueAt: null,
  completedAt: null,
  ...over,
});

describe('classifyDue', () => {
  it('marca atrasado quando o prazo passou e o item está em aberto', () => {
    const f = classifyDue(item({ dueAt: new Date('2026-10-04T10:00:00Z') }), NOW);
    expect(f).toEqual({ isOverdue: true, isDueSoon: false });
  });

  it('marca a vencer nas próximas 48h', () => {
    const f = classifyDue(item({ dueAt: new Date('2026-10-07T09:00:00Z') }), NOW);
    expect(f).toEqual({ isOverdue: false, isDueSoon: true });
  });

  it('ignora itens concluídos ou sem prazo', () => {
    expect(
      classifyDue(item({ status: 'COMPLETED', dueAt: new Date('2026-10-01T00:00:00Z') }), NOW),
    ).toEqual({ isOverdue: false, isDueSoon: false });
    expect(classifyDue(item({ dueAt: null }), NOW)).toEqual({ isOverdue: false, isDueSoon: false });
  });

  it('processos suspensos continuam em aberto', () => {
    const f = classifyDue(
      item({ kind: 'PROCESS', status: 'ON_HOLD', dueAt: new Date('2026-10-01T00:00:00Z') }),
      NOW,
    );
    expect(f.isOverdue).toBe(true);
  });
});

describe('plannedDurationHours', () => {
  it('prefere a estimativa em minutos, depois o SLA, depois o intervalo', () => {
    const a = new Date('2026-10-01T00:00:00Z');
    const b = new Date('2026-10-02T00:00:00Z');
    expect(plannedDurationHours(90, 10, a, b)).toBe(1.5);
    expect(plannedDurationHours(null, 10, a, b)).toBe(10);
    expect(plannedDurationHours(null, null, a, b)).toBe(24);
    expect(plannedDurationHours(null, null, null, b)).toBeNull();
  });
});

describe('detectAssignmentConflicts', () => {
  const due = new Date('2026-10-06T15:00:00Z');

  it('detecta sobrecarga do mesmo responsável no mesmo dia', () => {
    const conflicts = detectAssignmentConflicts([
      item({ key: 'T1-1', dueAt: due, durationHours: 5 }),
      item({ key: 'T2-1', dueAt: due, durationHours: 4 }),
    ]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ assigneeId: 7, day: '2026-10-06', totalHours: 9 });
    expect(conflicts[0].itemKeys).toEqual(['T1-1', 'T2-1']);
  });

  it('não acusa conflito dentro da capacidade nem com uma única tarefa', () => {
    expect(
      detectAssignmentConflicts([
        item({ key: 'a', dueAt: due, durationHours: 3 }),
        item({ key: 'b', dueAt: due, durationHours: 4 }),
      ]),
    ).toEqual([]);
    expect(detectAssignmentConflicts([item({ key: 'a', dueAt: due, durationHours: 12 })])).toEqual(
      [],
    );
  });

  it('separa responsáveis, ignora concluídas e conta 1h sem estimativa', () => {
    const others = [
      item({ key: 'a', dueAt: due, durationHours: 6 }),
      item({ key: 'b', dueAt: due, durationHours: 6, assignee: { id: 8, fullName: 'Rui' } }),
      item({ key: 'c', dueAt: due, durationHours: 6, status: 'COMPLETED' }),
    ];
    expect(detectAssignmentConflicts(others)).toEqual([]);
    const noEstimate = Array.from({ length: 9 }, (_, i) =>
      item({ key: `n${i}`, dueAt: due, durationHours: null }),
    );
    expect(detectAssignmentConflicts(noEstimate)[0].totalHours).toBe(9);
  });
});

describe('buildIcs', () => {
  it('gera um VEVENT por item com prazo e escapa o texto', () => {
    const ics = buildIcs(
      [item({ title: 'Rever; contrato, final' }), item({ key: 'T9-9', dueAt: null })],
      NOW,
    );
    expect(ics.startsWith('BEGIN:VCALENDAR')).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(ics).toContain('Rever\\; contrato\\, final');
    expect(ics).toContain('DTEND:20261006T090000Z');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });
});
