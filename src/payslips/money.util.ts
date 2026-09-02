// src/payslips/money.util.ts
// Arredondamento monetário único para toda a escrita de totais de payroll.
// Mantém Float (decisão de arquitectura #2) mas garante 2 casas na persistência.

export const money = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** Guarda de sanidade: bruto − descontos tem de bater certo com o líquido. */
export function assertNetInvariant(r: {
  grossSalary: number;
  totalDeductions: number;
  netSalary: number;
}): void {
  const gap = Math.abs(r.grossSalary - r.totalDeductions - r.netSalary);
  if (gap > 0.01) {
    throw new Error(
      `Payroll net invariant violada: gross(${r.grossSalary}) - deductions(${r.totalDeductions}) - net(${r.netSalary}) = ${gap.toFixed(4)}`,
    );
  }
}
