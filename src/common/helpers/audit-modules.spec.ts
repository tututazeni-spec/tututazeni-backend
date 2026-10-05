import { AUDIT_FALLBACK_MODULE, AUDIT_MODULES, resolveAuditModule } from './audit-modules';

describe('resolveAuditModule (matriz §13)', () => {
  it.each([
    ['Payslip', 'Payroll'],
    ['LeaveRequest', 'Leave'],
    ['Evaluation360Cycle', 'Evaluation 360'],
    ['PerformanceReview', 'Performance'],
    ['Enrollment', 'Enrollments'],
    ['CourseModule', 'Course Modules / Lessons'],
    ['Course', 'Courses'],
    ['ContentAsset', 'Knowledge / Content Library'],
    ['Document', 'Document Repository'],
    ['User', 'Users'],
  ])('%s → %s', (entity, mod) => {
    expect(resolveAuditModule(entity)).toBe(mod);
  });

  it('entidade desconhecida ou vazia cai no fallback', () => {
    expect(resolveAuditModule('Zzz')).toBe(AUDIT_FALLBACK_MODULE);
    expect(resolveAuditModule(undefined)).toBe(AUDIT_FALLBACK_MODULE);
  });

  it('AUDIT_MODULES não tem duplicados nem o fallback', () => {
    expect(new Set(AUDIT_MODULES).size).toBe(AUDIT_MODULES.length);
    expect(AUDIT_MODULES).not.toContain(AUDIT_FALLBACK_MODULE);
  });
});
