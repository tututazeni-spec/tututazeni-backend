-- CreateTable
CREATE TABLE "UserPriorExperience" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "company" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "years" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserPriorExperience_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserPriorExperience_userId_idx" ON "UserPriorExperience"("userId");

-- AddForeignKey
ALTER TABLE "UserPriorExperience" ADD CONSTRAINT "UserPriorExperience_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
