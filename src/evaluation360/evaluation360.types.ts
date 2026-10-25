import { Prisma } from '@prisma/client';

// Tipos partilhados entre o Evaluation360Service e os seus colaboradores internos.
export type CalcCycle = Prisma.Eval360CycleGetPayload<{
  include: { competencies: { include: { competency: true } } };
}>;

export type ResponseWithAnswers = Prisma.EvaluationResponseGetPayload<{
  include: { answers: { include: { question: { include: { competency: true } } } } };
}>;

export interface CompetencyScoreEntry {
  name: string;
  category: string;
  type: string;
  score: number | null;
  selfScore: number | null;
  othersScore: number | null;
  managerScore: number | null;
  peerScore: number | null;
  // "Avaliação dos subordinados"/"Outras avaliações" (docs/evaluation360.md
  // §7) — subordinateScore e externalScore não tinham breakdown por
  // competência, só ao nível do resultado global (selfScore/managerScore/...
  // em EvaluationResult); precisos para a tabela de Resultados.
  subordinateScore: number | null;
  externalScore: number | null;
  // Nº de respostas numéricas consideradas nesta competência (todos os
  // grupos, já com o quorum de pares aplicado) — coluna "Nº de respostas".
  responseCount: number;
  gap: number | null;
  // Média de todas as respostas submetidas no ciclo para esta competência
  // (todos os participantes) — referência comparativa real, não um
  // "benchmark de cargo" fabricado (o schema não tem dados de mercado).
  benchmark: number | null;
  // "Nível esperado"/"Gap" face ao esperado (docs/evaluation360.md §3/§7) —
  // vem de Eval360CycleCompetency.expectedLevel quando configurado; gapToExpected
  // é distinto do `gap` acima (que é auto vs. outros).
  expectedLevel: number | null;
  gapToExpected: number | null;
}

export interface CompetencyGapEntry {
  competencyId: string;
  name: string;
  score: number | null;
  gap: number | null;
  priority: string;
}

export interface CompetencyStrengthEntry {
  competencyId: string;
  name: string;
  score: number | null;
}
