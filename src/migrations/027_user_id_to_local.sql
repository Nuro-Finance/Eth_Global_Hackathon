-- Migration 027: user_id semantic rewrite — Session 27
-- Created: 2026-04-21
--
-- WHY THIS EXISTS
--   transactions.user_id and deposit_addresses.user_id have been storing
--   the SD3 issuer_user_id value, not the local users.id. This caused
--   the Session 22 "mangled card" class of bug: if a local user ever
--   shares an issuer_user_id with another local user (demo linking),
--   their transactions collapse together. For the Session 26 dashboard
--   puzzle: Richard's Gmail account (db01a59c) saw Chris's deposits
--   ($6.84) because their issuer_user_ids matched from a demo link.
--
--   The cards table uses local users.id correctly. This migration
--   harmonizes transactions + deposit_addresses to match that pattern.
--
-- WHAT WE DO
--   UPDATE transactions.user_id and deposit_addresses.user_id from
--   the SD3 value to the local users.id, mapping via
--   `users.issuer_user_id = OLD_VALUE OR users.sd3_user_id = OLD_VALUE`.
--
-- WHAT WE DO NOT DO
--   Do NOT touch the `address` column in deposit_addresses. On-chain
--   addresses are HD-derived from the SD3 UUID and must stay stable —
--   users who previously sent funds to an address need that address
--   to keep working. Only the user_id column value migrates.
--
--   Orphan rows (test fixtures + one failed SD3 session for 4422e442)
--   are left alone. They're not connected to any users row and can't
--   be mapped. They'll sit as legacy orphans until manually cleaned.
--
-- CODE COUPLING (deploy with this migration atomically)
--   - src/nuro-routes.ts: saveDepositAddress(sd3UserId|issuerUserId, ...)
--     → saveDepositAddress(userId, ...) on every write site. HD seed
--     still uses sd3UserId (on-chain addresses unchanged).
--   - src/nuro-routes.ts line 782: stop the issuer_user_id lookup,
--     query transactions WHERE user_id = $local_user_id directly.
--   - src/monitor.ts: no change — already reads deposit_addresses.user_id
--     and passes it through to transactions.user_id insert (correct
--     semantic after migration).
--
-- ROLLBACK
--   _migration_027_backup table captures the OLD→NEW mapping per row.
--   If rollback needed:
--     UPDATE transactions t SET user_id = b.old_user_id
--     FROM _migration_027_backup b
--     WHERE b.source_table = 'transactions' AND b.id = t.id::text;
--     (similar for deposit_addresses via user_id+chain composite key)

BEGIN;

-- 1. Snapshot current mappings for rollback
DROP TABLE IF EXISTS _migration_027_backup;
CREATE TABLE _migration_027_backup (
    source_table TEXT NOT NULL,
    row_key      TEXT NOT NULL,  -- tx id for transactions, user_id||'/'||chain for deposit_addresses
    old_user_id  TEXT NOT NULL,
    new_user_id  TEXT,
    applied_at   TIMESTAMPTZ DEFAULT now()
);

-- 2. Record transactions mapping
INSERT INTO _migration_027_backup (source_table, row_key, old_user_id, new_user_id)
SELECT 'transactions', t.id::text, t.user_id,
       (SELECT u.id FROM users u
         WHERE u.issuer_user_id = t.user_id
            OR u.sd3_user_id    = t.user_id
         LIMIT 1)
FROM transactions t
WHERE t.user_id IN (
    SELECT issuer_user_id FROM users WHERE issuer_user_id IS NOT NULL
    UNION
    SELECT sd3_user_id    FROM users WHERE sd3_user_id    IS NOT NULL
);

-- 3. Apply transactions migration
UPDATE transactions t
SET user_id = (
    SELECT u.id FROM users u
     WHERE u.issuer_user_id = t.user_id
        OR u.sd3_user_id    = t.user_id
     LIMIT 1
)
WHERE t.user_id IN (
    SELECT issuer_user_id FROM users WHERE issuer_user_id IS NOT NULL
    UNION
    SELECT sd3_user_id    FROM users WHERE sd3_user_id    IS NOT NULL
);

-- 4. Record deposit_addresses mapping
INSERT INTO _migration_027_backup (source_table, row_key, old_user_id, new_user_id)
SELECT 'deposit_addresses', da.user_id || '/' || da.chain, da.user_id,
       (SELECT u.id FROM users u
         WHERE u.issuer_user_id = da.user_id
            OR u.sd3_user_id    = da.user_id
         LIMIT 1)
FROM deposit_addresses da
WHERE da.user_id IN (
    SELECT issuer_user_id FROM users WHERE issuer_user_id IS NOT NULL
    UNION
    SELECT sd3_user_id    FROM users WHERE sd3_user_id    IS NOT NULL
);

-- 5. Apply deposit_addresses migration
UPDATE deposit_addresses da
SET user_id = (
    SELECT u.id FROM users u
     WHERE u.issuer_user_id = da.user_id
        OR u.sd3_user_id    = da.user_id
     LIMIT 1
)
WHERE da.user_id IN (
    SELECT issuer_user_id FROM users WHERE issuer_user_id IS NOT NULL
    UNION
    SELECT sd3_user_id    FROM users WHERE sd3_user_id    IS NOT NULL
);

COMMIT;

-- Post-migration verification query (run manually after commit to sanity check)
-- Expected: 73 transactions + 3 deposit_addresses now already_local, 0 mapped_via_issuer
--   SELECT 'transactions' AS tbl, COUNT(*) AS total,
--          COUNT(*) FILTER (WHERE user_id IN (SELECT id FROM users)) AS already_local,
--          COUNT(*) FILTER (WHERE user_id IN (SELECT issuer_user_id FROM users WHERE issuer_user_id IS NOT NULL)) AS mapped_via_issuer
--   FROM transactions
--   UNION ALL
--   SELECT 'deposit_addresses', COUNT(*),
--          COUNT(*) FILTER (WHERE user_id IN (SELECT id FROM users)),
--          COUNT(*) FILTER (WHERE user_id IN (SELECT issuer_user_id FROM users WHERE issuer_user_id IS NOT NULL))
--   FROM deposit_addresses;
