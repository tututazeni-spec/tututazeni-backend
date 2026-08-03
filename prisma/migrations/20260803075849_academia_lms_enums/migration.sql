-- CreateEnum
CREATE TYPE "CourseLevel" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED');
CREATE TYPE "CourseStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "ModuleStatus" AS ENUM ('DRAFT', 'PUBLISHED');
CREATE TYPE "ModuleType" AS ENUM ('THEORETICAL', 'PRACTICAL', 'ASSESSMENT', 'PROJECT');
CREATE TYPE "ProgressionType" AS ENUM ('SEQUENTIAL', 'FREE', 'HYBRID');
CREATE TYPE "CompletionRule" AS ENUM ('ALL_LESSONS', 'MIN_PERCENT', 'QUIZ_PASS', 'COMBINED');
CREATE TYPE "LessonType" AS ENUM ('VIDEO', 'PDF', 'TEXT', 'AUDIO', 'SLIDE', 'LINK', 'SCORM', 'QUIZ');
CREATE TYPE "EnrollmentOrigin" AS ENUM ('MANUAL', 'SELF_ENROLL', 'LEARNING_PATH', 'ONBOARDING', 'RULE_ENGINE', 'CAMPAIGN', 'AI_TUTOR', 'INSTRUCTOR');
CREATE TYPE "QuizQuestionType" AS ENUM ('MULTIPLE_CHOICE', 'TRUE_FALSE', 'OPEN');
CREATE TYPE "LearningPathLevel" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED');
CREATE TYPE "LearningPathType" AS ENUM ('ONBOARDING', 'UPSKILLING', 'RESKILLING', 'COMPLIANCE', 'LEADERSHIP', 'CERTIFICATION', 'CUSTOM');
CREATE TYPE "LearningPathStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "AssignmentTarget" AS ENUM ('USER', 'DEPARTMENT', 'POSITION', 'UNIT', 'ROLE');
CREATE TYPE "LearningPathEnrollmentStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'EXPIRED');
CREATE TYPE "AssessmentType" AS ENUM ('QUIZ', 'EXAM', 'DIAGNOSTIC', 'PRACTICAL', 'SURVEY');
CREATE TYPE "AssessmentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "FeedbackMode" AS ENUM ('IMMEDIATE', 'ON_SUBMIT', 'RESULT_ONLY');
CREATE TYPE "QuestionType" AS ENUM ('MULTIPLE_CHOICE_SINGLE', 'MULTIPLE_CHOICE_MULTI', 'TRUE_FALSE', 'OPEN_TEXT', 'FILE_UPLOAD', 'MATCHING', 'ORDERING');
CREATE TYPE "AttemptStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'PASSED', 'FAILED', 'EXPIRED');
CREATE TYPE "CompetencyCategory" AS ENUM ('HARD_SKILL', 'SOFT_SKILL', 'LANGUAGE', 'TOOL', 'LEADERSHIP');
CREATE TYPE "CompetencyType" AS ENUM ('BEHAVIORAL', 'HARD_SKILL', 'SOFT_SKILL', 'CULTURE', 'LEADERSHIP', 'VITALITY', 'CUSTOM');
CREATE TYPE "CompetencyStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "CompetencySource" AS ENUM ('MANUAL', 'COURSE', 'ASSESSMENT', 'MANAGER', 'HRIS');
CREATE TYPE "MappingPriority" AS ENUM ('MANDATORY', 'OPTIONAL');

-- AlterTable: Course
ALTER TABLE "Course" ALTER COLUMN "level" DROP DEFAULT;
ALTER TABLE "Course" ALTER COLUMN "level" TYPE "CourseLevel" USING ("level"::"CourseLevel");
ALTER TABLE "Course" ALTER COLUMN "level" SET DEFAULT 'BEGINNER';
ALTER TABLE "Course" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Course" ALTER COLUMN "status" TYPE "CourseStatus" USING ("status"::"CourseStatus");
ALTER TABLE "Course" ALTER COLUMN "status" SET DEFAULT 'DRAFT';

-- AlterTable: CourseModule
ALTER TABLE "CourseModule" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "CourseModule" ALTER COLUMN "status" TYPE "ModuleStatus" USING ("status"::"ModuleStatus");
ALTER TABLE "CourseModule" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
ALTER TABLE "CourseModule" ALTER COLUMN "type" TYPE "ModuleType" USING ("type"::"ModuleType");
ALTER TABLE "CourseModule" ALTER COLUMN "progressionType" DROP DEFAULT;
ALTER TABLE "CourseModule" ALTER COLUMN "progressionType" TYPE "ProgressionType" USING ("progressionType"::"ProgressionType");
ALTER TABLE "CourseModule" ALTER COLUMN "progressionType" SET DEFAULT 'SEQUENTIAL';
ALTER TABLE "CourseModule" ALTER COLUMN "completionRule" DROP DEFAULT;
ALTER TABLE "CourseModule" ALTER COLUMN "completionRule" TYPE "CompletionRule" USING ("completionRule"::"CompletionRule");
ALTER TABLE "CourseModule" ALTER COLUMN "completionRule" SET DEFAULT 'ALL_LESSONS';

-- AlterTable: Lesson
ALTER TABLE "Lesson" ALTER COLUMN "type" DROP DEFAULT;
ALTER TABLE "Lesson" ALTER COLUMN "type" TYPE "LessonType" USING ("type"::"LessonType");
ALTER TABLE "Lesson" ALTER COLUMN "type" SET DEFAULT 'VIDEO';

-- AlterTable: Enrollment
ALTER TABLE "Enrollment" ALTER COLUMN "origin" DROP DEFAULT;
ALTER TABLE "Enrollment" ALTER COLUMN "origin" TYPE "EnrollmentOrigin" USING ("origin"::"EnrollmentOrigin");
ALTER TABLE "Enrollment" ALTER COLUMN "origin" SET DEFAULT 'MANUAL';

-- AlterTable: QuizQuestion
ALTER TABLE "QuizQuestion" ALTER COLUMN "type" TYPE "QuizQuestionType" USING ("type"::"QuizQuestionType");

-- AlterTable: LearningPath
ALTER TABLE "LearningPath" ALTER COLUMN "level" DROP DEFAULT;
ALTER TABLE "LearningPath" ALTER COLUMN "level" TYPE "LearningPathLevel" USING ("level"::"LearningPathLevel");
ALTER TABLE "LearningPath" ALTER COLUMN "level" SET DEFAULT 'BEGINNER';
ALTER TABLE "LearningPath" ALTER COLUMN "pathType" DROP DEFAULT;
ALTER TABLE "LearningPath" ALTER COLUMN "pathType" TYPE "LearningPathType" USING ("pathType"::"LearningPathType");
ALTER TABLE "LearningPath" ALTER COLUMN "pathType" SET DEFAULT 'CUSTOM';
ALTER TABLE "LearningPath" ALTER COLUMN "progressionType" DROP DEFAULT;
ALTER TABLE "LearningPath" ALTER COLUMN "progressionType" TYPE "ProgressionType" USING ("progressionType"::"ProgressionType");
ALTER TABLE "LearningPath" ALTER COLUMN "progressionType" SET DEFAULT 'SEQUENTIAL';
ALTER TABLE "LearningPath" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "LearningPath" ALTER COLUMN "status" TYPE "LearningPathStatus" USING ("status"::"LearningPathStatus");
ALTER TABLE "LearningPath" ALTER COLUMN "status" SET DEFAULT 'DRAFT';

-- AlterTable: LearningPathAssignment
ALTER TABLE "LearningPathAssignment" ALTER COLUMN "targetType" TYPE "AssignmentTarget" USING ("targetType"::"AssignmentTarget");

-- AlterTable: LearningPathEnrollment
ALTER TABLE "LearningPathEnrollment" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "LearningPathEnrollment" ALTER COLUMN "status" TYPE "LearningPathEnrollmentStatus" USING ("status"::"LearningPathEnrollmentStatus");
ALTER TABLE "LearningPathEnrollment" ALTER COLUMN "status" SET DEFAULT 'NOT_STARTED';

-- AlterTable: Assessment
ALTER TABLE "Assessment" ALTER COLUMN "type" DROP DEFAULT;
ALTER TABLE "Assessment" ALTER COLUMN "type" TYPE "AssessmentType" USING ("type"::"AssessmentType");
ALTER TABLE "Assessment" ALTER COLUMN "type" SET DEFAULT 'QUIZ';
ALTER TABLE "Assessment" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Assessment" ALTER COLUMN "status" TYPE "AssessmentStatus" USING ("status"::"AssessmentStatus");
ALTER TABLE "Assessment" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
ALTER TABLE "Assessment" ALTER COLUMN "feedbackMode" DROP DEFAULT;
ALTER TABLE "Assessment" ALTER COLUMN "feedbackMode" TYPE "FeedbackMode" USING ("feedbackMode"::"FeedbackMode");
ALTER TABLE "Assessment" ALTER COLUMN "feedbackMode" SET DEFAULT 'ON_SUBMIT';

-- AlterTable: AssessmentQuestion
ALTER TABLE "AssessmentQuestion" ALTER COLUMN "type" TYPE "QuestionType" USING ("type"::"QuestionType");

-- AlterTable: AssessmentAttempt
ALTER TABLE "AssessmentAttempt" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "AssessmentAttempt" ALTER COLUMN "status" TYPE "AttemptStatus" USING ("status"::"AttemptStatus");
ALTER TABLE "AssessmentAttempt" ALTER COLUMN "status" SET DEFAULT 'IN_PROGRESS';

-- AlterTable: Competency
ALTER TABLE "Competency" ALTER COLUMN "category" DROP DEFAULT;
ALTER TABLE "Competency" ALTER COLUMN "category" TYPE "CompetencyCategory" USING ("category"::"CompetencyCategory");
ALTER TABLE "Competency" ALTER COLUMN "category" SET DEFAULT 'HARD_SKILL';
ALTER TABLE "Competency" ALTER COLUMN "type" DROP DEFAULT;
ALTER TABLE "Competency" ALTER COLUMN "type" TYPE "CompetencyType" USING ("type"::"CompetencyType");
ALTER TABLE "Competency" ALTER COLUMN "type" SET DEFAULT 'BEHAVIORAL';
ALTER TABLE "Competency" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Competency" ALTER COLUMN "status" TYPE "CompetencyStatus" USING ("status"::"CompetencyStatus");
ALTER TABLE "Competency" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';

-- AlterTable: UserCompetency
ALTER TABLE "UserCompetency" ALTER COLUMN "source" DROP DEFAULT;
ALTER TABLE "UserCompetency" ALTER COLUMN "source" TYPE "CompetencySource" USING ("source"::"CompetencySource");
ALTER TABLE "UserCompetency" ALTER COLUMN "source" SET DEFAULT 'MANUAL';

-- AlterTable: CompetencyEvolutionLog
ALTER TABLE "CompetencyEvolutionLog" ALTER COLUMN "source" TYPE "CompetencySource" USING ("source"::"CompetencySource");

-- AlterTable: PositionCompetency
ALTER TABLE "PositionCompetency" ALTER COLUMN "priority" DROP DEFAULT;
ALTER TABLE "PositionCompetency" ALTER COLUMN "priority" TYPE "MappingPriority" USING ("priority"::"MappingPriority");
ALTER TABLE "PositionCompetency" ALTER COLUMN "priority" SET DEFAULT 'MANDATORY';
