// Mapa prefixo de rota → módulo (PermissionSubject) para aplicar plano e módulos desligados.
// Conservador de propósito: só rotas cujo módulo é inequívoco. O que não está aqui (auth,
// users, settings, dashboard, notifications…) é núcleo e nunca é bloqueado por plano.
const ROUTE_MODULES: ReadonlyArray<[prefix: string, subject: string]> = [
  ['/payroll', 'PAYROLL'],
  ['/payslips', 'PAYROLL'],
  ['/courses', 'LMS'],
  ['/enrollments', 'LMS'],
  ['/live-classes', 'LMS'],
  ['/assessments', 'LMS'],
  ['/certificates', 'LMS'],
  ['/ai-tutor', 'LMS'],
  ['/evaluation360', 'EVALUATION'],
  ['/evaluations', 'EVALUATION'],
  ['/competencies', 'TALENT'],
  ['/competency-map', 'TALENT'],
  ['/succession', 'TALENT'],
  ['/career', 'TALENT'],
  ['/careers', 'TALENT'],
  ['/career-plans', 'TALENT'],
  ['/content-library', 'CONTENT_LIBRARY'],
  ['/library', 'CONTENT_LIBRARY'],
  ['/avatar-training', 'AVATAR_TRAINING'],
  ['/roi-impact', 'ROI_IMPACT'],
  ['/history', 'HISTORY'],
  ['/reports', 'REPORTS'],
  ['/executive-reports', 'REPORTS'],
  ['/analytics', 'REPORTS'],
];

export function moduleForPath(path: string): string | null {
  for (const [prefix, subject] of ROUTE_MODULES) {
    if (path === prefix || path.startsWith(`${prefix}/`)) return subject;
  }
  return null;
}
