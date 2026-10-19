import { evaluateEligibility, ActivityFacts } from './certificate-rules';

const facts = (over: Partial<ActivityFacts> = {}): ActivityFacts => ({
  completionPct: 100,
  bestScore: 80,
  attendancePct: null,
  practicalPassed: null,
  instructorApproved: false,
  managerApproved: false,
  ...over,
});

describe('evaluateEligibility', () => {
  const criteria = { requireFullCompletion: true, minScore: 70 };

  it('elegível com 100% e nota no limiar', () => {
    expect(evaluateEligibility(criteria, facts({ bestScore: 70 }))).toEqual({
      eligible: true,
      missing: [],
    });
  });

  it('nota 69 com minScore 70 → MIN_SCORE_NOT_MET', () => {
    expect(evaluateEligibility(criteria, facts({ bestScore: 69 }))).toEqual({
      eligible: false,
      missing: ['MIN_SCORE_NOT_MET'],
    });
  });

  it('sem nota com minScore → MIN_SCORE_NOT_MET', () => {
    expect(evaluateEligibility(criteria, facts({ bestScore: null })).missing).toContain(
      'MIN_SCORE_NOT_MET',
    );
  });

  it('conclusão incompleta → COMPLETION_INCOMPLETE', () => {
    expect(evaluateEligibility(criteria, facts({ completionPct: 80 })).missing).toContain(
      'COMPLETION_INCOMPLETE',
    );
  });

  it('presença desconhecida com minAttendancePct → ATTENDANCE_BELOW_MIN', () => {
    const r = evaluateEligibility({ minAttendancePct: 75 }, facts({ attendancePct: null }));
    expect(r).toEqual({ eligible: false, missing: ['ATTENDANCE_BELOW_MIN'] });
  });

  it('prática, instrutor e gestor em falta', () => {
    const r = evaluateEligibility(
      { requirePracticalPass: true, requireInstructorApproval: true, requireManagerApproval: true },
      facts({ practicalPassed: false }),
    );
    expect(r.missing).toEqual([
      'PRACTICAL_NOT_PASSED',
      'INSTRUCTOR_APPROVAL_MISSING',
      'MANAGER_APPROVAL_MISSING',
    ]);
  });

  it('sem critérios nunca é elegível', () => {
    expect(evaluateEligibility({}, facts())).toEqual({ eligible: false, missing: ['NO_CRITERIA'] });
  });

  it('devolve todos os motivos em falta', () => {
    const r = evaluateEligibility(criteria, facts({ completionPct: 50, bestScore: 10 }));
    expect(r.missing).toEqual(['COMPLETION_INCOMPLETE', 'MIN_SCORE_NOT_MET']);
  });
});
