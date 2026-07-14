-- CreateEnum
CREATE TYPE "AgendaStatus" AS ENUM ('AGENDADO', 'CANCELADO');

-- CreateTable
CREATE TABLE "agenda_events" (
    "id" SERIAL NOT NULL,
    "visitorName" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "eventWith" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "eventDateTime" TIMESTAMP(3) NOT NULL,
    "observation" TEXT,
    "status" "AgendaStatus" NOT NULL DEFAULT 'AGENDADO',
    "branchId" INTEGER NOT NULL,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agenda_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agenda_events_eventDateTime_idx" ON "agenda_events"("eventDateTime");

-- CreateIndex
CREATE INDEX "agenda_events_branchId_idx" ON "agenda_events"("branchId");

-- AddForeignKey
ALTER TABLE "agenda_events" ADD CONSTRAINT "agenda_events_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agenda_events" ADD CONSTRAINT "agenda_events_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
