-- AddForeignKey
ALTER TABLE "PayslipDispute" ADD CONSTRAINT "PayslipDispute_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
