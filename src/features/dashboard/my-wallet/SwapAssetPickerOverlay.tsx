"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { WALLET_GLASS_MENU_CONTENT } from "@/lib/walletGlassMenu";

const CARD_RADIUS = "rounded-[var(--radius-card)] sm:rounded-[var(--radius-xl)]";

export const WALLET_PICKER_OVERLAY_MOTION = {
  initial: { opacity: 0, y: 6 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.26, ease: [0.16, 1, 0.3, 1] as const },
  },
  exit: {
    opacity: 0,
    y: 4,
    transition: { duration: 0.18, ease: [0.4, 0, 0.2, 1] as const },
  },
} as const;

const ASSET_PICKER_OVERLAY_OPEN = 0.26;
const ASSET_PICKER_CASCADE_EASE = [0.16, 1, 0.3, 1] as const;

export type SwapPickerAsset = {
  symbol: string;
  iconSrc?: string;
  fallbackBg: string;
};

export type SwapPickerKind = "sell" | "buy" | "send";

const DEMO_ASSET_PICKER_SUGGESTIONS: SwapPickerAsset[] = [
  { symbol: "ETH", iconSrc: "/assets/images/icons/eth.svg", fallbackBg: "bg-blue-500/25" },
  { symbol: "USDC", iconSrc: "/assets/images/icons/usdc.svg", fallbackBg: "bg-blue-400/30" },
  { symbol: "USDT", iconSrc: "/assets/images/icons/tether.svg", fallbackBg: "bg-emerald-400/30" },
  { symbol: "WBTC", iconSrc: "/wrapped-bitcoin-wbtc-icon.svg?v=1", fallbackBg: "bg-orange-400/30" },
];

type DemoPickerToken = {
  name: string;
  symbol: string;
  chain: string;
  usd: string;
  qty: string;
  iconSrc: string;
};

const DEMO_ASSET_PICKER_TOKENS: DemoPickerToken[] = [
  { name: "Ethereum", symbol: "ETH", chain: "ETH", usd: "$0.667", qty: "0.00029", iconSrc: "/assets/images/icons/eth.svg" },
  { name: "Base ETH", symbol: "ETH", chain: "BASE", usd: "$0.113", qty: "0.00005", iconSrc: "/Base%20Eth.svg" },
  { name: "USD Coin", symbol: "USDC", chain: "USDC", usd: "$0.0959", qty: "0.09587", iconSrc: "/assets/images/icons/usdc.svg" },
  { name: "Wrapped BTC", symbol: "WBTC", chain: "WBTC", usd: "$0.667", qty: "0.00029", iconSrc: "/wrapped-bitcoin-wbtc-icon.svg?v=1" },
];

function isBaseEthCompositeIconSrc(src?: string): boolean {
  if (!src) return false;
  return src.includes("Base%20Eth.svg") || src.includes("Base Eth.svg");
}

function TokenRowIcon({ token }: { token: DemoPickerToken }) {
  if (token.name === "Base ETH") {
    return (
      <span className="relative flex h-9 w-9 items-center justify-center overflow-visible">
        <img src={token.iconSrc} alt="" className="h-9 w-9 object-contain" width={36} height={36} />
      </span>
    );
  }
  return (
    <img
      src={token.iconSrc}
      alt=""
      loading="eager"
      decoding="async"
      className="h-9 w-9 rounded-full object-cover"
      width={36}
      height={36}
    />
  );
}

export function SwapAssetPickerOverlay({
  open,
  pickerKind,
  query,
  onQueryChange,
  onSelect,
  onClose,
}: {
  open: boolean;
  pickerKind: SwapPickerKind;
  query: string;
  onQueryChange: (value: string) => void;
  onSelect: (asset: SwapPickerAsset) => void;
  onClose: () => void;
}) {
  const [assetSuggestionFade, setAssetSuggestionFade] = useState<"right" | "both" | "none">("right");
  const [assetTokenFade, setAssetTokenFade] = useState<"bottom" | "both" | "none">("bottom");
  const [assetPickerIconsReady, setAssetPickerIconsReady] = useState(false);
  const assetSuggestionScrollerRef = useRef<HTMLDivElement | null>(null);
  const assetTokenScrollerRef = useRef<HTMLDivElement | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return DEMO_ASSET_PICKER_TOKENS;
    return DEMO_ASSET_PICKER_TOKENS.filter((t) =>
      `${t.name} ${t.symbol} ${t.chain}`.toLowerCase().includes(q)
    );
  }, [query]);

  const firstToken = filtered[0];
  const remainingTokens = filtered.slice(1);

  const updateAssetSuggestionFade = useCallback(() => {
    const el = assetSuggestionScrollerRef.current;
    if (!el) return;
    const maxScrollLeft = el.scrollWidth - el.clientWidth;
    const atLeft = el.scrollLeft <= 1;
    const atRight = el.scrollLeft >= maxScrollLeft - 1;
    setAssetSuggestionFade(atRight ? "none" : atLeft ? "right" : "both");
  }, []);

  const updateAssetTokenFade = useCallback(() => {
    const el = assetTokenScrollerRef.current;
    if (!el) return;
    const maxScrollTop = el.scrollHeight - el.clientHeight;
    const atTop = el.scrollTop <= 1;
    const atBottom = el.scrollTop >= maxScrollTop - 1;
    setAssetTokenFade(atBottom ? "none" : atTop ? "bottom" : "both");
  }, []);

  useEffect(() => {
    if (!open) return;
    const srcs = new Set<string>();
    for (const s of DEMO_ASSET_PICKER_SUGGESTIONS) if (s.iconSrc) srcs.add(s.iconSrc);
    for (const t of DEMO_ASSET_PICKER_TOKENS) if (t.iconSrc) srcs.add(t.iconSrc);
    let cancelled = false;
    const loads = Array.from(srcs).map(
      (src) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.decoding = "async";
          img.onload = () => resolve();
          img.onerror = () => resolve();
          img.src = src;
        })
    );
    const timeout = window.setTimeout(() => {
      if (!cancelled) setAssetPickerIconsReady(true);
    }, 450);
    Promise.all(loads).then(() => {
      window.clearTimeout(timeout);
      if (!cancelled) setAssetPickerIconsReady(true);
    });
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const id = window.requestAnimationFrame(() => {
      updateAssetSuggestionFade();
      updateAssetTokenFade();
    });
    return () => window.cancelAnimationFrame(id);
  }, [open, updateAssetSuggestionFade, updateAssetTokenFade, query]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const t = event.target;
      if (!(t instanceof Element)) return;
      if (t.closest("[data-swap-asset-picker-panel]")) return;
      onClose();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open, onClose]);

  const onWheelCapture = (e: React.WheelEvent) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    const tokenScroller = assetTokenScrollerRef.current;
    if (tokenScroller?.contains(target)) return;
    const suggestionScroller = assetSuggestionScrollerRef.current;
    if (suggestionScroller?.contains(target)) {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) e.preventDefault();
      return;
    }
    e.preventDefault();
  };

  const STEP_DELAY = 0.09;
  const STEP_DURATION = 0.32;
  const CASCADE_START = ASSET_PICKER_OVERLAY_OPEN + (assetPickerIconsReady ? 0 : 0.18);

  const pick = (asset: SwapPickerAsset) => {
    onSelect(asset);
    onClose();
    onQueryChange("");
  };

  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          className="absolute -inset-px z-[260] bg-[var(--color-bg-asset-picker-panel)] p-4 sm:p-5"
          onWheelCapture={onWheelCapture}
          style={{ overscrollBehavior: "contain" }}
          data-asset-picker-overlay
          initial={WALLET_PICKER_OVERLAY_MOTION.initial}
          animate={WALLET_PICKER_OVERLAY_MOTION.animate}
          exit={WALLET_PICKER_OVERLAY_MOTION.exit}
        >
          <div
            data-swap-asset-picker-panel
            className={cn(
              WALLET_GLASS_MENU_CONTENT,
              "!p-0",
              "h-full w-full overflow-hidden",
              CARD_RADIUS,
              "!bg-[var(--color-bg-asset-picker-panel)]",
              "!border-white/[0.075]"
            )}
          >
            <div className="flex h-full min-h-0 flex-col !p-0">
              <motion.div
                className="flex items-center justify-between gap-3 px-4 pb-3 pt-4 transform-gpu"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: CASCADE_START, duration: STEP_DURATION, ease: ASSET_PICKER_CASCADE_EASE }}
              >
                {pickerKind === "buy" ? (
                  <div className="flex w-full min-w-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={onClose}
                      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-white/[0.04] text-white/50 transition-colors hover:text-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
                      aria-label="Back"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                    </button>
                    <div className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-[14px] bg-white/[0.04] px-3">
                      <Search className="h-4 w-4 shrink-0 text-white/35" strokeWidth={2} aria-hidden />
                      <input
                        value={query}
                        onChange={(e) => onQueryChange(e.target.value)}
                        placeholder="Search tokens"
                        className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[13px] font-medium text-[var(--color-text-primary)] outline-none placeholder:text-white/30"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex h-10 w-full min-w-0 flex-1 items-center gap-2 rounded-[14px] bg-white/[0.04] px-3">
                    <Search className="h-4 w-4 shrink-0 text-white/35" strokeWidth={2} aria-hidden />
                    <input
                      value={query}
                      onChange={(e) => onQueryChange(e.target.value)}
                      placeholder="Search tokens"
                      className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[13px] font-medium text-[var(--color-text-primary)] outline-none placeholder:text-white/30"
                    />
                  </div>
                )}
              </motion.div>

              <motion.div
                className="px-4 pb-3 transform-gpu"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  delay: CASCADE_START + STEP_DELAY,
                  duration: STEP_DURATION,
                  ease: ASSET_PICKER_CASCADE_EASE,
                }}
              >
                <div
                  ref={assetSuggestionScrollerRef}
                  onScroll={updateAssetSuggestionFade}
                  className={cn(
                    "flex items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
                    assetSuggestionFade === "both" &&
                      "[mask-image:linear-gradient(90deg,transparent_0,black_16px,black_calc(100%-16px),transparent_100%)] [-webkit-mask-image:linear-gradient(90deg,transparent_0,black_16px,black_calc(100%-16px),transparent_100%)]",
                    assetSuggestionFade === "right" &&
                      "[mask-image:linear-gradient(90deg,black_0,black_calc(100%-16px),transparent_100%)] [-webkit-mask-image:linear-gradient(90deg,black_0,black_calc(100%-16px),transparent_100%)]",
                    assetSuggestionFade === "none" && "[mask-image:none] [-webkit-mask-image:none]"
                  )}
                >
                  {DEMO_ASSET_PICKER_SUGGESTIONS.map((s) => (
                    <button
                      key={s.symbol}
                      type="button"
                      onClick={() => pick(s)}
                      className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-white/[0.10] bg-white/[0.04] pl-1.5 pr-3 text-xs font-semibold text-white/85"
                    >
                      <img
                        src={s.iconSrc}
                        alt=""
                        loading="eager"
                        decoding="async"
                        className={cn(
                          "h-6 w-6 shrink-0",
                          isBaseEthCompositeIconSrc(s.iconSrc) ? "object-contain" : "rounded-full object-cover"
                        )}
                        width={24}
                        height={24}
                      />
                      {s.symbol}
                    </button>
                  ))}
                </div>
              </motion.div>

              <div className="relative flex min-h-0 flex-1 flex-col pb-4 [overflow-anchor:none]">
                <div
                  ref={assetTokenScrollerRef}
                  onScroll={updateAssetTokenFade}
                  data-asset-picker-token-scroll
                  className={cn(
                    "min-h-0 flex-1 overflow-y-auto overscroll-contain pt-0 pb-2 scrollbar-autohide scroll-gutter-stable transform-gpu will-change-transform",
                    assetTokenFade === "both" &&
                      "[mask-image:linear-gradient(to_bottom,transparent_0,black_16px,black_calc(100%-16px),transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,transparent_0,black_16px,black_calc(100%-16px),transparent_100%)]",
                    assetTokenFade === "bottom" &&
                      "[mask-image:linear-gradient(to_bottom,black_0,black_calc(100%-16px),transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,black_0,black_calc(100%-16px),transparent_100%)]",
                    assetTokenFade === "none" && "[mask-image:none] [-webkit-mask-image:none]"
                  )}
                >
                  <motion.div
                    className="px-4 transform-gpu"
                    initial={{ opacity: 0, y: 3 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      delay: CASCADE_START + STEP_DELAY * 2,
                      duration: STEP_DURATION,
                      ease: ASSET_PICKER_CASCADE_EASE,
                    }}
                  >
                    <div className="pb-2">
                      <p className="px-1 text-[12px] font-semibold text-white/55">Your tokens</p>
                    </div>
                    {firstToken ? (
                      <button
                        type="button"
                        onClick={() =>
                          pick({
                            symbol: firstToken.symbol,
                            iconSrc: firstToken.iconSrc,
                            fallbackBg: "bg-white/[0.08]",
                          })
                        }
                        className="flex w-full items-center justify-between gap-3 rounded-[14px] pl-3 pr-4 py-2 text-left transition-colors hover:bg-white/[0.04]"
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <TokenRowIcon token={firstToken} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] font-semibold text-[var(--color-text-primary)]">
                              {firstToken.name}
                            </p>
                            <p className="mt-0.5 truncate text-[11px] font-semibold text-white/55">
                              {firstToken.symbol}{" "}
                              <span className="text-white/35">
                                {firstToken.chain !== firstToken.symbol ? firstToken.chain : ""}
                              </span>
                            </p>
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-[13px] font-semibold text-[var(--color-text-primary)]">{firstToken.usd}</p>
                          <p className="mt-0.5 text-[11px] font-semibold text-white/45 tabular-nums">{firstToken.qty}</p>
                        </div>
                      </button>
                    ) : null}
                  </motion.div>

                  <div className="px-4 pt-1">
                    <div className="flex flex-col gap-1.5">
                      {remainingTokens.map((t, i) => (
                        <motion.button
                          key={`${t.name}-${t.symbol}-${t.chain}`}
                          type="button"
                          onClick={() =>
                            pick({
                              symbol: t.symbol,
                              iconSrc: t.iconSrc,
                              fallbackBg: "bg-white/[0.08]",
                            })
                          }
                          className="flex w-full items-center justify-between gap-3 rounded-[14px] pl-3 pr-4 py-2 text-left transition-colors hover:bg-white/[0.04]"
                          initial={{ opacity: 0, y: 3 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{
                            delay: CASCADE_START + STEP_DELAY * (3 + i),
                            duration: STEP_DURATION,
                            ease: ASSET_PICKER_CASCADE_EASE,
                          }}
                        >
                          <div className="flex min-w-0 flex-1 items-center gap-3">
                            <TokenRowIcon token={t} />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[13px] font-semibold text-[var(--color-text-primary)]">
                                {t.name}
                              </p>
                              <p className="mt-0.5 truncate text-[11px] font-semibold text-white/55">
                                {t.symbol}{" "}
                                <span className="text-white/35">{t.chain !== t.symbol ? t.chain : ""}</span>
                              </p>
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-[13px] font-semibold text-[var(--color-text-primary)]">{t.usd}</p>
                            <p className="mt-0.5 text-[11px] font-semibold text-white/45 tabular-nums">{t.qty}</p>
                          </div>
                        </motion.button>
                      ))}
                    </div>
                  </div>

                  <div className="px-4">
                    <div className="pt-4 pb-2">
                      <p className="px-1 text-[12px] font-semibold text-white/55">Tokens by 24H volume</p>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {DEMO_ASSET_PICKER_TOKENS.slice(0, 3).map((t) => (
                        <button
                          key={`vol-${t.name}-${t.chain}`}
                          type="button"
                          onClick={() =>
                            pick({
                              symbol: t.symbol,
                              iconSrc: t.iconSrc,
                              fallbackBg: "bg-white/[0.08]",
                            })
                          }
                          className="flex w-full items-center justify-between gap-3 rounded-[14px] pl-3 pr-4 py-2 text-left transition-colors hover:bg-white/[0.04]"
                        >
                          <div className="flex min-w-0 flex-1 items-center gap-3">
                            <TokenRowIcon token={t} />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[13px] font-semibold text-[var(--color-text-primary)]">
                                {t.name}
                              </p>
                              <p className="mt-0.5 truncate text-[11px] font-semibold text-white/55">{t.symbol}</p>
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-[13px] font-semibold text-[var(--color-text-primary)]">{t.usd}</p>
                            <p className="mt-0.5 text-[11px] font-semibold text-white/45 tabular-nums">{t.qty}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
