// modulo_audit.md §13 — matriz de módulos auditados.
// Resolve o módulo de origem a partir do nome da entidade gravada em AuditLog.entity,
// para que todos os módulos (actuais e futuros) apareçam agrupados sem cada chamador
// ter de declarar o módulo. Módulos novos: acrescentar uma linha aqui.

const MODULE_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/^(payslip|payroll|salary|receipt)/i, 'Payroll'],
  [/^(role|permission|rolepermission)/i, 'Roles & Permissions'],
  [/^(department)/i, 'Departments'],
  [/^(organi[sz]ation|orgunit|position|jobposition)/i, 'Organization'],
  [/^(attendance|clock|timesheet)/i, 'Attendance'],
  [/^(leave|vacation|absence)/i, 'Leave'],
  [/^(evaluation360|feedback360|cycle360)/i, 'Evaluation 360'],
  [/^(performance|review|calibration|ninebox)/i, 'Performance'],
  [/^(competenc|usercompetency|skill)/i, 'Competencies'],
  [/^(onboarding)/i, 'Onboarding'],
  [/^(courselesson|lesson|coursemodule|module)/i, 'Course Modules / Lessons'],
  [/^(enrollment)/i, 'Enrollments'],
  [/^(assessment|quiz|exam)/i, 'Assessments'],
  [/^(avatar)/i, 'Avatar Training'],
  [/^(aitutor|tutor)/i, 'AI Tutor'],
  [/^(training|liveclass|session)/i, 'Trainings'],
  [/^(course|learningpath|certificate|badge)/i, 'Courses'],
  [/^(developmentplan|legacypdi|pdi)/i, 'Development Plans / PDI'],
  [/^(careerplan|career)/i, 'Career Plans'],
  [/^(succession)/i, 'Succession'],
  [/^(contentasset|content|library)/i, 'Knowledge / Content Library'],
  [/^(document|docs?category)/i, 'Document Repository'],
  [/^(workdeclaration|declaration)/i, 'Work Declaration'],
  [/^(event)/i, 'Events'],
  [/^(process)/i, 'Processes'],
  [/^(automation)/i, 'Automations'],
  [/^(executivereport|report)/i, 'Executive Reports'],
  [/^(analytic)/i, 'Analytics'],
  [/^(apikey|webhook|integration)/i, 'Integrations / API'],
  [/^(notification)/i, 'Notifications'],
  [/^(history)/i, 'History'],
  [/^(instructor)/i, 'Instructor'],
  [/^(engagement|survey)/i, 'Engagement'],
  [/^(audit)/i, 'Audit'],
  [/^(setting|config|policy)/i, 'Administração'],
  [/^(user|employee|auth|session)/i, 'Users'],
];

/** Módulos da matriz §13 (sem o fallback), pela ordem de declaração. */
export const AUDIT_MODULES: readonly string[] = [...new Set(MODULE_PATTERNS.map(([, m]) => m))];

export const AUDIT_FALLBACK_MODULE = 'Outros';

export function resolveAuditModule(entity: string | null | undefined): string {
  const name = (entity ?? '').trim();
  if (!name) return AUDIT_FALLBACK_MODULE;
  for (const [pattern, mod] of MODULE_PATTERNS) {
    if (pattern.test(name)) return mod;
  }
  return AUDIT_FALLBACK_MODULE;
}

export const AUDIT_SCHEMA_VERSION = 1;
export type AuditActorType = 'USER' | 'SYSTEM' | 'INTEGRATION' | 'SERVICE';
export type AuditSource = 'UI' | 'API' | 'INTEGRATION' | 'AUTOMATION' | 'JOB';
