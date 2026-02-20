/*
  Warnings:

  - You are about to drop the column `documentPath` on the `visitors` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "visitors" DROP COLUMN "documentPath",
ADD COLUMN     "documentBackPath" TEXT,
ADD COLUMN     "documentBackUpdatedPath" TIMESTAMP(3),
ADD COLUMN     "documentFrontPath" TEXT,
ADD COLUMN     "documentFrontUpdatedPath" TIMESTAMP(3);
