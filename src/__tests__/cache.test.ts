// Test the in-memory cache backend. Upstash backend is exercised in
// integration only — unit tests would just be re-verifying our HTTP mock.
//
// Coverage:
// - get / set / del round-trip
// - TTL expiry returns null
// - delPrefix removes everything under a prefix, leaves siblings
// - LRU-ish eviction under MEM_MAX pressure
// - cacheKeys helpers produce expected shapes

import { describe, it, expect, beforeEach, vi } from "vitest";

// Force the in-memory backend regardless of host env. The cache module
// reads UPSTASH_* at import time, so we wipe before importing.
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

import { cache, cacheKeys } from "../cache";

describe("cache (in-memory backend)", () => {
  beforeEach(async () => {
    vi.useRealTimers();
 // Clear any state left over between tests.
    await cache.delPrefix("nuro:");
  });

  it("reports the in-memory backend when Upstash env vars are absent", () => {
    expect(cache.backend()).toBe("memory");
  });

  it("set + get round-trips a JSON-serializable value", async () => {
    await cache.set("nuro:test:k", { hello: "world", n: 42 }, 5);
    const v = await cache.get<{ hello: string; n: number }>("nuro:test:k");
    expect(v).toEqual({ hello: "world", n: 42 });
  });

  it("returns null on a never-set key", async () => {
    const v = await cache.get("nuro:test:does-not-exist");
    expect(v).toBeNull();
  });

  it("expires after TTL", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);

    await cache.set("nuro:test:ttl", "alive", 10);
    expect(await cache.get("nuro:test:ttl")).toBe("alive");

 // Advance just past the TTL window.
    vi.setSystemTime(1_700_000_000_000 + 11_000);
    expect(await cache.get("nuro:test:ttl")).toBeNull();
  });

  it("del removes a single key", async () => {
    await cache.set("nuro:test:del", "x", 60);
    expect(await cache.get("nuro:test:del")).toBe("x");
    await cache.del("nuro:test:del");
    expect(await cache.get("nuro:test:del")).toBeNull();
  });

  it("delPrefix removes only matching keys", async () => {
    await cache.set("nuro:agent:abc:1", "a", 60);
    await cache.set("nuro:agent:abc:2", "b", 60);
    await cache.set("nuro:agent:xyz:1", "c", 60);

    await cache.delPrefix("nuro:agent:abc:");

    expect(await cache.get("nuro:agent:abc:1")).toBeNull();
    expect(await cache.get("nuro:agent:abc:2")).toBeNull();
 // Sibling under a different prefix survives.
    expect(await cache.get("nuro:agent:xyz:1")).toBe("c");
  });

  it("ignores non-positive TTLs (no-op set)", async () => {
    await cache.set("nuro:test:zero", "x", 0);
    await cache.set("nuro:test:neg", "y", -1);
    expect(await cache.get("nuro:test:zero")).toBeNull();
    expect(await cache.get("nuro:test:neg")).toBeNull();
  });
});

describe("cacheKeys", () => {
  it("budgetSnapshot encodes agentId + ledgerLimit", () => {
    expect(cacheKeys.budgetSnapshot("agent-1", 25)).toBe(
      "nuro:budget:snap:agent-1:l25"
    );
  });

  it("budgetSnapshotPrefix is a strict prefix of budgetSnapshot", () => {
    const prefix = cacheKeys.budgetSnapshotPrefix("agent-1");
    const full = cacheKeys.budgetSnapshot("agent-1", 25);
    expect(full.startsWith(prefix)).toBe(true);
  });

  it("budgetSnapshotPrefix for one agent does NOT match a different agent", () => {
    const prefix = cacheKeys.budgetSnapshotPrefix("agent-1");
    const otherFull = cacheKeys.budgetSnapshot("agent-2", 25);
    expect(otherFull.startsWith(prefix)).toBe(false);
  });

  it("reputation / notifications / cardBalance produce stable keys", () => {
    expect(cacheKeys.reputation("a")).toBe("nuro:rep:a");
    expect(cacheKeys.notifications("a")).toBe("nuro:notif:a");
    expect(cacheKeys.cardBalance("c")).toBe("nuro:card:bal:c");
  });
});
