-- Lote 13 (sub-projecto 2, ÚLTIMO lote): conversão de 18 campos String
-- para enums Prisma em Engagement (Grupos A/B/C — Feedback/Recognition/
-- OneOnOneMeeting/EngagementAction) e Avaliação 360° (Grupo D). Todas as
-- tabelas alvo estão vazias em innova_dev/innova_test — sem necessidade
-- de UPDATE defensivo.
--
-- Renomeações por colisão com enums Prisma já existentes e activos
-- (confirmado com `prisma validate` antes de fechar os nomes):
-- - "FeedbackType" já existe e é usado por ContinuousFeedback (PRAISE/
--   IMPROVEMENT/GENERAL) -> Feedback.type usa "EngagementFeedbackType"
--   (OPEN/ANONYMOUS/PEER/MANAGER/RECOGNITION) e Eval360Feedback.type usa
--   "Eval360FeedbackType" (RECOGNITION/DEVELOPMENT/CHECK_IN/PULSE).
-- - "CycleType"/"CycleStatus" já existem e são usados por outro módulo de
--   ciclos (PROBATION/QUARTERLY/SEMESTER/ANNUAL/AD_HOC e PLANNED/ACTIVE/
--   CLOSED/CANCELLED) -> Eval360Cycle usa "Eval360CycleType"/
--   "Eval360CycleStatus".
-- - "QuestionType" já existe e é usado por AssessmentQuestion (e por
--   "SurveyQuestionType" do lote 12) -> Eval360Question.type usa
--   "Eval360QuestionType".
--
-- Reaproveitamento de enum já existente para o mesmo conceito de domínio:
-- - OneOnOneMeeting.status reutiliza "OneOnOneStatus" — enum já existente
--   e usado pelo modelo "OneOnOne" (duplicação estrutural já existente no
--   schema, não corrigida aqui) com o mesmo conceito e um sobreconjunto
--   dos 2 valores confirmados em código (SCHEDULED/COMPLETED) mais
--   CANCELLED/RESCHEDULED.
--
-- OneOnOneMeeting.frequency e EngagementAction.priority não convertidos —
-- apenas @IsString() sem @IsEnum/@IsIn, sem vocabulário fechado confirmado
-- em código.

DO $$ BEGIN
  CREATE TYPE "EngagementFeedbackType" AS ENUM ('OPEN', 'ANONYMOUS', 'PEER', 'MANAGER', 'RECOGNITION');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "FeedbackStatus" AS ENUM ('OPEN', 'REPLIED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "RecognitionType" AS ENUM ('KUDOS', 'BADGE', 'ACHIEVEMENT', 'MILESTONE');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "ActionPlanStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "EvaluationModel" AS ENUM ('DEG_90', 'DEG_180', 'DEG_270', 'DEG_360', 'HYBRID');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "Eval360CycleType" AS ENUM ('TRIMESTRAL', 'SEMESTRAL', 'ANUAL', 'PROJECT', 'CUSTOM');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "Eval360CycleStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'IN_PROGRESS', 'PROCESSING', 'COMPLETED', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "AnonymityMode" AS ENUM ('ANONYMOUS', 'SEMI_ANONYMOUS', 'OPEN');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "EvaluatorRole" AS ENUM ('SELF', 'MANAGER', 'PEER', 'SUBORDINATE', 'EXTERNAL');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "EvaluatorAssignmentStatus" AS ENUM ('PENDING', 'INVITED', 'IN_PROGRESS', 'COMPLETED', 'EXPIRED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "CycleParticipantStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "Eval360QuestionType" AS ENUM ('LIKERT', 'FREQUENCY', 'MULTIPLE_CHOICE', 'YES_NO', 'OPEN_TEXT', 'SITUATIONAL');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "EvaluationResponseStatus" AS ENUM ('DRAFT', 'SUBMITTED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "Eval360FeedbackType" AS ENUM ('RECOGNITION', 'DEVELOPMENT', 'CHECK_IN', 'PULSE');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Engagement Grupos A/B/C
ALTER TABLE "Feedback" ALTER COLUMN "type" TYPE "EngagementFeedbackType" USING "type"::"EngagementFeedbackType";

ALTER TABLE "Feedback" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Feedback" ALTER COLUMN "status" TYPE "FeedbackStatus" USING "status"::"FeedbackStatus";
ALTER TABLE "Feedback" ALTER COLUMN "status" SET DEFAULT 'OPEN';

ALTER TABLE "Recognition" ALTER COLUMN "type" TYPE "RecognitionType" USING "type"::"RecognitionType";

ALTER TABLE "OneOnOneMeeting" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "OneOnOneMeeting" ALTER COLUMN "status" TYPE "OneOnOneStatus" USING "status"::"OneOnOneStatus";
ALTER TABLE "OneOnOneMeeting" ALTER COLUMN "status" SET DEFAULT 'SCHEDULED';

ALTER TABLE "EngagementAction" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "EngagementAction" ALTER COLUMN "status" TYPE "ActionPlanStatus" USING "status"::"ActionPlanStatus";
ALTER TABLE "EngagementAction" ALTER COLUMN "status" SET DEFAULT 'OPEN';

-- Avaliação 360° — Grupo D
ALTER TABLE "Eval360Cycle" ALTER COLUMN "model" DROP DEFAULT;
ALTER TABLE "Eval360Cycle" ALTER COLUMN "model" TYPE "EvaluationModel" USING "model"::"EvaluationModel";
ALTER TABLE "Eval360Cycle" ALTER COLUMN "model" SET DEFAULT 'DEG_360';

ALTER TABLE "Eval360Cycle" ALTER COLUMN "type" DROP DEFAULT;
ALTER TABLE "Eval360Cycle" ALTER COLUMN "type" TYPE "Eval360CycleType" USING "type"::"Eval360CycleType";
ALTER TABLE "Eval360Cycle" ALTER COLUMN "type" SET DEFAULT 'ANUAL';

ALTER TABLE "Eval360Cycle" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Eval360Cycle" ALTER COLUMN "status" TYPE "Eval360CycleStatus" USING "status"::"Eval360CycleStatus";
ALTER TABLE "Eval360Cycle" ALTER COLUMN "status" SET DEFAULT 'DRAFT';

ALTER TABLE "Eval360Cycle" ALTER COLUMN "anonymityMode" DROP DEFAULT;
ALTER TABLE "Eval360Cycle" ALTER COLUMN "anonymityMode" TYPE "AnonymityMode" USING "anonymityMode"::"AnonymityMode";
ALTER TABLE "Eval360Cycle" ALTER COLUMN "anonymityMode" SET DEFAULT 'ANONYMOUS';

ALTER TABLE "EvaluatorAssignment" ALTER COLUMN "role" TYPE "EvaluatorRole" USING "role"::"EvaluatorRole";

ALTER TABLE "EvaluatorAssignment" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "EvaluatorAssignment" ALTER COLUMN "status" TYPE "EvaluatorAssignmentStatus" USING "status"::"EvaluatorAssignmentStatus";
ALTER TABLE "EvaluatorAssignment" ALTER COLUMN "status" SET DEFAULT 'PENDING';

ALTER TABLE "CycleParticipant" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "CycleParticipant" ALTER COLUMN "status" TYPE "CycleParticipantStatus" USING "status"::"CycleParticipantStatus";
ALTER TABLE "CycleParticipant" ALTER COLUMN "status" SET DEFAULT 'PENDING';

ALTER TABLE "Eval360Question" ALTER COLUMN "type" TYPE "Eval360QuestionType" USING "type"::"Eval360QuestionType";

ALTER TABLE "EvaluationResponse" ALTER COLUMN "evaluatorRole" TYPE "EvaluatorRole" USING "evaluatorRole"::"EvaluatorRole";

ALTER TABLE "EvaluationResponse" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "EvaluationResponse" ALTER COLUMN "status" TYPE "EvaluationResponseStatus" USING "status"::"EvaluationResponseStatus";
ALTER TABLE "EvaluationResponse" ALTER COLUMN "status" SET DEFAULT 'DRAFT';

ALTER TABLE "Eval360Feedback" ALTER COLUMN "type" TYPE "Eval360FeedbackType" USING "type"::"Eval360FeedbackType";
