export interface RuleCriteria {
  requireFullCompletion?: boolean;
  minScore?: number;
  minAttendancePct?: number;
  requireInstructorApproval?: boolean;
  requireManagerApproval?: boolean;
  requirePracticalPass?: boolean;
}

export interface ActivityFacts {
  completionPct: number;
  bestScore: number | null;
  attendancePct: number | null;
  practicalPassed: boolean | null;
  instructorApproved: boolean;
  managerApproved: boolean;
}

export type MissingReason =
  | 'COMPLETION_INCOMPLETE'
  | 'MIN_SCORE_NOT_MET'
  | 'ATTENDANCE_BELOW_MIN'
  | 'PRACTICAL_NOT_PASSED'
  | 'INSTRUCTOR_APPROVAL_MISSING'
  | 'MANAGER_APPROVAL_MISSING'
  | 'NO_CRITERIA';

export interface EligibilityResult {
  eligible: boolean;
  missing: MissingReason[];
}

/** Avalia só os critérios configurados; sem nenhum critério activo nunca é elegível. */
export function evaluateEligibility(
  criteria: RuleCriteria,
  facts: ActivityFacts,
): EligibilityResult {
  const missing: MissingReason[] = [];
  let active = 0;

  if (criteria.requireFullCompletion) {
    active++;
    if (facts.completionPct < 100) missing.push('COMPLETION_INCOMPLETE');
  }
  if (criteria.minScore !== undefined) {
    active++;
    if (facts.bestScore === null || facts.bestScore < criteria.minScore)
      missing.push('MIN_SCORE_NOT_MET');
  }
  if (criteria.minAttendancePct !== undefined) {
    active++;
    if (facts.attendancePct === null || facts.attendancePct < criteria.minAttendancePct) {
      missing.push('ATTENDANCE_BELOW_MIN');
    }
  }
  if (criteria.requirePracticalPass) {
    active++;
    if (facts.practicalPassed !== true) missing.push('PRACTICAL_NOT_PASSED');
  }
  if (criteria.requireInstructorApproval) {
    active++;
    if (!facts.instructorApproved) missing.push('INSTRUCTOR_APPROVAL_MISSING');
  }
  if (criteria.requireManagerApproval) {
    active++;
    if (!facts.managerApproved) missing.push('MANAGER_APPROVAL_MISSING');
  }

  if (active === 0) return { eligible: false, missing: ['NO_CRITERIA'] };
  return { eligible: missing.length === 0, missing };
}
