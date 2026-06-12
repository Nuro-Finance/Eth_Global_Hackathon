import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the pool used by dedup.ts BEFORE importing the module under test.
const queryMock = vi.fn();
vi.mock("../db", () => ({
    pool: { query: (sql: string, params: unknown[]) => queryMock(sql, params) },
}));

import { checkDepositDedup } from "../lib/dedup";

const BASE_PARAMS = {
    userId: "user-abc",
    chainId: 56,
    amountNum: 0.04,
    depositAddress: "0x75Aa3B70Cb3885c860246C8d5c5103368a9c45fC",
};

const NOW = 1_700_000_000_000;

beforeEach(() => {
    queryMock.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
});

describe("checkDepositDedup", () => {
    it("proceeds when no matching row exists", async () => {
        queryMock.mockResolvedValueOnce({ rows: [] });
        const result = await checkDepositDedup(BASE_PARAMS);
        expect(result).toEqual({ action: "proceed" });
    });

    it("skips when a confirmed row exists within the window", async () => {
        queryMock.mockResolvedValueOnce({
            rows: [{ id: "tx-confirmed", status: "confirmed", timestamp: NOW - 10 * 60 * 1000 }],
        });
        const result = await checkDepositDedup(BASE_PARAMS);
        expect(result.action).toBe("skip");
        if (result.action === "skip") {
            expect(result.reason).toBe("dedup:already-confirmed");
            expect(result.detail).toContain("tx-confirmed");
            expect(result.detail).toContain("$0.040000");
        }
    });

    it("skips when a failed row is <1h old", async () => {
        queryMock.mockResolvedValueOnce({
            rows: [{ id: "tx-failed-fresh", status: "failed", timestamp: NOW - 30 * 60 * 1000 }],
        });
        const result = await checkDepositDedup(BASE_PARAMS);
        expect(result.action).toBe("skip");
        if (result.action === "skip") {
            expect(result.reason).toBe("dedup:failed-recently");
            expect(result.detail).toContain("auto-retry after 1h");
        }
    });

    it("stale-retries a failed row >1h old", async () => {
        // Note: the 60-min DEDUP_WINDOW in the SQL filter means only rows within
        // 60 min of NOW are returned — so a "stale failed" row for retry must be
        // exactly at the window boundary. We simulate the row being 59 min old
        // but the retry threshold being 60 min — a realistic mid-window case
        // where the retry branch fires inline. In practice, a truly stale row
        // (>60 min) won't be returned by the query at all → no match → proceed.
        queryMock.mockResolvedValueOnce({
            rows: [{ id: "tx-failed-stale", status: "failed", timestamp: NOW - 61 * 60 * 1000 }],
        });
        const result = await checkDepositDedup(BASE_PARAMS);
        // Even if the SQL window excludes this in real queries, the helper
        // correctly returns stale-retry given the row data.
        expect(result.action).toBe("stale-retry");
        if (result.action === "stale-retry") {
            expect(result.staleTxId).toBe("tx-failed-stale");
            expect(result.staleStatus).toBe("failed");
        }
    });

    it("skips when a pending row is <30min old", async () => {
        queryMock.mockResolvedValueOnce({
            rows: [{ id: "tx-pending-fresh", status: "pending", timestamp: NOW - 10 * 60 * 1000 }],
        });
        const result = await checkDepositDedup(BASE_PARAMS);
        expect(result.action).toBe("skip");
        if (result.action === "skip") {
            expect(result.reason).toBe("dedup:pending-in-flight");
        }
    });

    it("stale-retries a pending row >30min old", async () => {
        queryMock.mockResolvedValueOnce({
            rows: [{ id: "tx-pending-stale", status: "pending", timestamp: NOW - 45 * 60 * 1000 }],
        });
        const result = await checkDepositDedup(BASE_PARAMS);
        expect(result.action).toBe("stale-retry");
        if (result.action === "stale-retry") {
            expect(result.staleTxId).toBe("tx-pending-stale");
            expect(result.staleStatus).toBe("pending");
        }
    });

    it("passes amount tolerance (±$0.001) to the SQL filter", async () => {
        queryMock.mockResolvedValueOnce({ rows: [] });
        await checkDepositDedup({ ...BASE_PARAMS, amountNum: 1.5 });
        const [sql, params] = queryMock.mock.calls[0];
        expect(sql).toContain("BETWEEN $3 AND $4");
        expect(params[2]).toBeCloseTo(1.499, 6);
        expect(params[3]).toBeCloseTo(1.501, 6);
    });

    it("uses a 60-minute DB query window", async () => {
        queryMock.mockResolvedValueOnce({ rows: [] });
        await checkDepositDedup(BASE_PARAMS);
        const [, params] = queryMock.mock.calls[0];
        const windowStart = params[4] as number;
        expect(NOW - windowStart).toBe(60 * 60 * 1000);
    });

    it("treats an unknown status as skip (defensive)", async () => {
        queryMock.mockResolvedValueOnce({
            rows: [{ id: "tx-weird", status: "queued", timestamp: NOW - 5 * 60 * 1000 }],
        });
        const result = await checkDepositDedup(BASE_PARAMS);
        expect(result.action).toBe("skip");
        if (result.action === "skip") {
            expect(result.reason).toBe("dedup:unknown-status:queued");
        }
    });
});
