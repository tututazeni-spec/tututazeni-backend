-- Lote 10 (sub-projecto 2): conversão de 15 campos String para enums Prisma
-- em Avatar/AI (ContentAsset/AvatarScenario/AvatarSession), Eventos
-- (Event/EventParticipant) e Instrutor/Marketplace (InstructorProfile/
-- InstructorCohort/CohortParticipant). Todas as tabelas alvo estão vazias
-- em innova_dev/innova_test — sem necessidade de UPDATE defensivo.
--
-- Nomes distintos escolhidos para evitar colisão com enums já existentes
-- de valores diferentes: ContentAssetStatus (≠ ContentStatus, MicroLearning,
-- lote 5), ContentAssetLevel (≠ ContentLevel, MicroLearning, lote 5),
-- AvatarSessionStatus (≠ SessionStatus, outro módulo, SCHEDULED/LIVE/
-- COMPLETED/CANCELLED/POSTPONED), EventParticipantStatus (≠ ParticipantStatus
-- de LeadershipParticipant/lote 4 e TrainingParticipantStatus/lote 5).
--
-- Event.status redefine o enum "EventStatus" já existente (declarado sem
-- nenhum campo a usá-lo, com valores errados — PENDING/CONFIRMED/CANCELED
-- em vez dos reais DRAFT/PUBLISHED/CANCELLED confirmados por grep em
-- events.service.ts), mesmo padrão do lote 2/9.
--
-- CohortParticipant.status usa CohortParticipantStatus com um único valor
-- confirmado (ACTIVE) — sem fluxo de withdraw/completion implementado.

CREATE TYPE "ContentFormat" AS ENUM ('VIDEO', 'ARTICLE', 'PODCAST', 'PDF', 'EBOOK', 'SCORM', 'MICROLEARNING', 'INFOGRAPHIC', 'QUIZ', 'TEMPLATE', 'PRESENTATION', 'COURSE', 'WEBINAR', 'HTML5');
CREATE TYPE "ContentAssetStatus" AS ENUM ('DRAFT', 'REVIEW', 'ACTIVE', 'DEPRECATED', 'ARCHIVED');
CREATE TYPE "ContentAssetLevel" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT');
CREATE TYPE "ContentCategory" AS ENUM ('HARD_SKILLS', 'SOFT_SKILLS', 'COMPLIANCE', 'ONBOARDING', 'LANGUAGES', 'PRODUCTS', 'WELLBEING', 'LEADERSHIP', 'TECHNICAL', 'OTHER');
CREATE TYPE "Difficulty" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT');
CREATE TYPE "ScenarioCategory" AS ENUM ('SOFT_SKILLS', 'SALES', 'CUSTOMER_SERVICE', 'ONBOARDING', 'COMPLIANCE', 'LEADERSHIP', 'SECURITY', 'NEGOTIATION');
CREATE TYPE "AvatarSessionStatus" AS ENUM ('IN_PROGRESS', 'PAUSED', 'COMPLETED', 'ABANDONED');
CREATE TYPE "EventType" AS ENUM ('TRAINING', 'WORKSHOP', 'WEBINAR', 'LIVE_CLASS', 'HACKATHON', 'MENTORING', 'CORPORATE', 'ONBOARDING', 'NETWORKING', 'EXTERNAL', 'TALK');
CREATE TYPE "EventModalidade" AS ENUM ('ONLINE', 'PRESENCIAL', 'HYBRID');
CREATE TYPE "EventParticipantStatus" AS ENUM ('PENDING', 'CONFIRMED', 'WAITLIST', 'PRESENT', 'ABSENT', 'CANCELLED', 'NO_SHOW');

-- EventStatus já existia declarado (sem nenhum campo a usá-lo) com valores
-- errados — nenhuma coluna depende dele, seguro fazer DROP + recriar.
DROP TYPE "EventStatus";
CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'LIVE', 'ENDED', 'CANCELLED');
CREATE TYPE "InstructorType" AS ENUM ('MASTER', 'SENIOR', 'STANDARD', 'MENTOR', 'EXTERNAL');
CREATE TYPE "CohortModalidade" AS ENUM ('ONLINE', 'PRESENCIAL', 'HYBRID');
CREATE TYPE "CohortStatus" AS ENUM ('DRAFT', 'OPEN', 'ACTIVE', 'CLOSED', 'CANCELLED');
CREATE TYPE "CohortParticipantStatus" AS ENUM ('ACTIVE');

-- ─── ContentAsset ───────────────────────────────────────────────────────────

ALTER TABLE "ContentAsset" ALTER COLUMN "type" TYPE "ContentFormat" USING "type"::"ContentFormat";

ALTER TABLE "ContentAsset" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "ContentAsset" ALTER COLUMN "status" TYPE "ContentAssetStatus" USING "status"::"ContentAssetStatus";
ALTER TABLE "ContentAsset" ALTER COLUMN "status" SET DEFAULT 'DRAFT';

ALTER TABLE "ContentAsset" ALTER COLUMN "level" TYPE "ContentAssetLevel" USING "level"::"ContentAssetLevel";
ALTER TABLE "ContentAsset" ALTER COLUMN "category" TYPE "ContentCategory" USING "category"::"ContentCategory";

-- ─── Avatar ─────────────────────────────────────────────────────────────────

ALTER TABLE "AvatarScenario" ALTER COLUMN "difficulty" DROP DEFAULT;
ALTER TABLE "AvatarScenario" ALTER COLUMN "difficulty" TYPE "Difficulty" USING "difficulty"::"Difficulty";
ALTER TABLE "AvatarScenario" ALTER COLUMN "difficulty" SET DEFAULT 'BEGINNER';

ALTER TABLE "AvatarScenario" ALTER COLUMN "category" TYPE "ScenarioCategory" USING "category"::"ScenarioCategory";

ALTER TABLE "AvatarSession" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "AvatarSession" ALTER COLUMN "status" TYPE "AvatarSessionStatus" USING "status"::"AvatarSessionStatus";
ALTER TABLE "AvatarSession" ALTER COLUMN "status" SET DEFAULT 'IN_PROGRESS';

-- ─── Eventos ────────────────────────────────────────────────────────────────

ALTER TABLE "Event" ALTER COLUMN "type" DROP DEFAULT;
ALTER TABLE "Event" ALTER COLUMN "type" TYPE "EventType" USING "type"::"EventType";
ALTER TABLE "Event" ALTER COLUMN "type" SET DEFAULT 'TRAINING';

ALTER TABLE "Event" ALTER COLUMN "modalidade" DROP DEFAULT;
ALTER TABLE "Event" ALTER COLUMN "modalidade" TYPE "EventModalidade" USING "modalidade"::"EventModalidade";
ALTER TABLE "Event" ALTER COLUMN "modalidade" SET DEFAULT 'ONLINE';

ALTER TABLE "Event" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Event" ALTER COLUMN "status" TYPE "EventStatus" USING "status"::"EventStatus";
ALTER TABLE "Event" ALTER COLUMN "status" SET DEFAULT 'DRAFT';

ALTER TABLE "EventParticipant" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "EventParticipant" ALTER COLUMN "status" TYPE "EventParticipantStatus" USING "status"::"EventParticipantStatus";
ALTER TABLE "EventParticipant" ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- ─── Instrutor / Marketplace ────────────────────────────────────────────────

ALTER TABLE "InstructorProfile" ALTER COLUMN "instructorType" DROP DEFAULT;
ALTER TABLE "InstructorProfile" ALTER COLUMN "instructorType" TYPE "InstructorType" USING "instructorType"::"InstructorType";
ALTER TABLE "InstructorProfile" ALTER COLUMN "instructorType" SET DEFAULT 'STANDARD';

ALTER TABLE "InstructorCohort" ALTER COLUMN "modalidade" DROP DEFAULT;
ALTER TABLE "InstructorCohort" ALTER COLUMN "modalidade" TYPE "CohortModalidade" USING "modalidade"::"CohortModalidade";
ALTER TABLE "InstructorCohort" ALTER COLUMN "modalidade" SET DEFAULT 'ONLINE';

ALTER TABLE "InstructorCohort" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "InstructorCohort" ALTER COLUMN "status" TYPE "CohortStatus" USING "status"::"CohortStatus";
ALTER TABLE "InstructorCohort" ALTER COLUMN "status" SET DEFAULT 'OPEN';

ALTER TABLE "CohortParticipant" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "CohortParticipant" ALTER COLUMN "status" TYPE "CohortParticipantStatus" USING "status"::"CohortParticipantStatus";
ALTER TABLE "CohortParticipant" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
