CREATE UNIQUE INDEX "visits_one_open_per_visitor_branch_idx"
ON "visits"("visitorId", "branchId")
WHERE "checkoutAt" IS NULL;
