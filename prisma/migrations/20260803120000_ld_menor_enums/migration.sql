-- Lote 5 (sub-projecto 2): conversão de 20 campos String para enums Prisma
-- em Onboarding, Micro-Learning, Trainings e Knowledge Base.
-- Todas as tabelas alvo estão vazias em innova_dev/innova_test — sem necessidade
-- de UPDATE defensivo de normalização.

-- ─── Onboarding ─────────────────────────────────────────────────────────────

CREATE TYPE "OnboardingStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'ABANDONED', 'ON_HOLD');
CREATE TYPE "TaskCategory" AS ENUM ('DOCUMENTS', 'IT_ACCESS', 'TRAINING', 'SOCIAL', 'BENEFITS', 'ADMIN', 'MEETING');
CREATE TYPE "TaskType" AS ENUM ('TASK', 'COURSE', 'LEARNING_PATH', 'PROCESS', 'DOCUMENT', 'MEETING');
CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED', 'SKIPPED');
CREATE TYPE "TaskPhase" AS ENUM ('PRE_BOARDING', 'DAY_1', 'WEEK_1', 'DAY_30', 'DAY_60', 'DAY_90');
CREATE TYPE "ResponsibleRole" AS ENUM ('SELF', 'HR', 'MANAGER', 'IT', 'BUDDY', 'EXTERNAL');
CREATE TYPE "DocumentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "SurveyMilestone" AS ENUM ('DAY_1', 'DAY_7', 'DAY_30', 'DAY_90');

ALTER TABLE "OnboardingTemplateTask" ALTER COLUMN "category" TYPE "TaskCategory" USING "category"::"TaskCategory";
ALTER TABLE "OnboardingTemplateTask" ALTER COLUMN "type" TYPE "TaskType" USING "type"::"TaskType";
ALTER TABLE "OnboardingTemplateTask" ALTER COLUMN "phase" TYPE "TaskPhase" USING "phase"::"TaskPhase";
ALTER TABLE "OnboardingTemplateTask" ALTER COLUMN "responsible" TYPE "ResponsibleRole" USING "responsible"::"ResponsibleRole";

ALTER TABLE "OnboardingPlan" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "OnboardingPlan" ALTER COLUMN "status" TYPE "OnboardingStatus" USING "status"::"OnboardingStatus";
ALTER TABLE "OnboardingPlan" ALTER COLUMN "status" SET DEFAULT 'NOT_STARTED';

ALTER TABLE "OnboardingTaskInstance" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "OnboardingTaskInstance" ALTER COLUMN "status" TYPE "TaskStatus" USING "status"::"TaskStatus";
ALTER TABLE "OnboardingTaskInstance" ALTER COLUMN "status" SET DEFAULT 'PENDING';

ALTER TABLE "OnboardingDocument" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "OnboardingDocument" ALTER COLUMN "status" TYPE "DocumentStatus" USING "status"::"DocumentStatus";
ALTER TABLE "OnboardingDocument" ALTER COLUMN "status" SET DEFAULT 'PENDING';

ALTER TABLE "OnboardingSurvey" ALTER COLUMN "milestone" TYPE "SurveyMilestone" USING "milestone"::"SurveyMilestone";

-- ─── Micro-Learning ─────────────────────────────────────────────────────────

CREATE TYPE "ContentType" AS ENUM ('VIDEO', 'TEXT', 'AUDIO', 'INFOGRAPHIC', 'QUIZ');
CREATE TYPE "ContentLevel" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED');
CREATE TYPE "ContentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "MicroLearningAction" AS ENUM ('LIKE', 'SAVE', 'SKIP');

ALTER TABLE "MicroLearning" ALTER COLUMN "contentType" TYPE "ContentType" USING "contentType"::"ContentType";
ALTER TABLE "MicroLearning" ALTER COLUMN "level" TYPE "ContentLevel" USING "level"::"ContentLevel";
ALTER TABLE "MicroLearning" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "MicroLearning" ALTER COLUMN "status" TYPE "ContentStatus" USING "status"::"ContentStatus";
ALTER TABLE "MicroLearning" ALTER COLUMN "status" SET DEFAULT 'DRAFT';

ALTER TABLE "MicroLearningInteraction" ALTER COLUMN "action" TYPE "MicroLearningAction" USING "action"::"MicroLearningAction";

-- ─── Trainings ──────────────────────────────────────────────────────────────

CREATE TYPE "TrainingType" AS ENUM ('PRESENTIAL', 'ONLINE', 'HYBRID');
CREATE TYPE "TrainingLevel" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED');
CREATE TYPE "TrainingStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "TrainingParticipantStatus" AS ENUM ('WAITLIST', 'REGISTERED', 'ATTENDED', 'ABSENT', 'CANCELLED', 'COMPLETED');
CREATE TYPE "SessionModality" AS ENUM ('PRESENTIAL', 'ONLINE', 'HYBRID');

ALTER TABLE "Training" ALTER COLUMN "type" TYPE "TrainingType" USING "type"::"TrainingType";
ALTER TABLE "Training" ALTER COLUMN "level" TYPE "TrainingLevel" USING "level"::"TrainingLevel";
ALTER TABLE "Training" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Training" ALTER COLUMN "status" TYPE "TrainingStatus" USING "status"::"TrainingStatus";
ALTER TABLE "Training" ALTER COLUMN "status" SET DEFAULT 'DRAFT';

ALTER TABLE "TrainingSession" ALTER COLUMN "modality" TYPE "SessionModality" USING "modality"::"SessionModality";

ALTER TABLE "TrainingParticipant" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "TrainingParticipant" ALTER COLUMN "status" TYPE "TrainingParticipantStatus" USING "status"::"TrainingParticipantStatus";
ALTER TABLE "TrainingParticipant" ALTER COLUMN "status" SET DEFAULT 'REGISTERED';

-- ─── Knowledge Base ─────────────────────────────────────────────────────────

CREATE TYPE "ArticleStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "ArticleAccess" AS ENUM ('PUBLIC', 'DEPARTMENT', 'ROLE', 'CONFIDENTIAL');
CREATE TYPE "InteractionAction" AS ENUM ('VIEW', 'LIKE', 'DISLIKE', 'BOOKMARK', 'SHARE');

ALTER TABLE "KnowledgeArticle" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "KnowledgeArticle" ALTER COLUMN "status" TYPE "ArticleStatus" USING "status"::"ArticleStatus";
ALTER TABLE "KnowledgeArticle" ALTER COLUMN "status" SET DEFAULT 'DRAFT';

ALTER TABLE "KnowledgeArticle" ALTER COLUMN "accessLevel" DROP DEFAULT;
ALTER TABLE "KnowledgeArticle" ALTER COLUMN "accessLevel" TYPE "ArticleAccess" USING "accessLevel"::"ArticleAccess";
ALTER TABLE "KnowledgeArticle" ALTER COLUMN "accessLevel" SET DEFAULT 'PUBLIC';

ALTER TABLE "KnowledgeInteraction" ALTER COLUMN "action" TYPE "InteractionAction" USING "action"::"InteractionAction";
