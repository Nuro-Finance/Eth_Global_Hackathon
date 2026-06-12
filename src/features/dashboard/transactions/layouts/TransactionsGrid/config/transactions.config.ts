import type { Transaction } from "../../../shared";

/**
 * 2026-05-07: removed `MOCK_TRANSACTIONS_DATA` array. It was 27 hardcoded
 * fake transactions ("From Pierre DC", "From Alessandro VN", "Netflix
 * Subscription" etc.) dating back to Chris's pre-API visual redesign.
 * Was exported but had no consumer; webpack still shipped it in the
 * bundle anyway, so the strings appeared in compiled chunks even though
 * they never rendered. Real transactions flow through /api/transactions.
 *
 * Type re-export kept so any stale type imports keep working through
 * the next refactor pass.
 */
export type { Transaction };

/**
 * Transaction type mappings for translations
 */
export const TRANSACTION_TYPE_KEYS: Record<string, string> = {};

/**
 * Transaction category mappings for translations
 */
export const TRANSACTION_CATEGORY_KEYS: Record<string, string> = {};

/**
 * Transaction status mappings for translations
 */
export const TRANSACTION_STATUS_KEYS: Record<string, string> = {};
