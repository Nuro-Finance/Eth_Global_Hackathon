-- Migration 048 — widen merchant_category_raw + defensive widening of merchant_name
--
-- S35 M11 Day-4. The 30s SD3→DB→FE sync loop has been silently failing
-- since SD3 started returning longer MCC descriptions. Concrete repro:
-- CAFE WEST returns merchantCategory =
--   "Colleges, Universities, Professional Schools, and Junior Colleges"
-- which is 65 chars — overflows the existing varchar(50) column. Postgres
-- aborts the INSERT with `value too long for type character varying(50)`,
-- the for-loop in syncIssuerTransactions throws, the watermark never
-- advances, and EVERY subsequent sync hits the same failure mode for as
-- long as the offending tx is in the 24h lookback window.
--
-- User-visible symptom: Richard's transactions tab is 5 rows behind reality
-- (latest visible row is May 7 9:32 AM; SD3 already has rows up through
-- May 8 01:51 AM).
--
-- Schema fix: widen merchant_category_raw 50→255 and merchant_name
-- 200→255. Both columns are dimension-style metadata; no index changes
-- needed. Pairs with a defensive truncate in mapSd3SpendToCardTx so we
-- never trip a future bound from the application side.

ALTER TABLE card_transactions
  ALTER COLUMN merchant_category_raw TYPE VARCHAR(255);

ALTER TABLE card_transactions
  ALTER COLUMN merchant_name TYPE VARCHAR(255);
