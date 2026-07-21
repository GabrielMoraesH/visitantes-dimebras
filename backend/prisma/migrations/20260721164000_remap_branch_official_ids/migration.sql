BEGIN;

CREATE TEMP TABLE branch_relationship_counts_before ON COMMIT DROP AS
SELECT
  b.name,
  (SELECT COUNT(*)::integer FROM "users" u WHERE u."branchId" = b.id) AS users_count,
  (SELECT COUNT(*)::integer FROM "visits" v WHERE v."branchId" = b.id) AS visits_count,
  (SELECT COUNT(*)::integer FROM "visitors" vi WHERE vi."createdInBranchId" = b.id) AS visitors_created_count,
  (SELECT COUNT(*)::integer FROM "agenda_events" ae WHERE ae."branchId" = b.id) AS agenda_events_count,
  (SELECT COUNT(*)::integer FROM "tv_content_branches" tcb WHERE tcb."branchId" = b.id) AS tv_content_links_count
FROM "branches" b;

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM "branches") <> 5 THEN
    RAISE EXCEPTION 'Expected exactly 5 branches before branch ID remap.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "branches"
    GROUP BY "name"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate branch names found before branch ID remap.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "branches"
    WHERE "name" NOT IN ('Dimebras PR', 'Dimebras MT', 'Dimebras MS', 'Dimebras SC', 'Alfamed MS')
  ) THEN
    RAISE EXCEPTION 'Unexpected branch name found before branch ID remap.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM "branches" WHERE "id" = 1 AND "name" = 'Dimebras PR')
    OR NOT EXISTS (SELECT 1 FROM "branches" WHERE "id" = 2 AND "name" = 'Dimebras MT')
    OR NOT EXISTS (SELECT 1 FROM "branches" WHERE "id" = 4 AND "name" = 'Dimebras MS')
    OR NOT EXISTS (SELECT 1 FROM "branches" WHERE "id" = 5 AND "name" = 'Dimebras SC')
    OR NOT EXISTS (SELECT 1 FROM "branches" WHERE "id" = 6 AND "name" = 'Alfamed MS') THEN
    RAISE EXCEPTION 'Current branch ID/name state does not match the expected pre-remap state.';
  END IF;

  IF EXISTS (SELECT 1 FROM "branches" WHERE "id" = 3) THEN
    RAISE EXCEPTION 'Branch ID 3 must be free before branch ID remap.';
  END IF;

  IF EXISTS (SELECT 1 FROM "branches" WHERE "id" > 6 OR "id" NOT IN (1, 2, 4, 5, 6)) THEN
    RAISE EXCEPTION 'Unexpected branch ID found before branch ID remap.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "users" u
    LEFT JOIN "branches" b ON b."id" = u."branchId"
    WHERE b."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Orphan users.branchId references found before branch ID remap.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "visits" v
    LEFT JOIN "branches" b ON b."id" = v."branchId"
    WHERE b."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Orphan visits.branchId references found before branch ID remap.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "visitors" vi
    LEFT JOIN "branches" b ON b."id" = vi."createdInBranchId"
    WHERE vi."createdInBranchId" IS NOT NULL AND b."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Orphan visitors.createdInBranchId references found before branch ID remap.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "agenda_events" ae
    LEFT JOIN "branches" b ON b."id" = ae."branchId"
    WHERE b."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Orphan agenda_events.branchId references found before branch ID remap.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "tv_content_branches" tcb
    LEFT JOIN "branches" b ON b."id" = tcb."branchId"
    WHERE b."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Orphan tv_content_branches.branchId references found before branch ID remap.';
  END IF;
END $$;

UPDATE "branches" SET "id" = -2 WHERE "id" = 6 AND "name" = 'Alfamed MS';
UPDATE "branches" SET "id" = -3 WHERE "id" = 2 AND "name" = 'Dimebras MT';
UPDATE "branches" SET "id" = -5 WHERE "id" = 4 AND "name" = 'Dimebras MS';
UPDATE "branches" SET "id" = -6 WHERE "id" = 5 AND "name" = 'Dimebras SC';

UPDATE "branches" SET "id" = 2 WHERE "id" = -2 AND "name" = 'Alfamed MS';
UPDATE "branches" SET "id" = 3 WHERE "id" = -3 AND "name" = 'Dimebras MT';
UPDATE "branches" SET "id" = 5 WHERE "id" = -5 AND "name" = 'Dimebras MS';
UPDATE "branches" SET "id" = 6 WHERE "id" = -6 AND "name" = 'Dimebras SC';

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM "branches") <> 5 THEN
    RAISE EXCEPTION 'Expected exactly 5 branches after branch ID remap.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM "branches" WHERE "id" = 1 AND "name" = 'Dimebras PR')
    OR NOT EXISTS (SELECT 1 FROM "branches" WHERE "id" = 2 AND "name" = 'Alfamed MS')
    OR NOT EXISTS (SELECT 1 FROM "branches" WHERE "id" = 3 AND "name" = 'Dimebras MT')
    OR NOT EXISTS (SELECT 1 FROM "branches" WHERE "id" = 5 AND "name" = 'Dimebras MS')
    OR NOT EXISTS (SELECT 1 FROM "branches" WHERE "id" = 6 AND "name" = 'Dimebras SC') THEN
    RAISE EXCEPTION 'Final branch ID/name state does not match the official mapping.';
  END IF;

  IF EXISTS (SELECT 1 FROM "branches" WHERE "id" = 4) THEN
    RAISE EXCEPTION 'Branch ID 4 must remain unused after branch ID remap.';
  END IF;

  IF EXISTS (SELECT 1 FROM "branches" WHERE "id" < 0) THEN
    RAISE EXCEPTION 'Temporary negative branch IDs remain after branch ID remap.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "users" u
    LEFT JOIN "branches" b ON b."id" = u."branchId"
    WHERE b."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Orphan users.branchId references found after branch ID remap.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "visits" v
    LEFT JOIN "branches" b ON b."id" = v."branchId"
    WHERE b."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Orphan visits.branchId references found after branch ID remap.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "visitors" vi
    LEFT JOIN "branches" b ON b."id" = vi."createdInBranchId"
    WHERE vi."createdInBranchId" IS NOT NULL AND b."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Orphan visitors.createdInBranchId references found after branch ID remap.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "agenda_events" ae
    LEFT JOIN "branches" b ON b."id" = ae."branchId"
    WHERE b."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Orphan agenda_events.branchId references found after branch ID remap.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "tv_content_branches" tcb
    LEFT JOIN "branches" b ON b."id" = tcb."branchId"
    WHERE b."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Orphan tv_content_branches.branchId references found after branch ID remap.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM branch_relationship_counts_before before_counts
    JOIN "branches" b ON b."name" = before_counts."name"
    WHERE before_counts.users_count <> (SELECT COUNT(*)::integer FROM "users" u WHERE u."branchId" = b."id")
       OR before_counts.visits_count <> (SELECT COUNT(*)::integer FROM "visits" v WHERE v."branchId" = b."id")
       OR before_counts.visitors_created_count <> (SELECT COUNT(*)::integer FROM "visitors" vi WHERE vi."createdInBranchId" = b."id")
       OR before_counts.agenda_events_count <> (SELECT COUNT(*)::integer FROM "agenda_events" ae WHERE ae."branchId" = b."id")
       OR before_counts.tv_content_links_count <> (SELECT COUNT(*)::integer FROM "tv_content_branches" tcb WHERE tcb."branchId" = b."id")
  ) THEN
    RAISE EXCEPTION 'Branch relationship counts changed during branch ID remap.';
  END IF;
END $$;

SELECT setval(
  pg_get_serial_sequence('branches', 'id'),
  6,
  true
);

DO $$
DECLARE
  sequence_name text;
  sequence_last_value bigint;
  sequence_is_called boolean;
BEGIN
  sequence_name := pg_get_serial_sequence('branches', 'id');

  SELECT last_value, is_called
  INTO sequence_last_value, sequence_is_called
  FROM "branches_id_seq";

  IF sequence_name <> 'public.branches_id_seq'
    OR sequence_last_value <> 6
    OR sequence_is_called IS NOT TRUE THEN
    RAISE EXCEPTION 'branches id sequence was not synchronized to produce 7 as the next generated ID.';
  END IF;
END $$;

COMMIT;
