/*
  Warnings:

  - You are about to drop the column `documentBackUpdatedPath` on the `visitors` table. All the data in the column will be lost.
  - You are about to drop the column `documentFrontUpdatedPath` on the `visitors` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "visitors" DROP COLUMN "documentBackUpdatedPath",
DROP COLUMN "documentFrontUpdatedPath",
ADD COLUMN     "documentBackUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "documentFrontUpdatedAt" TIMESTAMP(3);
