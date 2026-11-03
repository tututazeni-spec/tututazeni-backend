-- AlterTable
ALTER TABLE "User" ADD COLUMN "accessExpiresAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "InstructorInvite" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstructorInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InstructorInvite_tokenHash_key" ON "InstructorInvite"("tokenHash");
CREATE INDEX "InstructorInvite_userId_idx" ON "InstructorInvite"("userId");
CREATE INDEX "InstructorInvite_email_idx" ON "InstructorInvite"("email");

-- AddForeignKey
ALTER TABLE "InstructorInvite" ADD CONSTRAINT "InstructorInvite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
