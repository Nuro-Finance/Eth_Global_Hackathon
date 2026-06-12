"use client";
import { useState, useEffect } from "react";
import { useAppSession } from "@/hooks/useAppSession";

import { MOCK_CARDS } from "@/config/mock-data";
import {
  NURO_DEV_PREVIEW_CHANGED_EVENT,
  shouldUseDevPopulatedData,
} from "@/lib/devPreviewMode";
import { NURO_DASHBOARD_REFRESH_EVENT } from "@/features/dashboard/overview/layouts/DashboardGrid/context/DashboardRefreshContext";

/** Sensitive fields from the primary (first/active) card for on-card overlays */
export interface PrimaryCardSensitiveFields {
 /** e.g. •••• •••• •••• 4034 */
  panMasked: string;
 /** Spaced digits when PAN is fully known; otherwise null → reveal toggles expiry/CVV only */
  panRevealed: string | null;
  expiry: string;
  cvv: string | null;
}

function formatGroupedPan(digits: string): string {
  return digits.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
}

function panDigitsFromRaw(raw: Record<string, unknown>): string {
  const cardNumber = String(
    raw.cardNumber ??
      raw.card_number ??
      raw.fullCardNumber ??
      raw.full_card_number ??
      raw.plainCardNumber ??
      raw.pciPan ??
      raw.number ??
      raw.pan ??
      raw.primaryAccountNumber ??
      "",
  ).trim();
  return cardNumber.replace(/\D/g, "");
}

function mapRawCardToSensitive(raw: Record<string, unknown> | undefined | null): PrimaryCardSensitiveFields | null {
  if (!raw || typeof raw !== "object") return null;
  const digits = panDigitsFromRaw(raw);
  const last4 = digits.length >= 4 ? digits.slice(-4) : "----";
  const panMasked = `•••• •••• •••• ${last4}`;
  const panRevealed = digits.length >= 13 ? formatGroupedPan(digits) : null;

  const exp = String(raw.expiryDate ?? raw.expiry_date ?? "").trim();
  const expiry = exp || "—/—";

  const cvRaw = raw.cvv ?? raw.CVV ?? raw.security_code;
  const cvv =
    cvRaw != null && String(cvRaw).trim() !== ""
      ? String(cvRaw).replace(/\D/g, "").slice(0, 4) || String(cvRaw).trim()
      : null;

  return { panMasked, panRevealed, expiry, cvv };
}

/** If mapper missed `panRevealed` but raw has ≥13 PAN digits, group for reveal. */
function withPanRevealIfPossible(
  raw: Record<string, unknown> | undefined | null,
  base: PrimaryCardSensitiveFields | null,
): PrimaryCardSensitiveFields | null {
  if (!base) return null;
  if (base.panRevealed) return base;
  const digits = panDigitsFromRaw(raw ?? {});
  if (digits.length < 13) return base;
  return { ...base, panRevealed: formatGroupedPan(digits) };
}

/** Design sessions: guarantee mock primary card shows full PAN on reveal even if mapper ever drifts. */
function forceDesignMockPanReveal(s: PrimaryCardSensitiveFields | null): PrimaryCardSensitiveFields | null {
  if (!shouldUseDevPopulatedData() || !s || s.panRevealed) return s;
  const m = MOCK_CARDS[0] as { cardNumber?: string };
  const digits = String(m.cardNumber ?? "").replace(/\D/g, "");
  if (digits.length < 13) return s;
  return { ...s, panRevealed: formatGroupedPan(digits) };
}

function pickPrimaryCardRow(cards: Record<string, unknown>[]): Record<string, unknown> | undefined {
  if (!cards.length) return undefined;
  const active = cards.find((c) => (c.isActive ?? c.is_active) !== false);
  return active ?? cards[0];
}

/** Design deck: balance + PAN/CVV/expiry for whichever card id is on top (overview primary stack). */
export function getDesignMockCardFrontOverlay(cardId: string): {
  balance: number;
  sensitive: PrimaryCardSensitiveFields;
} | null {
  if (!shouldUseDevPopulatedData()) return null;
  const row = MOCK_CARDS.find((c) => c.id === cardId);
  if (!row) return null;
  const raw = row as unknown as Record<string, unknown>;
  const mockDigits = String((row as { cardNumber?: string }).cardNumber ?? "").replace(/\D/g, "");
  let sens = withPanRevealIfPossible(raw, mapRawCardToSensitive(raw));
  if (!sens) return null;
  if (mockDigits.length >= 13) {
    sens = { ...sens, panRevealed: formatGroupedPan(mockDigits) };
  }
  return {
    balance: typeof row.balance === "number" ? row.balance : 0,
    sensitive: sens,
  };
}

/** Minimal card row shape the deck stack consumes — id is required for keys + per-card mock lookups. */
export interface CardRow {
  id: string;
  balance: number;
 /** Last 4 digits of the PAN, used by the deck's per-card PAN strip overlay */
  last4: string;
 /** Optional gradient string (CSS background); undefined uses the default Nuro card face */
  gradient?: string;
 /** Human card name (e.g. "Amzon Orders"). Rendered as small-caps watermark
 * on hero card overlays per Nuro Brain ticket #3 (Option A). Falls back
 * to empty string when the source row has no name set. */
  name?: string;
}

function mapRawCardToCardRow(raw: Record<string, unknown>): CardRow {
  const id = String(raw.id ?? raw.cardId ?? raw.card_id ?? "").trim() || `card_${Math.random()}`;
  const balance = parseFloat(String(raw.balance ?? 0)) || 0;
  const digits = String(
    raw.cardNumber ?? raw.card_number ?? raw.last4 ?? raw.last_four ?? raw.number ?? "",
  ).replace(/\D/g, "");
  const last4 = digits.length >= 4 ? digits.slice(-4) : "----";
  const gradient = typeof raw.gradient === "string" ? raw.gradient : undefined;
 // Accept any of the common name-ish fields from the /api/cards response.
 // Backend currently exposes card_type as the human label (e.g. "Amzon Orders").
 // card_name is the newer column (nullable). Either works.
  const rawName = raw.card_name ?? raw.cardName ?? raw.card_type ?? raw.cardType ?? raw.name;
  const name = typeof rawName === "string" && rawName.trim() ? rawName.trim() : undefined;
  return { id, balance, last4, gradient, name };
}

// Day-6: stale-while-revalidate cache for the overview deck. Reading the
// last-known {balance, primarySensitive, cards} from localStorage in the
// useState initializers means the deck paints with the right gradient +
// last4 + balance on frame 1 of every subsequent dashboard visit. The
// /api/cards fetch still runs in the background and refreshes the cache
// for next time. Same pattern as MyCard1Feature's localStorage snapshot
// (Day-5, see Decision Journal 2026-05-09 DJ-2).
const ACCOUNT_SNAPSHOT_KEY = "nuro:useAccountBalance:snapshot";

interface AccountSnapshot {
  balance: number;
  primarySensitive: PrimaryCardSensitiveFields | null;
  cards: CardRow[];
}

function readAccountSnapshot(): AccountSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ACCOUNT_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AccountSnapshot;
    if (!parsed || typeof parsed !== "object") return null;
 // Defensive shape check — cache lives across deploys so a future
 // version of this hook with a different shape mustn't crash on load.
    if (typeof parsed.balance !== "number" || !Array.isArray(parsed.cards)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeAccountSnapshot(snap: AccountSnapshot) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ACCOUNT_SNAPSHOT_KEY, JSON.stringify(snap));
  } catch {
 /* private mode / quota — silent */
  }
}

/**
 * Account balance sum + primary card PAN/expiry/CVV payload + the full
 * cards list (for the overview deck stack) from one GET /api/cards.
 *
 * Day-6: hydrates from localStorage on first render so the deck paints
 * with last-known values instantly. /api/cards still runs in the
 * background and refreshes the cache.
 */
/**
 * Minimum on-screen hold for the candy overlay loader, in ms. Even if
 * /api/cards resolves in 80ms (warm cache + fast network), the loader
 * stays visible long enough for the user to register the animation.
 * This is the brand: "candy loaders everywhere data is fetched" — they
 * must be visible to do their job. Tuned at 600ms by spec
 * (Nuro ticket #11 — heartbeat scope conversation, 2026-05-25).
 */
const OVERLAY_LOADER_MIN_HOLD_MS = 600;

export function useAccountBalance() {
  const { data: session } = useAppSession();
  const cachedSnapshot = typeof window !== "undefined" ? readAccountSnapshot() : null;
  const [balance, setBalance] = useState(cachedSnapshot?.balance ?? 0);
 // isLoading flips false immediately if we have a cached snapshot — the
 // deck consumer interprets `isLoading=false` as "render real values".
 // The background refetch may still update state when it lands, but the
 // initial paint is never a "loading" placeholder for returning users.
 //
 // CALLERS WHO WANT THE CANDY-LOADER OVERLAY (hero deck stack, etc.)
 // should read `isOverlayLoading` instead. It deliberately ignores the
 // cache short-circuit so the candy is always visible on every fetch.
  const [isLoading, setIsLoading] = useState(cachedSnapshot === null);
 /**
 * Separate signal for the on-card BalanceLoader overlay. Goes TRUE on
 * mount (every render path), stays true for at least
 * OVERLAY_LOADER_MIN_HOLD_MS, and only flips false once /api/cards has
 * resolved AND the minimum hold has elapsed.
 *
 * Why a separate signal: the Day-6 stale-while-revalidate cache means
 * `isLoading` initializes to false for any returning visitor, which
 * suppressed the BalanceLoader entirely (the bug 414585f shipped).
 * This signal is cache-independent — candy renders on every visit.
 */
  const [isOverlayLoading, setIsOverlayLoading] = useState(true);
  const [primarySensitive, setPrimarySensitive] = useState<PrimaryCardSensitiveFields | null>(
    cachedSnapshot?.primarySensitive ?? null,
  );
  const [cards, setCards] = useState<CardRow[]>(cachedSnapshot?.cards ?? []);
  const [previewRevision, setPreviewRevision] = useState(0);
  const [userRefreshGeneration, setUserRefreshGeneration] = useState(0);

  useEffect(() => {
    const bump = () => setPreviewRevision((n) => n + 1);
    window.addEventListener(NURO_DEV_PREVIEW_CHANGED_EVENT, bump);
    return () => window.removeEventListener(NURO_DEV_PREVIEW_CHANGED_EVENT, bump);
  }, []);

  useEffect(() => {
    const onDashboardRefresh = () => setUserRefreshGeneration((n) => n + 1);
    window.addEventListener(NURO_DASHBOARD_REFRESH_EVENT, onDashboardRefresh);
    return () => window.removeEventListener(NURO_DASHBOARD_REFRESH_EVENT, onDashboardRefresh);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const overlayStart = Date.now();
    setIsOverlayLoading(true);

 /** Drop overlay-loading once both fetch + minimum hold are satisfied. */
    const releaseOverlay = () => {
      if (cancelled) return;
      const elapsed = Date.now() - overlayStart;
      const remaining = OVERLAY_LOADER_MIN_HOLD_MS - elapsed;
      if (remaining > 0) {
        setTimeout(() => {
          if (!cancelled) setIsOverlayLoading(false);
        }, remaining);
      } else {
        setIsOverlayLoading(false);
      }
    };

    if (shouldUseDevPopulatedData()) {
      const total = MOCK_CARDS.reduce((sum, c) => sum + (c.balance || 0), 0);
      setBalance(total);
      const rawPrimary = MOCK_CARDS[0] as unknown as Record<string, unknown>;
      const mockDigits = String(
        (MOCK_CARDS[0] as { cardNumber?: string }).cardNumber ?? "",
      ).replace(/\D/g, "");
      let sens = withPanRevealIfPossible(rawPrimary, mapRawCardToSensitive(rawPrimary));
      sens = forceDesignMockPanReveal(sens);
 // Hard guarantee: mock primary always ships a grouped PAN for overlay reveal (design).
      if (sens && mockDigits.length >= 13) {
        sens = { ...sens, panRevealed: formatGroupedPan(mockDigits) };
      }
      setPrimarySensitive(sens);
      setCards(MOCK_CARDS.map((c) => mapRawCardToCardRow(c as unknown as Record<string, unknown>)));
      setIsLoading(false);
      releaseOverlay();
      return () => { cancelled = true; };
    }

    if (
      process.env.NODE_ENV === "development" &&
      !shouldUseDevPopulatedData()
    ) {
      setBalance(0);
      setPrimarySensitive(null);
      setCards([]);
      setIsLoading(false);
      releaseOverlay();
      return () => { cancelled = true; };
    }

    const fetchBalance = async () => {
 // Day-6: don't flip isLoading=true if we already have a cached
 // snapshot rendered. The background refresh updates state when it
 // lands; consumers that gate UI on isLoading would otherwise show
 // a "loading" placeholder over the cached values during refresh.
      if (cards.length === 0 && balance === 0 && primarySensitive === null) {
        setIsLoading(true);
      }
      try {
        const token = (session as { accessToken?: string } | null)?.accessToken;
        const res = await fetch("/api/cards", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new Error(`Failed: ${res.status}`);
        const data = await res.json();
        const rawCards = (Array.isArray(data) ? data : data.cards || []) as Record<string, unknown>[];
 // Day-4 fix: only include real (issuer-linked) cards in the wallet
 // total. Phantom deck-stack rows render their seeded balances on
 // their card faces for the visual, but adding them to the total
 // makes the displayed wallet balance lie ($1.65 real card +
 // $1.65 stamped onto each phantom = $4.94 fake total). The
 // `isIssuerLinked` flag is set by the BE based on issuer_card_id.
 // Fallback for older API shapes: if neither field is present,
 // include the card (so accounts that haven't been re-fetched
 // post-upgrade don't show $0).
        const isReal = (c: Record<string, unknown>) => {
          if ('isIssuerLinked' in c) return Boolean(c.isIssuerLinked);
          if ('issuer_card_id' in c) return c.issuer_card_id != null;
          return true;
        };
        const total = rawCards
          .filter(isReal)
          .reduce(
            (sum: number, c: Record<string, unknown>) =>
              sum + (parseFloat(String(c.balance ?? 0)) || 0),
            0
          );
        const primary = pickPrimaryCardRow(rawCards);
        const nextPrimarySensitive = withPanRevealIfPossible(
          primary ?? null,
          mapRawCardToSensitive(primary ?? null),
        );
        const nextCards = rawCards.map(mapRawCardToCardRow);
        if (cancelled) return;
        setBalance(total);
        setPrimarySensitive(nextPrimarySensitive);
        setCards(nextCards);
 // Persist the refreshed snapshot for next visit's instant paint.
        writeAccountSnapshot({
          balance: total,
          primarySensitive: nextPrimarySensitive,
          cards: nextCards,
        });
      } catch (error) {
        console.error("Failed to fetch balance:", error);
 // Day-6: don't blow away the cached values on a transient fetch
 // error — leaving stale-but-rendered is better UX than the page
 // suddenly going blank. Only clear if we had nothing to begin with.
        if (cachedSnapshot === null && !cancelled) {
          setBalance(0);
          setPrimarySensitive(null);
          setCards([]);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
        releaseOverlay();
      }
    };
    void fetchBalance();
    return () => { cancelled = true; };
 // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, previewRevision, userRefreshGeneration]);

  return { balance, isLoading, isOverlayLoading, primarySensitive, cards };
}
