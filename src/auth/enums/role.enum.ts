/**
 * Fonte única de verdade para os papéis usados em @Roles(...).
 * Os valores têm de coincidir exactamente com Role.name na base de dados.
 *
 * ⚠️ A REVER (não alterar comportamento sem decisão de produto):
 *  - INSTRUTOR ('INSTRUTOR', PT) vs INSTRUCTOR ('INSTRUCTOR', EN): há controllers
 *    a usar 'INSTRUCTOR'. Mantêm-se os dois para preservar o comportamento actual,
 *    mas devem ser unificados num só valor.
 *  - Os seeds só criam ADMIN, RH, GESTOR, COLABORADOR. Os papéis DIRECTOR, LIDER,
 *    AUDITOR, INSTRUTOR/INSTRUCTOR não estão seedados → endpoints protegidos por
 *    eles podem ficar inacessíveis. Confirmar se esses papéis devem existir.
 */
export enum Role {
  ADMIN = 'ADMIN',
  RH = 'RH',
  HR = 'RH',
  GESTOR = 'GESTOR',
  COLABORADOR = 'COLABORADOR',
  EMPLOYEE = 'COLABORADOR',
  INSTRUTOR = 'INSTRUTOR',
  INSTRUCTOR = 'INSTRUCTOR',
  DIRECTOR = 'DIRECTOR',
  LIDER = 'LIDER',
  AUDITOR = 'AUDITOR',
}
