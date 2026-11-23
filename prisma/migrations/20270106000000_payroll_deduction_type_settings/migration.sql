-- CreateTable
CREATE TABLE "DeductionTypeSetting" (
    "code" TEXT NOT NULL,
    "mandatory" BOOLEAN,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeductionTypeSetting_pkey" PRIMARY KEY ("code")
);
