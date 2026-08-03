-- Fix de CI do lote 13: descoberto que Feedback.type tem um SEGUNDO
-- escritor além de engagement.service.ts — leader.service.ts#giveFeedback
-- grava no MESMO modelo Feedback via um wrapper safeM(this.prisma,
-- 'feedback'), usando um enum local COMPLETAMENTE diferente
-- (leader.dto.ts: POSITIVE/CONSTRUCTIVE/NEUTRAL/SBI) do que foi convertido
-- para "EngagementFeedbackType" (OPEN/ANONYMOUS/PEER/MANAGER/RECOGNITION).
-- Como o wrapper safeM engole silenciosamente qualquer erro do Prisma e
-- devolve um objecto degradado, a escrita com um valor fora do enum
-- original falhava sem nunca aparecer como erro — só detectado porque o
-- teste de integração de leader.integration-spec.ts verifica que a linha
-- foi mesmo persistida na BD (não apenas que a resposta HTTP é 200).
--
-- Correcção: união dos dois conjuntos reais de valores (mesmo padrão já
-- usado no PR #86 para os módulos de carreira/PDI duplicados) — nenhum
-- valor é removido, o enum apenas ganha os 4 valores em falta.

ALTER TYPE "EngagementFeedbackType" ADD VALUE IF NOT EXISTS 'POSITIVE';
ALTER TYPE "EngagementFeedbackType" ADD VALUE IF NOT EXISTS 'CONSTRUCTIVE';
ALTER TYPE "EngagementFeedbackType" ADD VALUE IF NOT EXISTS 'NEUTRAL';
ALTER TYPE "EngagementFeedbackType" ADD VALUE IF NOT EXISTS 'SBI';
