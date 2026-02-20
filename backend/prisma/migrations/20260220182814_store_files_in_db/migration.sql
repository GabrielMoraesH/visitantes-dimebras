/*
  Warnings:

  - You are about to drop the column `documentBackPath` on the `visitors` table. All the data in the column will be lost.
  - You are about to drop the column `documentFrontPath` on the `visitors` table. All the data in the column will be lost.
  - You are about to drop the column `documentUpdatedAt` on the `visitors` table. All the data in the column will be lost.
  - You are about to drop the column `photoPath` on the `visitors` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "visitors" DROP COLUMN "documentBackPath",
DROP COLUMN "documentFrontPath",
DROP COLUMN "documentUpdatedAt",
DROP COLUMN "photoPath",
ADD COLUMN     "documentBackBytes" BYTEA,
ADD COLUMN     "documentBackMime" TEXT,
ADD COLUMN     "documentFrontBytes" BYTEA,
ADD COLUMN     "documentFrontMime" TEXT,
ADD COLUMN     "photoBytes" BYTEA,
ADD COLUMN     "photoMime" TEXT;
