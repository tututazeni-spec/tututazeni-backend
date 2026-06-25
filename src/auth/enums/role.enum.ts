/**
 * Fonte única de verdade para os papéis usados em @Roles(...).
 * Os valores têm de coincidir exactamente com Role.name na base de dados,
 * e todos os papéis aqui usados em @Roles são criados pelos seeds
 * (prisma/seed.ts e prisma/seed-e2e.ts) para que os endpoints fiquem acessíveis.
 *
 * Notas:
 *  - INSTRUCTOR ('INSTRUCTOR') é o valor único do papel de instrutor. O antigo
 *    alias PT 'INSTRUTOR' não era usado em nenhum @Roles e foi removido.
 *  - HR e EMPLOYEE são apenas aliases convenientes que mapeiam para os valores
 *    reais 'RH' e 'COLABORADOR'.
 */
export enum Role {
  ADMIN = 'ADMIN',
  RH = 'RH',
  HR = 'RH',
  GESTOR = 'GESTOR',
  COLABORADOR = 'COLABORADOR',
  EMPLOYEE = 'COLABORADOR',
  INSTRUCTOR = 'INSTRUCTOR',
  DIRECTOR = 'DIRECTOR',
  LIDER = 'LIDER',
  AUDITOR = 'AUDITOR',
}
