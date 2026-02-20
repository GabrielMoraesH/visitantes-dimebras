-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('RECEPCAO', 'ADMIN');

-- CreateTable
CREATE TABLE "branches" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'RECEPCAO',
    "branchId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visitors" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "cpf" TEXT NOT NULL,
    "phone" TEXT,
    "company" TEXT,
    "photoPath" TEXT,
    "documentPath" TEXT,
    "photoUpdatedAt" TIMESTAMP(3),
    "documentUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "visitors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visits" (
    "id" SERIAL NOT NULL,
    "visitCode" TEXT NOT NULL,
    "visitorId" INTEGER NOT NULL,
    "branchId" INTEGER NOT NULL,
    "serviceType" TEXT,
    "attendedBy" TEXT,
    "areaToVisit" TEXT,
    "checkinAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkoutAt" TIMESTAMP(3),
    "checkinByUserId" INTEGER NOT NULL,
    "checkoutByUserId" INTEGER,

    CONSTRAINT "visits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "visitors_cpf_key" ON "visitors"("cpf");

-- CreateIndex
CREATE UNIQUE INDEX "visits_visitCode_key" ON "visits"("visitCode");

-- CreateIndex
CREATE INDEX "visits_visitorId_idx" ON "visits"("visitorId");

-- CreateIndex
CREATE INDEX "visits_branchId_idx" ON "visits"("branchId");

-- CreateIndex
CREATE INDEX "visits_checkinAt_idx" ON "visits"("checkinAt");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "visitors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_checkinByUserId_fkey" FOREIGN KEY ("checkinByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_checkoutByUserId_fkey" FOREIGN KEY ("checkoutByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
