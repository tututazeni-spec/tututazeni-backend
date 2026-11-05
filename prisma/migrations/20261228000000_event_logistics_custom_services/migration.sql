ALTER TABLE "EventLogistics" ADD COLUMN "customServices" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "EventLogistics" ADD COLUMN "serviceCosts" JSONB;
