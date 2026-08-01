-- AlterTable
ALTER TABLE "AvatarScenario" ADD COLUMN     "category" TEXT,
ALTER COLUMN "difficulty" SET DEFAULT 'BEGINNER',
ALTER COLUMN "difficulty" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "AvatarSession" ADD COLUMN     "avatarId" INTEGER,
ADD COLUMN     "behavioralScore" TEXT,
ADD COLUMN     "confidenceLevel" INTEGER,
ADD COLUMN     "conversationHistory" TEXT,
ADD COLUMN     "durationSeconds" INTEGER,
ADD COLUMN     "language" TEXT,
ADD COLUMN     "reflection" TEXT,
ADD COLUMN     "userRating" INTEGER;
