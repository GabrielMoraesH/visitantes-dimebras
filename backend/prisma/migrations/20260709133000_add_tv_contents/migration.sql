-- CreateEnum
CREATE TYPE "TvContentType" AS ENUM ('IMAGE', 'VIDEO');

-- CreateTable
CREATE TABLE "tv_contents" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "type" "TvContentType" NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileName" TEXT,
    "mimeType" TEXT,
    "fileSize" INTEGER,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "branchId" INTEGER NOT NULL,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tv_contents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tv_contents_branchId_idx" ON "tv_contents"("branchId");

-- CreateIndex
CREATE INDEX "tv_contents_isActive_idx" ON "tv_contents"("isActive");

-- CreateIndex
CREATE INDEX "tv_contents_order_idx" ON "tv_contents"("order");

-- AddForeignKey
ALTER TABLE "tv_contents" ADD CONSTRAINT "tv_contents_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tv_contents" ADD CONSTRAINT "tv_contents_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
