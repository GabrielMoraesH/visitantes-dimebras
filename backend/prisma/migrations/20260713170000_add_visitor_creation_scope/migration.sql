-- AlterTable
ALTER TABLE "visitors"
ADD COLUMN "createdById" INTEGER,
ADD COLUMN "createdInBranchId" INTEGER;

-- CreateIndex
CREATE INDEX "visitors_createdById_idx" ON "visitors"("createdById");

-- CreateIndex
CREATE INDEX "visitors_createdInBranchId_idx" ON "visitors"("createdInBranchId");

-- AddForeignKey
ALTER TABLE "visitors" ADD CONSTRAINT "visitors_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visitors" ADD CONSTRAINT "visitors_createdInBranchId_fkey" FOREIGN KEY ("createdInBranchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
