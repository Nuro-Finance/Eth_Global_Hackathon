export type TopHeroSmallSlotId = "balance" | "spending" | "insight";

export type TopVariant2CardId = TopHeroSmallSlotId | "card";

/** Layout 2 hero: balance · spending · primary card only (no insight tile). */
export type TopLayout2HeroId = "balance" | "spending" | "card";

export const TOP_ROW_ORDER_STORAGE_KEY = "overview_variant2_top3_order";

export const TOP_LAYOUT2_HERO_ORDER_KEY = "overview_layout2_hero_balance_spending_card";

export function isTopHeroSmallSlotId(v: unknown): v is TopHeroSmallSlotId {
  return v === "balance" || v === "spending" || v === "insight";
}

export function isTopVariant2CardId(v: unknown): v is TopVariant2CardId {
  return isTopHeroSmallSlotId(v) || v === "card";
}

export function pinDeckLast(order: TopVariant2CardId[]): TopVariant2CardId[] {
  const slim = order.filter((id): id is TopHeroSmallSlotId => id !== "card");
  return [...slim, "card"];
}

export function isTopLayout2HeroId(v: unknown): v is TopLayout2HeroId {
  return v === "balance" || v === "spending" || v === "card";
}

export function pinDeckLastLayout2(order: TopLayout2HeroId[]): TopLayout2HeroId[] {
  const slim = order.filter((id): id is "balance" | "spending" => id !== "card");
  return [...slim, "card"];
}

export function normalizeLayout2HeroOrder(candidate: unknown): TopLayout2HeroId[] {
  const full: TopLayout2HeroId[] = ["balance", "spending", "card"];
  if (!Array.isArray(candidate)) return pinDeckLastLayout2(full);

  const seen = new Set<TopLayout2HeroId>();
  const out: TopLayout2HeroId[] = [];
  for (const x of candidate) {
    if (!isTopLayout2HeroId(x) || seen.has(x)) continue;
    seen.add(x);
    out.push(x);
  }
  for (const k of full) {
    if (!seen.has(k)) out.push(k);
  }

  const valid = seen.size === 3 && out.length === 3;
  return pinDeckLastLayout2(valid ? out : full);
}

export function loadLayout2HeroOrder(): TopLayout2HeroId[] {
  if (typeof window === "undefined") return normalizeLayout2HeroOrder(null);

  try {
    const raw = window.localStorage.getItem(TOP_LAYOUT2_HERO_ORDER_KEY);
    if (!raw) return normalizeLayout2HeroOrder(null);
    return normalizeLayout2HeroOrder(JSON.parse(raw));
  } catch {
    return normalizeLayout2HeroOrder(null);
  }
}

/** Layout 3 hero: four tiles — slim bucket `xl:col-span-8` / `grid-cols-3` + deck **`xl:col-span-4`**. */
export function normalizeTopVariant2Order(candidate: unknown): TopVariant2CardId[] {
  const full: TopVariant2CardId[] = ["balance", "insight", "spending", "card"];
  if (!Array.isArray(candidate)) return pinDeckLast(full);

  const legacyThree =
    candidate.length === 3 &&
    candidate.every((x) => isTopVariant2CardId(x)) &&
    !candidate.includes("insight");
  const seed: unknown[] = legacyThree
    ? (() => {
        const a = candidate as TopVariant2CardId[];
        const si = a.indexOf("spending");
        if (si <= 0) return ["balance", "insight", ...a.filter((x) => x !== "balance")];
        return [...a.slice(0, si), "insight", ...a.slice(si)];
      })()
    : candidate;

  const seen = new Set<TopVariant2CardId>();
  const out: TopVariant2CardId[] = [];
  for (const x of seed) {
    if (!isTopVariant2CardId(x) || seen.has(x)) continue;
    seen.add(x);
    out.push(x);
  }
  for (const k of full) {
    if (!seen.has(k)) out.push(k);
  }

  const valid = seen.size === 4 && out.length === 4;
  return pinDeckLast(valid ? out : full);
}

export function loadTopVariant2Order(): TopVariant2CardId[] {
  if (typeof window === "undefined") return normalizeTopVariant2Order(null);

  try {
    const raw = window.localStorage.getItem(TOP_ROW_ORDER_STORAGE_KEY);
    if (!raw) return normalizeTopVariant2Order(null);
    return normalizeTopVariant2Order(JSON.parse(raw));
  } catch {
    return normalizeTopVariant2Order(null);
  }
}

export function formatUsd(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export function formatUsdCompact(n: number) {
  return n.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}
