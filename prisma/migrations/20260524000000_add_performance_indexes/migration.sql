-- Performance indexes for load testing (added 2026-05-24)
-- Fixes N+1 query bottlenecks identified in load/stress/spike tests

-- Compound index: eliminates full scan when filtering completed lessons by user+course
CREATE INDEX IF NOT EXISTS "LessonProgress_userId_completed_idx" ON "LessonProgress"("userId", "completed");

-- Index on enrollmentId: speeds up lessonProgress lookups per enrollment
CREATE INDEX IF NOT EXISTS "LessonProgress_enrollmentId_idx" ON "LessonProgress"("enrollmentId");

-- Index on createdAt: courses list ordered by createdAt was doing full-table sort
CREATE INDEX IF NOT EXISTS "Course_createdAt_idx" ON "Course"("createdAt");
