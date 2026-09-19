-- docs/trainings-detalhado.md — Fluxo completo: Conclusão → Certificação →
-- Competências. Novo valor de CompetencySource para distinguir ganhos de
-- competência vindos de uma Training (mesmo padrão de COURSE).
ALTER TYPE "CompetencySource" ADD VALUE 'TRAINING';
