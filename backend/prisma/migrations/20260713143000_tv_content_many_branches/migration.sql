-- CreateTable
CREATE TABLE "tv_content_branches" (
    "tvContentId" INTEGER NOT NULL,
    "branchId" INTEGER NOT NULL,

    CONSTRAINT "tv_content_branches_pkey" PRIMARY KEY ("tvContentId","branchId")
);

-- Preserve current one-branch assignments before removing tv_contents.branchId.
INSERT INTO "tv_content_branches" ("tvContentId", "branchId")
SELECT "id", "branchId"
FROM "tv_contents"
WHERE "branchId" IS NOT NULL
ON CONFLICT ("tvContentId", "branchId") DO NOTHING;

-- DropForeignKey
ALTER TABLE "tv_contents" DROP CONSTRAINT "tv_contents_branchId_fkey";

-- DropIndex
DROP INDEX "tv_contents_branchId_idx";

-- AlterTable
ALTER TABLE "tv_contents" DROP COLUMN "branchId";

-- CreateIndex
CREATE INDEX "tv_content_branches_branchId_idx" ON "tv_content_branches"("branchId");

-- AddForeignKey
ALTER TABLE "tv_content_branches" ADD CONSTRAINT "tv_content_branches_tvContentId_fkey" FOREIGN KEY ("tvContentId") REFERENCES "tv_contents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tv_content_branches" ADD CONSTRAINT "tv_content_branches_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
