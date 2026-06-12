/**
 * Single source of truth for deposit-deduplication decisions.
 *
 * Before this existed, pollChain and processDeposit both ran nearly-identical
 * DB queries with different downstream logic. When the Session 22 cascade
 * required time-bounding the dedup window, TWO separate commits were needed
 * (2c3f213 + 8289573) — the same conceptual fix applied twice. This helper
 * collapses both call sites into one, so future window/status changes are a
 * single edit.
 *
 * Semantics:
 * 'skip' — there's a matching row; caller should log via
 * logMonitorSkip() + bail out (don't touch balance).
 * 'proceed' — no matching row; caller should continue to INSERT/bridge.
 * 'stale-retry' — a matching row exists BUT it's old enough (>1h failed,
 * >30min pending) that we should retry. For pending rows,
 * caller must first UPDATE status='failed' before
 * re-inserting — otherwise the old pending row lingers.
 *
 * The in-memory inflight lock (nonce-manager's isDepositProcessing) is
 * intentionally NOT checked here — it's a PER-PROCESS race guard that must
 * fire before this helper's DB round-trip. Keep them orthogonal.
 */
import { pool } from "../db";

export type DedupDecision =
    | { action: "skip"; reason: string; detail: string }
    | { action: "proceed" }
    | { action: "stale-retry"; staleTxId: string; staleStatus: "failed" | "pending" | "failed_restart" };

export interface DedupParams {
    userId: string;
    chainId: number;
    amountNum: number; // real USD amount (formatUnits'd), not raw BigNumber
    depositAddress: string;
}

/**
 * Look up any transaction row matching this user/chain/amount within the last
 * hour, and decide whether to skip, proceed, or treat as stale-retry.
 *
 * Amount match uses ±$0.001 tolerance to avoid float precision issues.
 * Window is 60 min — long enough to handle monitor crash-restarts, short
 * enough that a user depositing the same amount again 2h later isn't blocked.
 */
export async function checkDepositDedup(params: DedupParams): Promise<DedupDecision> {
    const DEDUP_WINDOW_MS = 60 * 60 * 1000;
    const FAILED_RETRY_AGE_MS = 60 * 60 * 1000; // auto-retry failed rows older than 1h
    const PENDING_RETRY_AGE_MS = 30 * 60 * 1000; // auto-retry pending rows older than 30min (assumed server-crash mid-bridge)

    const res = await pool.query(
        `SELECT id, status, timestamp FROM transactions
         WHERE user_id = $1 AND source_chain = $2
           AND amount BETWEEN $3 AND $4
           AND timestamp > $5
         ORDER BY timestamp DESC LIMIT 1`,
        [params.userId, params.chainId, params.amountNum - 0.001, params.amountNum + 0.001, Date.now() - DEDUP_WINDOW_MS]
    );

    if (res.rows.length === 0) return { action: "proceed" };

    const row = res.rows[0];
    const ageMs = Date.now() - (row.timestamp || 0);
    const amountStr = `amount=$${params.amountNum.toFixed(6)}`;

    if (row.status === "confirmed") {
        return {
            action: "skip",
            reason: "dedup:already-confirmed",
            detail: `${amountStr} matches confirmed tx ${row.id}`,
        };
    }

    if (row.status === "failed") {
        if (ageMs < FAILED_RETRY_AGE_MS) {
            return {
                action: "skip",
                reason: "dedup:failed-recently",
                detail: `${amountStr} matches failed tx ${row.id} (${Math.round(ageMs / 60000)}min ago, auto-retry after 1h)`,
            };
        }
        return { action: "stale-retry", staleTxId: row.id, staleStatus: "failed" };
    }

    if (row.status === "pending") {
        if (ageMs < PENDING_RETRY_AGE_MS) {
            return {
                action: "skip",
                reason: "dedup:pending-in-flight",
                detail: `${amountStr} matches pending tx ${row.id} (${Math.round(ageMs / 60000)}min ago)`,
            };
        }
        return { action: "stale-retry", staleTxId: row.id, staleStatus: "pending" };
    }

 // Session 25 Phase 6 — rows marked failed_restart by the SIGTERM
 // graceful-shutdown handler are ALWAYS retry-eligible AND should be
 // resumed IN-PLACE (reuse the same row) rather than spawning a
 // duplicate. We preserve the staleStatus here so monitor.ts can
 // distinguish this path from a generic stale-failed retry (which
 // correctly creates a fresh row). Root cause of the Session 25
 // 7-duplicate-rows-per-deposit bug: we were remapping failed_restart
 // to 'failed' here, so each pm2 restart spawned a new duplicate.
    if (row.status === "failed_restart") {
        return { action: "stale-retry", staleTxId: row.id, staleStatus: "failed_restart" };
    }

 // Session 26 — 'stranded' marks deposits the user cannot bridge
 // because they have no Issuer Base address. NEVER auto-retry —
 // funds sit on source chain until admin triages. This breaks the
 // retry cascade that was generating 20+ failed rows per user.
    if (row.status === "stranded") {
        return {
            action: "skip",
            reason: "dedup:stranded-no-issuer",
            detail: `${amountStr} matches stranded tx ${row.id} — user has no Issuer address, funds at source awaiting manual triage`,
        };
    }

 // Unknown status — treat as skip to be safe. Should never happen with current schema.
    return {
        action: "skip",
        reason: `dedup:unknown-status:${row.status}`,
        detail: `${amountStr} matches tx ${row.id} with unexpected status`,
    };
}
