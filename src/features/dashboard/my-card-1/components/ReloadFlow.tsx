"use client";

import React, { useEffect, useLayoutEffect, useMemo, useState, useCallback, useRef, forwardRef, useImperativeHandle } from "react";
import { useAppSession } from "@/hooks/useAppSession";
import QRCode from "qrcode";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Copy, X, ChevronLeft, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";
import { emitDashboardInFlightOperation, emitFirstDepositSuccess } from "@/lib/dashboardInFlightOperation";
import { useFitMonospaceAddressRow } from "./useFitMonospaceAddressRow";
import { WorldIdReloadGate } from "./WorldIdReloadGate";
import { ReloadSwapFunds } from "./ReloadSwapFunds";
import { isWorldIdConfigured, worldReloadSessionKey } from "@/lib/world-id";

/** Same success illustration as wallet send-complete (`ConnectedWalletDashboard`). */
const FLOW_SUCCESS_ILLUSTRATION_SRC = "/Success_Square.svg";

/** Official USDC mark (matches `assets/USDC Icon.svg`) */
const USDC_ICON_SRC = "/assets/images/icons/usdc.svg";

/** Tether (USDT) mark — `Tether Logo.svg` */
const TETHER_ICON_SRC = "/assets/images/icons/tether.svg";

/** Stored `selectedToken` value when user picks Tether */
const TETHER_TOKEN = "Tether";

/** Dai stablecoin mark — `Dai Logo.svg` */
const DAI_ICON_SRC = "/assets/images/icons/dai.svg";

/** Stored `selectedToken` value when user picks Dai */
const DAI_TOKEN = "Dai";

/** Ticker for reload CTA (UI uses "Tether" / "Dai" for selection). */
const reloadCtaTicker = (selectedToken: string) =>
  selectedToken === "USDC" ? "USDC" : selectedToken === TETHER_TOKEN ? "USDT" : selectedToken === DAI_TOKEN ? "DAI" : selectedToken;

/** Circle mark for the BASE chain tile */
const CHAIN_CIRCLE_MARK_SRC = "/assets/images/icons/chain-circle-mark.svg";

const selectedChainUsesCircleMark = (name: string) => name === "BASE" || name === "Base";

/** Reload card widget + home modal — Base, Ethereum, Solana active; rest below Coming Soon pill. */
const RELOAD_ACTIVE_CHAINS = ["Base", "Solana", "Ethereum"] as const;
const isReloadActiveChain = (name: string) =>
  (RELOAD_ACTIVE_CHAINS as readonly string[]).includes(name);

const SEND_FUNDS_QR_DISPLAY_PX = 140;
const SEND_FUNDS_QR_GEN_PX = 256;
const sendFundsQrDataUrlCache = new Map<string, string>();

const SearchIcon = Search;
const CopyIcon = Copy;
const XIcon = X;
const ChevronIcon = ChevronLeft;
const CheckIcon = Check;

interface ReloadStepProps {
  onBack: () => void;
  onClose: () => void;
  onNext?: () => void;
}

export const SmartContractInfo = () => (
  <div className="relative top-1 text-[13px] font-medium leading-snug text-[var(--color-text-muted)]">
    <svg
      viewBox="0 8.262 24 7.496"
      xmlns="http://www.w3.org/2000/svg"
      className="mr-2 inline h-[10px] w-auto fill-[var(--color-text-primary)] align-baseline"
      aria-hidden
    >
      <path d="M9.112 8.262L5.97 15.758H3.92L2.374 9.775c-.094-.368-.175-.503-.461-.658C1.447 8.864.677 8.627 0 8.479l.046-.217h3.3a.904.904 0 01.894.764l.817 4.338 2.018-5.102zm8.033 5.049c.008-1.979-2.736-2.088-2.717-2.972.006-.269.262-.555.822-.628a3.66 3.66 0 011.913.336l.34-1.59a5.207 5.207 0 00-1.814-.333c-1.917 0-3.266 1.02-3.278 2.479-.012 1.079.963 1.68 1.698 2.04.756.367 1.01.603 1.006.931-.005.504-.602.725-1.16.734-.975.015-1.54-.263-1.992-.473l-.351 1.642c.453.208 1.289.39 2.156.398 2.037 0 3.37-1.006 3.377-2.564m5.061 2.447H24l-1.565-7.496h-1.656a.883.883 0 00-.826.55l-2.909 6.946h2.036l.405-1.12h2.488zm-2.163-2.656l1.02-2.815.588 2.815zm-8.16-4.84l-1.603 7.496H8.34l1.605-7.496z" />
    </svg>
    Verified Smart Contract
  </div>
);

const MiddleSkeleton = () => (
  <>
    <div className="flex flex-col gap-3 shrink-0 opacity-0 pointer-events-none" aria-hidden="true">
      <div className="h-14 w-full"></div>
    </div>
    <div className="flex flex-col gap-3 py-2 shrink-0 opacity-0 pointer-events-none" aria-hidden="true">
      <div className="h-5 w-full"></div>
      <div className="h-4 w-full"></div>
    </div>
  </>
);

const ReloadOverview = ({
  onReloadClick,
  onOpenToken,
  onOpenChain,
  selectedToken,
  selectedChain,
  amount,
  setAmount,
  worldVerified,
  worldIdEnabled,
  verifiedSwapMode,
  amountFieldAnchorRef,
  pickerTriggersRef,
}: {
  onReloadClick: () => void;
  onOpenToken: () => void;
  onOpenChain: () => void;
  selectedToken: string;
  selectedChain: string;
  amount: string;
  setAmount: (v: string) => void;
  worldVerified: boolean;
  worldIdEnabled: boolean;
  verifiedSwapMode: boolean;
  amountFieldAnchorRef?: React.Ref<HTMLDivElement>;
  pickerTriggersRef?: React.Ref<HTMLDivElement>;
}) => {
  const fee = amount ? Number(amount) * 0.06 : 0;
  const receive = amount ? Number(amount) - fee : 0;
  const isActive = amount && !isNaN(Number(amount)) && Number(amount) > 0;

  return (
    <div className="flex h-full flex-col gap-6">
      <div className="shrink-0 py-2">
        <SmartContractInfo />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <div ref={pickerTriggersRef} className="grid shrink-0 grid-cols-2 gap-4">
        <div className="flex flex-col gap-3">
          <span className="text-[13px] font-medium leading-snug text-[var(--color-text-muted)]">Pay With</span>
          <button onClick={onOpenToken} className="h-14 flex items-center justify-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-deposit-input)] bg-[var(--color-bg-deposit-input)] text-[var(--color-text-primary)] hover:bg-[var(--color-bg-input-hover)] transition-all w-full outline-none">
            <div className="w-5 h-5 shrink-0 rounded-full overflow-hidden">
              {selectedToken === "USDC" ? (
                <img src={USDC_ICON_SRC} alt="USDC" width={20} height={20} className="h-full w-full object-cover" draggable={false} />
              ) : selectedToken === TETHER_TOKEN ? (
                <img src={TETHER_ICON_SRC} alt="" width={20} height={20} className="h-full w-full object-cover" draggable={false} />
              ) : selectedToken === DAI_TOKEN ? (
                <img src={DAI_ICON_SRC} alt="" width={20} height={20} className="h-full w-full object-contain" draggable={false} />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-[var(--color-usdc-blue)]">
                  <span className="text-[11px] font-bold text-[var(--color-text-primary)]">$</span>
                </div>
              )}
            </div>
            <span className="text-sm font-semibold">{selectedToken}</span>
          </button>
        </div>
        <div className="flex flex-col gap-3">
          <span className="text-[13px] font-medium leading-snug text-[var(--color-text-muted)]">Chain</span>
          <button onClick={onOpenChain} className="h-14 flex items-center justify-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-deposit-input)] bg-[var(--color-bg-deposit-input)] text-[var(--color-text-primary)] hover:bg-[var(--color-bg-input-hover)] transition-all w-full outline-none">
            <div
              className={cn(
                "w-5 h-5 rounded-full overflow-hidden flex items-center justify-center shrink-0",
                selectedChainUsesCircleMark(selectedChain) ? "bg-transparent" : "bg-[var(--color-primary)] p-0.5"
              )}
            >
              {selectedChainUsesCircleMark(selectedChain) ? (
                <img src={CHAIN_CIRCLE_MARK_SRC} alt="" width={20} height={20} className="h-full w-full object-contain" draggable={false} />
              ) : (
                <span className="text-[10px] font-bold text-[var(--color-text-primary)]">
                  {/^Chain (\d+)$/.exec(selectedChain)?.[1] ?? selectedChain.charAt(0)}
                </span>
              )}
            </div>
            <span className="text-sm font-semibold">{selectedChain}</span>
          </button>
        </div>
      </div>

        <div className="flex shrink-0 flex-col gap-3">
          <div ref={amountFieldAnchorRef} className="relative group w-full">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] text-sm font-medium z-10 opacity-60">Amount:</span>
            <Input value={amount} onChange={(e) => { const val = e.target.value.replace(/[^0-9.]/g, ""); if ((val.match(/\./g) || []).length <= 1) { setAmount(val); } }} placeholder="0" className="h-14 w-full pl-20 pr-16 bg-[var(--color-bg-deposit-input)] border border-[var(--color-border-deposit-input)] rounded-[var(--radius-md)] text-lg font-bold text-[var(--color-text-primary)] outline-none focus:!border-[var(--color-border-input-hover)] transition-all text-right" />
            <span className={cn("absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold z-10", amount && !isNaN(Number(amount)) ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-dimmed)]")}>{selectedToken}</span>
          </div>
          <div className="flex shrink-0 flex-col gap-3 py-0">
            <div className="flex justify-between items-center text-sm px-1">
              <span className="text-[var(--color-text-muted)]">You'll Receive:</span>
              <span className="text-[var(--color-text-primary)] font-medium">${receive.toFixed(2)} USD</span>
            </div>
            <div className="flex justify-between items-center text-xs opacity-60 px-1">
              <span className="text-[var(--color-text-muted)] font-medium">Fee: ${fee.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1" aria-hidden />

        {worldIdEnabled && worldVerified ? (
          <p className="shrink-0 text-center text-xs font-medium text-[var(--color-text-muted)]">
            Verified with World ID
          </p>
        ) : null}

        <div className="relative w-full shrink-0 shadow-2xl">
          <Button onClick={onReloadClick} disabled={!isActive} className={cn("h-12 w-full bg-[var(--color-reload-button-bg)] hover:bg-[var(--color-reload-button-bg)]/90 text-[var(--color-reload-button-text)] text-sm font-bold rounded-[14px] shadow-xl relative z-10 border-none transition-all active:scale-[0.98] disabled:opacity-30", isActive ? "shadow-[var(--color-reload-button-bg)]/20" : "opacity-30")}>
            {isActive
              ? worldIdEnabled && !worldVerified
                ? verifiedSwapMode
                  ? `Verify & Swap ${amount} ETH`
                  : `Verify & Reload ${amount} ${reloadCtaTicker(selectedToken)}`
                : verifiedSwapMode
                  ? `Swap ${amount} ETH on Base`
                  : `Reload ${amount} ${reloadCtaTicker(selectedToken)}`
              : verifiedSwapMode
                ? "Verified Swap"
                : "Reload Card"}
          </Button>
        </div>
      </div>
    </div>
  );
};

const SendFunds = ({
  onNext,
  selectedToken,
  selectedChain,
  amount,
  userDepositAddress,
  depositAddressesReady,
}: {
  onNext: () => void
  selectedToken: string
  selectedChain: string
  amount: string
  userDepositAddress?: string
 /** True after /api/deposit-addresses fetch settles (so we can show empty vs loading). */
  depositAddressesReady: boolean
}) => {
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const depositAddress = userDepositAddress || "";
  const sendTicker = reloadCtaTicker(selectedToken);
  const chainLabel = selectedChain.trim() || "selected";
  const amountDisplay =
    amount && !Number.isNaN(Number(amount)) && Number(amount) > 0 ? amount : "0";

  useEffect(() => {
    if (!depositAddress.trim()) {
      setQrDataUrl(null);
      return;
    }
    const cacheKey = `${SEND_FUNDS_QR_GEN_PX}|${depositAddress}`;
    const cached = sendFundsQrDataUrlCache.get(cacheKey);
    if (cached) {
      setQrDataUrl(cached);
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(depositAddress, {
      width: SEND_FUNDS_QR_GEN_PX,
      margin: 1,
      color: { dark: "#000000", light: "#ffffff" },
      errorCorrectionLevel: "M",
    })
      .then((url) => {
        if (cancelled) return;
        sendFundsQrDataUrlCache.set(cacheKey, url);
        setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [depositAddress]);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!depositAddress) return;
    navigator.clipboard.writeText(depositAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const addressLoading = !depositAddressesReady;
  const displayAddressText = addressLoading ? "Loading…" : depositAddress || "—";
  const {
    addressRowRef,
    addressTextCellRef,
    addressTextRef,
    addressFontPx,
    addressRowGridStyle,
  } = useFitMonospaceAddressRow(displayAddressText);

  const showQrLoading = addressLoading;
  const showQrEmpty = depositAddressesReady && !depositAddress.trim();
  const generatingQr = depositAddressesReady && !!depositAddress.trim() && !qrDataUrl;
  const qrBoxClass =
    "flex flex-col items-center justify-center gap-1.5 rounded-[8px] bg-zinc-100/90 px-2 py-2 text-center dark:bg-zinc-800/80";

  const sendFundsVisual = useMemo(() => sendFundsVisualForToken(selectedToken), [selectedToken]);
  const qrTileBoxShadow = useMemo(() => {
    const depth = "0 25px 50px -12px rgb(0 0 0 / 0.25)";
    const haloBase = sendFundsVisual?.glow ?? "var(--color-nuro-brand)";
    return `0 0 0 1.5px color-mix(in srgb, ${haloBase} 48%, transparent), 0 0 22px color-mix(in srgb, ${haloBase} 36%, transparent), 0 0 44px color-mix(in srgb, ${haloBase} 18%, transparent), ${depth}`;
  }, [sendFundsVisual]);

  return (
    <div className="relative flex h-full min-h-0 flex-col gap-3">
      <div className="flex min-h-0 flex-1 flex-col items-center justify-start overflow-visible px-3 pb-0 pt-1">
        <div
          className="mx-auto mb-5 w-fit max-w-full shrink-0 rounded-[16px] bg-white p-2"
          style={{ boxShadow: qrTileBoxShadow }}
        >
          {qrDataUrl && depositAddress.trim() ? (
            <img
              src={qrDataUrl}
              alt="Deposit QR code"
              width={SEND_FUNDS_QR_GEN_PX}
              height={SEND_FUNDS_QR_GEN_PX}
              className="block shrink-0 rounded-[6px] object-contain"
              style={{ width: SEND_FUNDS_QR_DISPLAY_PX, height: SEND_FUNDS_QR_DISPLAY_PX }}
              draggable={false}
            />
          ) : showQrLoading ? (
            <div className={cn(qrBoxClass)} style={{ width: SEND_FUNDS_QR_DISPLAY_PX, height: SEND_FUNDS_QR_DISPLAY_PX }}>
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-nuro-brand)] border-t-transparent" aria-hidden />
              <span className="text-[10px] font-medium text-zinc-600 dark:text-zinc-400">Loading address…</span>
            </div>
          ) : showQrEmpty ? (
            <div
              className={cn(qrBoxClass, "shrink-0 overflow-hidden")}
              style={{ width: SEND_FUNDS_QR_DISPLAY_PX, height: SEND_FUNDS_QR_DISPLAY_PX }}
            >
              <span className="line-clamp-2 text-[10px] font-semibold leading-tight text-zinc-700 dark:text-zinc-300">
                No deposit address
              </span>
              <span className="line-clamp-3 text-[8.5px] leading-[1.35] text-zinc-500 dark:text-zinc-500">
                Try another network or complete account verification.
              </span>
            </div>
          ) : generatingQr ? (
            <div className={cn(qrBoxClass)} style={{ width: SEND_FUNDS_QR_DISPLAY_PX, height: SEND_FUNDS_QR_DISPLAY_PX }}>
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-nuro-brand)] border-t-transparent" aria-hidden />
              <span className="text-[10px] font-medium text-zinc-600 dark:text-zinc-400">Generating QR…</span>
            </div>
          ) : (
            <div
              className="rounded-[6px] bg-zinc-100/90 animate-pulse dark:bg-zinc-800/80"
              style={{ width: SEND_FUNDS_QR_DISPLAY_PX, height: SEND_FUNDS_QR_DISPLAY_PX }}
            />
          )}
        </div>
        <div className="flex w-full shrink-0 flex-col items-center justify-center">
          <div className="w-full max-w-[22rem] px-0 text-center">
            <p className="m-0 w-full text-center text-[15px] font-semibold leading-tight text-[var(--color-text-primary)] text-balance sm:text-[17px]">
              <span className="text-[var(--color-text-primary)]">Send</span>{" "}
              <span
                className={cn("font-bold", !sendFundsVisual && "text-[var(--color-nuro-brand)]")}
                style={sendFundsVisual ? { color: sendFundsVisual.glow } : undefined}
              >
                {amountDisplay} {sendTicker}
              </span>
            </p>
            <p className="m-0 mt-1 w-full text-center text-[13px] font-medium leading-snug text-[var(--color-text-muted)] text-balance sm:text-[14px]">
              on the <span className="font-semibold text-[var(--color-text-primary)]">{chainLabel}</span> Network only
            </p>
          </div>
        </div>
      </div>

      <div className="flex w-full shrink-0 flex-col gap-4">
        <div className="w-full">
          <label className="mb-1.5 ml-1 block text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-dimmed)]">Deposit Address</label>
          <div
            ref={addressRowRef}
            onClick={depositAddress ? handleCopy : undefined}
            className={cn(
              "relative grid h-14 w-full min-w-0 items-center rounded-[12px] border border-[var(--color-border-deposit-input)] bg-[var(--color-bg-deposit-input)] pl-5 pr-[12px] transition-all",
              depositAddress && "cursor-pointer hover:border-[var(--color-border-input-hover)] hover:bg-[var(--color-bg-input-hover)]",
            )}
            style={addressRowGridStyle}
          >
            <div ref={addressTextCellRef} className="relative z-0 flex min-w-0 items-center overflow-visible">
              <span
                ref={addressTextRef}
                className="inline-block select-all font-mono whitespace-nowrap leading-none text-[var(--color-text-muted)]"
                style={{ fontSize: `${addressFontPx}px` }}
              >
                {displayAddressText}
              </span>
            </div>
            <button
              type="button"
              onClick={handleCopy}
              disabled={!depositAddress}
              className={cn(
                "relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border transition-colors",
                "border-white/12 bg-white/[0.04] text-[var(--color-text-muted)] opacity-70",
                "hover:border-white/20 hover:bg-white/10 hover:text-[var(--color-text-primary)] hover:opacity-100",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/30",
                !depositAddress && "pointer-events-none opacity-40",
              )}
              aria-label="Copy deposit address"
            >
              <AnimatePresence mode="wait">
                {copied ? (
                  <motion.div key="check" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }} transition={{ duration: 0.15 }}>
                    <CheckIcon className="h-4 w-4" strokeWidth={2.5} />
                  </motion.div>
                ) : (
                  <motion.div key="copy" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }} transition={{ duration: 0.15 }}>
                    <CopyIcon className="h-4 w-4" strokeWidth={2.5} />
                  </motion.div>
                )}
              </AnimatePresence>
            </button>
          </div>
        </div>

        <div className="relative w-full">
          <Button
            onClick={onNext}
            className="h-12 w-full rounded-[14px] border-none bg-[var(--color-reload-button-bg)] text-sm font-bold text-[var(--color-reload-button-text)] shadow-none transition-all hover:bg-[var(--color-reload-button-bg)]/90 active:scale-[0.98]"
          >
            I&apos;ve Sent The Funds
          </Button>
        </div>
      </div>
    </div>
  );
};

export const reloadFlowHeroStyles = `
        @keyframes rippleExpand {
          0% { transform: scale(1); opacity: 0.8; }
          100% { transform: scale(2.2); opacity: 0; }
        }
        .animate-ripple { animation: rippleExpand 3s ease-out infinite; }
      `;

function tokenAccentForSelected(selectedToken: string) {
  if (selectedToken === "USDC") return { glow: "#2775CA", ring: "rgba(39, 117, 202, 0.65)" };
 /* Tether logo fill #24A17B — rings/glow match USDT green */
  if (selectedToken === TETHER_TOKEN) return { glow: "#24A17B", ring: "rgba(36, 161, 123, 0.82)" };
 /* Dai logo fill #F5AC37 — warm gold rings */
  if (selectedToken === DAI_TOKEN) return { glow: "#F5AC37", ring: "rgba(245, 172, 55, 0.88)" };
  return { glow: "#52525b", ring: "rgba(161, 161, 170, 0.5)" };
}

/** Failed withdraw/reload — red halo behind token hero (matches `--color-error`). */
const ERROR_HERO_ACCENT = { glow: "#DE5555", ring: "rgba(222, 85, 85, 0.65)" };

/** Send-funds QR halo + amount line — only the three picker tokens; extend when adding coins. */
function sendFundsVisualForToken(selectedToken: string): { glow: string } | null {
  if (selectedToken === "USDC" || selectedToken === TETHER_TOKEN || selectedToken === DAI_TOKEN) {
    return { glow: tokenAccentForSelected(selectedToken).glow };
  }
  return null;
}

function heroGlowPulseClass(selectedToken: string) {
  if (selectedToken === TETHER_TOKEN) return "animate-glow-pulse-tether";
  if (selectedToken === DAI_TOKEN) return "animate-glow-pulse-dai";
  return "animate-glow-pulse";
}

export function ReloadFlowTokenHero({
  selectedToken,
  pulse,
  tone = "default",
  className,
}: {
  selectedToken: string
  pulse: boolean
  tone?: "default" | "error"
  className?: string
}) {
  const tokenProgressAccent = useMemo(
    () => (tone === "error" ? ERROR_HERO_ACCENT : tokenAccentForSelected(selectedToken)),
    [selectedToken, tone],
  );

  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center w-[124px] h-[124px] mb-[26px]",
        className
      )}
    >
      {pulse && (
        <div
          className={cn(
            "absolute inset-0 rounded-full blur-[24px] pointer-events-none will-change-[transform,opacity]",
            heroGlowPulseClass(selectedToken)
          )}
          style={{ backgroundColor: tokenProgressAccent.glow }}
        />
      )}
      {pulse && (
        <>
          <div
            className="absolute w-[82px] h-[82px] rounded-full border-[1px] animate-ripple will-change-[transform,opacity]"
            style={{ borderColor: tokenProgressAccent.ring }}
          />
          <div
            className="absolute w-[82px] h-[82px] rounded-full border-[1px] animate-ripple will-change-[transform,opacity]"
            style={{ animationDelay: "1.5s", borderColor: tokenProgressAccent.ring }}
          />
        </>
      )}
      <div className="relative z-10 flex h-[82px] w-[82px] items-center justify-center overflow-hidden rounded-full">
        {selectedToken === "USDC" ? (
          <img src={USDC_ICON_SRC} alt="" width={82} height={82} className="h-full w-full object-cover" draggable={false} />
        ) : selectedToken === TETHER_TOKEN ? (
          <img src={TETHER_ICON_SRC} alt="" width={82} height={82} className="h-full w-full object-cover" draggable={false} />
        ) : selectedToken === DAI_TOKEN ? (
          <img src={DAI_ICON_SRC} alt="" width={82} height={82} className="h-full w-full object-contain" draggable={false} />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[var(--color-usdc-blue)]">
            <span className="text-[28px] font-bold text-[var(--color-text-primary)]">$</span>
          </div>
        )}
      </div>
    </div>
  );
}

/** Step 3 — verifying; no auto timer; user dismisses with Close */
const ReloadProgressScreen = ({ onClose, onBack, selectedToken, isError }: { onClose: () => void, onBack: () => void, selectedToken: string, isError: boolean }) => (
  <div className="flex flex-col gap-6 h-full relative">
    <style>{reloadFlowHeroStyles}</style>
    <div className="absolute top-0 left-0 right-0 bottom-[88px] flex flex-col items-center justify-center z-10 pointer-events-none">
      <ReloadFlowTokenHero selectedToken={selectedToken} pulse={!isError} />
      <div className="relative top-[15px] flex flex-col items-center">
        <h1 className="text-[20px] font-bold text-[var(--color-text-primary)] tracking-tight leading-none mb-3">
          {isError ? "Reload Failed" : "Reload In Progress"}
        </h1>
        <p className="text-[13px] font-medium text-[var(--color-text-muted)] text-center leading-[1.6]">
          {isError ? (
            <>Try going back a step and<br />check your connection.</>
          ) : (
            <>You can close this window.<br />{`We're verifying your funds.`}</>
          )}
        </p>
        {!isError && (
          <p className="text-[11px] font-bold text-[var(--color-text-dimmed)] text-center mt-6 tracking-wide uppercase">
            Est time ~1 minute
          </p>
        )}
      </div>
    </div>
    <div className="py-2 opacity-0 pointer-events-none shrink-0" aria-hidden="true">
      <SmartContractInfo />
    </div>
    <div className="grid grid-cols-2 gap-3 opacity-0 pointer-events-none shrink-0" aria-hidden="true">
      <div className="flex flex-col gap-3"><div className="text-[12px] h-[16px]"></div><div className="h-12 w-full"></div></div>
      <div className="flex flex-col gap-3"><div className="text-[12px] h-[16px]"></div><div className="h-12 w-full"></div></div>
    </div>
    <div className="relative flex flex-col gap-6 flex-1 w-full">
      <MiddleSkeleton />
      <div className="relative w-full mt-auto shadow-2xl shrink-0 pointer-events-auto">
        {isError ? (
          <Button
            onClick={onBack}
            className="group flex h-12 w-full items-center justify-center gap-2 rounded-[14px] border-[1.5px] border-[var(--color-reload-button-bg)] bg-transparent text-sm font-bold text-[var(--color-text-primary)] shadow-none transition-all hover:bg-[var(--color-reload-button-bg)]/10 active:scale-[0.98]"
          >
            <ChevronIcon className="h-5 w-5 shrink-0 text-[var(--color-text-primary)]" />
            <span>Back</span>
          </Button>
        ) : (
          <Button
            onClick={onClose}
            className="h-12 w-full rounded-[14px] border-none bg-[var(--color-reload-button-bg)] text-sm font-bold text-[var(--color-reload-button-text)] shadow-xl shadow-[var(--color-reload-button-bg)]/20 transition-all hover:bg-[var(--color-reload-button-bg)]/90 active:scale-[0.98]"
          >
            Close
          </Button>
        )}
      </div>
    </div>
  </div>
);

/** Step 4 — success only; auto-close countdown. Illustration: `public/Success_Square.svg` (wallet send success). */
const ReloadSuccessScreen = ({
  onClose,
  selectedToken: _selectedToken,
  txHash,
}: {
  onClose: () => void;
  selectedToken: string;
  txHash?: string | null;
}) => {
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    if (countdown === 0) {
      onClose();
      return;
    }
    const timer = window.setTimeout(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [countdown, onClose]);

  return (
    <div className="flex flex-col gap-6 h-full relative">
      <div className="absolute top-0 left-0 right-0 bottom-[88px] flex flex-col items-center justify-center z-10 pointer-events-none">
        <motion.img
          src={FLOW_SUCCESS_ILLUSTRATION_SRC}
          alt=""
          width={156}
          height={168}
          initial={{ scale: 0.94, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 24 }}
          className="mb-5 h-auto w-auto max-h-[min(168px,28vh)] max-w-[min(156px,78%)] shrink-0 object-contain"
        />
        <div className="flex flex-col items-center">
          <h1 className="text-[20px] font-bold text-[var(--color-text-primary)] tracking-tight leading-none mb-3">
            {txHash ? "Swap Complete" : "Reload Complete"}
          </h1>
          <p className="text-[13px] font-medium text-[var(--color-text-muted)] text-center leading-[1.6]">
            {txHash ? (
              <>
                Swap confirmed on Base.
                <br />
                <a
                  href={`https://basescan.org/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-[11px] text-[var(--color-primary)] hover:underline"
                >
                  {txHash.slice(0, 10)}…{txHash.slice(-8)}
                </a>
              </>
            ) : (
              <>
                Your reload was successful.
                <br />
                This window will close automatically.
              </>
            )}
          </p>
        </div>
      </div>
      <div className="py-2 opacity-0 pointer-events-none shrink-0" aria-hidden="true">
        <SmartContractInfo />
      </div>
      <div className="grid grid-cols-2 gap-3 opacity-0 pointer-events-none shrink-0" aria-hidden="true">
        <div className="flex flex-col gap-3"><div className="text-[12px] h-[16px]"></div><div className="h-12 w-full"></div></div>
        <div className="flex flex-col gap-3"><div className="text-[12px] h-[16px]"></div><div className="h-12 w-full"></div></div>
      </div>
      <div className="relative flex flex-col gap-6 flex-1 w-full">
        <MiddleSkeleton />
        <div className="relative w-full mt-auto shadow-2xl shrink-0 pointer-events-auto">
          <Button
            onClick={onClose}
            className="h-12 w-full rounded-[14px] border-none bg-[var(--color-reload-button-bg)] text-sm font-bold text-[var(--color-reload-button-text)] shadow-xl shadow-[var(--color-reload-button-bg)]/20 transition-all hover:bg-[var(--color-reload-button-bg)]/90 active:scale-[0.98]"
          >
            Auto Close in {Math.max(countdown, 1)}
          </Button>
        </div>
      </div>
    </div>
  );
};

export type ReloadFlowHandle = { goBack: () => void };

export interface ReloadFlowProps {
  onNext?: () => void;
  onBack: () => void;
  onClose: () => void;
 /** `modal`: shell provides title + close (official dashboard modal); no duplicate header on step 1. */
  variant?: "default" | "modal";
  onStepChange?: (step: number) => void;
 /** When true with `variant="modal"`, progress dots are omitted (shell renders its own). */
  hideProgressDots?: boolean;
 /** Shell pagination row (modal). Picker `bottom` is set from layout so the sheet ends at this strip. */
  paginationStripRef?: React.RefObject<HTMLDivElement | null>;
}

function depositAddressForChain(
  selectedChain: string,
  addresses: { evm: string; base: string; solana: string },
): string {
  const c = selectedChain.trim().toLowerCase();
  if (c === "base") return addresses.base || addresses.evm;
  if (c === "solana") return addresses.solana;
  return addresses.evm;
}

/** When `/api/deposit-addresses` (or session) yields nothing, still show a working QR + deposit row. */
const MOCK_RELOAD_DEPOSIT_ADDRESSES: { evm: string; base: string; solana: string } = {
  evm: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96000",
  base: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96000",
  solana: "So11111111111111111111111111111111111111112",
};

export const ReloadFlow = forwardRef<ReloadFlowHandle, ReloadFlowProps>(function ReloadFlow(
  { onBack, onClose, variant = "default", onStepChange, hideProgressDots = false, paginationStripRef },
  ref,
) {
  const { data: session } = useAppSession();
  const worldIdEnabled = isWorldIdConfigured();
  const verifiedSwapMode = worldIdEnabled;
  const worldSignal = session?.user?.id ?? session?.user?.email ?? "nuro-reload-anon";
  const [step, setStep] = useState(1);
  const [swapTxHash, setSwapTxHash] = useState<string | null>(null);
  const [worldVerified, setWorldVerified] = useState(!worldIdEnabled);
  const [worldGateOpen, setWorldGateOpen] = useState(false);
  const [depositAddresses, setDepositAddresses] = useState({ evm: "", base: "", solana: "" });
  const [depositAddressesReady, setDepositAddressesReady] = useState(false);
  type PickerView = "token" | "chain";
  const [pickerView, setPickerView] = useState<PickerView | null>(null);
  const isPickerOpen = pickerView !== null;
  const isTokenOpen = pickerView === "token";
  const isChainOpen = pickerView === "chain";
  const [selectedToken, setSelectedToken] = useState("USDC");
  const [selectedChain, setSelectedChain] = useState("Base");
  const [amount, setAmount] = useState("");
  const [isError, setIsError] = useState(false);
 /** Edge fades apply only after user scrolls (`scrollTop > 0`); avoids dimming first row at rest. */
  const [chainScrollEdgeMask, setChainScrollEdgeMask] = useState({ active: false, top: false, bottom: false });
  const [chainSearch, setChainSearch] = useState("");
  const reloadFlowRootRef = useRef<HTMLDivElement>(null);
  const amountFieldAnchorRef = useRef<HTMLDivElement>(null);
  const pickerScrollBodyRef = useRef<HTMLDivElement>(null);
  const pickerPanelRef = useRef<HTMLDivElement>(null);
  const pickerTriggersRef = useRef<HTMLDivElement>(null);
 /** `+1` forward (next), `-1` back — modal step transitions read this in variant callbacks. */
  const stepSlideDirRef = useRef(1);
 /** Step 3 entered at this time; used to match new `deposit` rows from `/api/card-transactions`. */
  const reloadDepositNotifyBaselineMsRef = useRef<number | null>(null);
  const reloadDepositNotifySentRef = useRef(false);
 /** Pixels from ReloadFlow root top to Amount row top; drives token/chain overlay `top` (replaces fixed 212). */
  const [pickerOverlayTopPx, setPickerOverlayTopPx] = useState(212);
 /** Modal: distance from flow root bottom to shell pagination strip bottom (measured). */
  const [modalPickerBottomExtendPx, setModalPickerBottomExtendPx] = useState(0);

  const syncPickerOverlayTop = useCallback(() => {
    const root = reloadFlowRootRef.current;
    const anchor = amountFieldAnchorRef.current;
    if (!root || !anchor) return;
    setPickerOverlayTopPx(Math.round(anchor.getBoundingClientRect().top - root.getBoundingClientRect().top));
  }, []);

  const syncModalPickerBottomExtend = useCallback(() => {
    if (variant !== "modal" || !hideProgressDots || !paginationStripRef?.current || !reloadFlowRootRef.current) {
      setModalPickerBottomExtendPx(0);
      return;
    }
    const rootBottom = reloadFlowRootRef.current.getBoundingClientRect().bottom;
    const stripBottom = paginationStripRef.current.getBoundingClientRect().bottom;
    setModalPickerBottomExtendPx(Math.max(0, Math.round(stripBottom - rootBottom)));
  }, [variant, hideProgressDots, paginationStripRef]);

  const userDepositAddress = useMemo(() => {
    const fromApi = depositAddressForChain(selectedChain, depositAddresses).trim();
    if (fromApi) return fromApi;
    if (!depositAddressesReady) return "";
    return depositAddressForChain(selectedChain, MOCK_RELOAD_DEPOSIT_ADDRESSES);
  }, [selectedChain, depositAddresses, depositAddressesReady]);

  const goBackOneStep = useCallback(() => {
    stepSlideDirRef.current = -1;
    setStep((s) => {
      if (s <= 1) return 1;
      if (s === 4) {
        reloadDepositNotifySentRef.current = false;
        reloadDepositNotifyBaselineMsRef.current = null;
      }
      if (s === 3) setIsError(false);
      return s - 1;
    });
  }, []);

  const updateChainScrollEdgeMask = useCallback((el: HTMLDivElement) => {
    const overflow = el.scrollHeight > el.clientHeight + 0.5;
    const st = el.scrollTop;
    const rem = el.scrollHeight - st - el.clientHeight;
    const top = overflow && st > 0.5;
    const bottom = overflow && rem > 0.5;
    const active = top || bottom;
    setChainScrollEdgeMask((prev) =>
      prev.active === active && prev.top === top && prev.bottom === bottom ? prev : { active, top, bottom },
    );
  }, []);

  useImperativeHandle(ref, () => ({ goBack: goBackOneStep }), [goBackOneStep]);

  useLayoutEffect(() => {
    if (!isPickerOpen) return;
    const root = reloadFlowRootRef.current;
    const anchor = amountFieldAnchorRef.current;
    if (!root || !anchor) return;

    const syncAll = () => {
      syncPickerOverlayTop();
      syncModalPickerBottomExtend();
    };
    syncAll();
    const onResize = () => syncAll();
    window.addEventListener("resize", onResize);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(syncAll) : null;
    ro?.observe(root);
    ro?.observe(anchor);
    const strip = paginationStripRef?.current;
    if (strip) ro?.observe(strip);
    return () => {
      window.removeEventListener("resize", onResize);
      ro?.disconnect();
    };
  }, [isPickerOpen, step, variant, amount, hideProgressDots, paginationStripRef, syncPickerOverlayTop, syncModalPickerBottomExtend]);

  useLayoutEffect(() => {
    if (pickerView !== "chain") {
      setChainScrollEdgeMask({ active: false, top: false, bottom: false });
      return;
    }
    const el = pickerScrollBodyRef.current;
    if (!el) return;
    el.scrollTop = 0;
    setChainScrollEdgeMask({ active: false, top: false, bottom: false });
    const syncOverflow = () => {
      updateChainScrollEdgeMask(el);
    };
    syncOverflow();
    requestAnimationFrame(() => {
      requestAnimationFrame(syncOverflow);
    });
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(syncOverflow);
    ro.observe(el);
    const grid = el.firstElementChild;
    if (grid instanceof HTMLElement) ro.observe(grid);
    return () => ro.disconnect();
  }, [pickerView, chainSearch, updateChainScrollEdgeMask]);

 // Fetch real deposit address from API
  useEffect(() => {
    const token = (session as any)?.accessToken;
    if (!token) {
      setDepositAddresses({ evm: "", base: "", solana: "" });
      setDepositAddressesReady(true);
      return;
    }
    setDepositAddressesReady(false);
    fetch("/api/deposit-addresses", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        setDepositAddresses({
          evm: typeof data.evm === "string" ? data.evm : "",
          base: typeof data.base === "string" ? data.base : "",
          solana: typeof data.solana === "string" ? data.solana : "",
        });
      })
      .catch(() => {})
      .finally(() => setDepositAddressesReady(true));
  }, [session]);

 // After the user is on reload verification (step 3), notify once the ledger shows a new deposit (not on "I've sent" alone).
  useEffect(() => {
    if (step !== 3 || isError) {
      if (step !== 3) {
        reloadDepositNotifySentRef.current = false;
        reloadDepositNotifyBaselineMsRef.current = null;
      }
      return;
    }
    if (reloadDepositNotifyBaselineMsRef.current === null) {
      reloadDepositNotifyBaselineMsRef.current = Date.now();
    }
    const token = (session as any)?.accessToken;
    if (!token) return;
    let cancelled = false;
    const tick = async () => {
      if (cancelled || reloadDepositNotifySentRef.current) return;
      try {
        const r = await fetch("/api/card-transactions?page=1&pageSize=40", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!r.ok) return;
        const data = await r.json().catch(() => ({}));
        const rows: unknown[] = Array.isArray(data)
          ? data
          : Array.isArray((data as { transactions?: unknown }).transactions)
            ? ((data as { transactions: unknown[] }).transactions ?? [])
            : [];
        const baseline = reloadDepositNotifyBaselineMsRef.current ?? Date.now();
        for (const raw of rows) {
          const tx = raw as Record<string, unknown>;
          const type = String(tx.type ?? "").toLowerCase();
          if (type !== "deposit") continue;
          const rawDate = tx.date ?? tx.created_at ?? tx.createdAt;
          const dateMs = rawDate ? new Date(String(rawDate)).getTime() : 0;
          if (dateMs >= baseline - 8_000) {
            reloadDepositNotifySentRef.current = true;
            stepSlideDirRef.current = 1;
            setStep(4);
            emitDashboardInFlightOperation("reload");
            emitFirstDepositSuccess();
            return;
          }
        }
      } catch {
 /* ignore */
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 4_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [step, isError, session]);

 // Chain icons from public CDNs
  const chainIcon = (slug: string) => `https://icons.llamao.fi/icons/chains/rsz_${slug}.jpg`;
  const networks = React.useMemo(() => [
    { id: "chain-base", name: "Base", logo: "", icon: CHAIN_CIRCLE_MARK_SRC },
    { id: "chain-ethereum", name: "Ethereum", logo: "ETH", icon: chainIcon("ethereum") },
    { id: "chain-solana", name: "Solana", logo: "SOL", icon: chainIcon("solana") },
    { id: "chain-bsc", name: "BSC", logo: "BNB", icon: chainIcon("binance") },
    { id: "chain-avalanche", name: "Avalanche", logo: "AVAX", icon: chainIcon("avalanche") },
    { id: "chain-polygon", name: "Polygon", logo: "MATIC", icon: chainIcon("polygon") },
    { id: "chain-optimism", name: "Optimism", logo: "OP", icon: chainIcon("optimism") },
    { id: "chain-arbitrum", name: "Arbitrum", logo: "ARB", icon: chainIcon("arbitrum") },
    { id: "chain-zksync", name: "zkSync Era", logo: "ZK", icon: chainIcon("zksync%20era") },
    { id: "chain-linea", name: "Linea", logo: "LNA", icon: chainIcon("linea") },
    { id: "chain-scroll", name: "Scroll", logo: "SCR", icon: chainIcon("scroll") },
    { id: "chain-worldchain", name: "World Chain", logo: "WLD", icon: "" },
    { id: "chain-sei", name: "Sei", logo: "SEI", icon: chainIcon("sei") },
    { id: "chain-unichain", name: "Unichain", logo: "UNI", icon: "" },
    { id: "chain-ink", name: "Ink", logo: "INK", icon: "" },
    { id: "chain-hyperevm", name: "HyperEVM", logo: "HYPE", icon: "" },
    { id: "chain-monad", name: "Monad", logo: "MON", icon: "" },
    { id: "chain-gnosis", name: "Gnosis", logo: "GNO", icon: chainIcon("gnosis") },
    { id: "chain-celo", name: "Celo", logo: "CELO", icon: chainIcon("celo") },
    { id: "chain-sonic", name: "Sonic", logo: "S", icon: "" },
    { id: "chain-xdc", name: "XDC", logo: "XDC", icon: "" },
    { id: "chain-plume", name: "Plume", logo: "PLU", icon: "" },
    { id: "chain-codex", name: "Codex", logo: "CDX", icon: "" },
  ], []);

  const chainPickerScrollMaskImage = useMemo(() => {
    const t = chainScrollEdgeMask.top;
    const b = chainScrollEdgeMask.bottom;
    if (t && b) {
      return "linear-gradient(to bottom, rgba(255,255,255,0) 0%, rgba(255,255,255,1) 28px, rgba(255,255,255,1) calc(100% - 28px), rgba(255,255,255,0) 100%)";
    }
    if (t) {
      return "linear-gradient(to bottom, rgba(255,255,255,0) 0%, rgba(255,255,255,1) 28px, rgba(255,255,255,1) 100%)";
    }
    if (b) {
      return "linear-gradient(to bottom, rgba(255,255,255,1) 0%, rgba(255,255,255,1) calc(100% - 28px), rgba(255,255,255,0) 100%)";
    }
    return "linear-gradient(to bottom, rgba(255,255,255,1) 0%, rgba(255,255,255,1) 100%)";
  }, [chainScrollEdgeMask.top, chainScrollEdgeMask.bottom]);

  const handleOpenToken = React.useCallback(() => setPickerView("token"), []);
  const handleOpenChain = React.useCallback(() => setPickerView("chain"), []);
  const closePickers = React.useCallback(() => {
    setPickerView(null);
    setChainSearch("");
  }, []);

  const isPanePicker = variant === "default";
  const isHomeReloadModalChainPicker = variant === "modal" && hideProgressDots;
 /** My Card sidebar widget + home reload modal — not legacy full-grid modal pickers. */
  const isSplitChainPicker = isHomeReloadModalChainPicker || (isPanePicker && isChainOpen);
  const splitChainPickerGap = isPanePicker && !isHomeReloadModalChainPicker ? "gap-3" : "gap-[16px]";
  const splitChainTileSize: "pane" | "homeModal" = isPanePicker ? "pane" : "homeModal";

  const chainPickerFiltered = useMemo(
    () => networks.filter((n) => n.name.toLowerCase().includes(chainSearch.toLowerCase())),
    [networks, chainSearch],
  );

  const reloadActiveChains = useMemo(
    () =>
      RELOAD_ACTIVE_CHAINS.map((name) =>
        chainPickerFiltered.find((n) => n.name === name),
      ).filter((n): n is (typeof networks)[number] => n != null),
    [chainPickerFiltered],
  );

  const reloadComingSoonChains = useMemo(
    () => chainPickerFiltered.filter((n) => !isReloadActiveChain(n.name)),
    [chainPickerFiltered],
  );

  const renderChainPickerTile = (
    chain: (typeof networks)[number],
    options: { disabled?: boolean; tileSize?: "pane" | "modal" | "homeModal" } = {},
  ) => {
    const { disabled = false, tileSize = isPanePicker ? "pane" : isHomeReloadModalChainPicker ? "homeModal" : "modal" } = options;
    const iconSize = tileSize === "pane" ? 32 : 40;
    const iconBoxClass = tileSize === "pane" ? "h-8 w-8" : "h-10 w-10";

    return (
      <button
        key={chain.id}
        type="button"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setSelectedChain(chain.name);
          setPickerView(null);
          setChainSearch("");
        }}
        className={cn(
          "relative overflow-hidden group/btn rounded-[var(--radius-md)] bg-white/[0.04] flex flex-col items-center justify-center transition-all duration-300 outline-none",
          tileSize === "pane" ? "aspect-square w-full min-h-0 gap-2" : "aspect-square gap-2.5",
          disabled ? "cursor-not-allowed opacity-35" : "hover:bg-white/[0.05]",
        )}
      >
        {!disabled ? (
          <div className="absolute inset-x-0 bottom-0 h-[45%] bg-[radial-gradient(50%_100%_at_50%_100%,var(--color-glass-highlight)_0%,transparent_100%)] opacity-0 group-hover/btn:opacity-100 transition-opacity pointer-events-none" />
        ) : null}
        <div
          className={cn(
            "relative z-10 shrink-0 overflow-hidden rounded-full flex items-center justify-center border-0",
            iconBoxClass,
            selectedChainUsesCircleMark(chain.name) ? "bg-transparent" : "bg-white/[0.04]",
          )}
        >
          {chain.icon ? (
            <img
              src={chain.icon}
              alt={chain.name}
              width={iconSize}
              height={iconSize}
              className={cn("h-full w-full object-cover rounded-full", disabled && "grayscale")}
              draggable={false}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
                (e.target as HTMLImageElement).nextElementSibling &&
                  ((e.target as HTMLImageElement).nextElementSibling as HTMLElement).style.removeProperty("display");
              }}
            />
          ) : null}
          {!chain.icon && (
            <span className="text-[13px] font-black text-[var(--color-text-primary)]">{chain.logo}</span>
          )}
        </div>
        <span className="relative z-10 text-[11.5px] font-semibold text-[var(--color-text-muted)] text-center leading-tight">{chain.name}</span>
      </button>
    );
  };

  useEffect(() => {
    if (!isPanePicker || !isPickerOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (pickerPanelRef.current?.contains(target)) return;
      if (pickerTriggersRef.current?.contains(target)) return;
      closePickers();
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [isPanePicker, isPickerOpen, closePickers]);

  const handleSetAmount = React.useCallback((v: string) => setAmount(v), []);

  useEffect(() => {
    if (!worldIdEnabled || typeof window === "undefined") return;
    const key = worldReloadSessionKey(worldSignal);
    if (sessionStorage.getItem(key) === "1") {
      setWorldVerified(true);
    }
  }, [worldIdEnabled, worldSignal]);

  const handleNextStep2 = React.useCallback(() => {
    stepSlideDirRef.current = 1;
    setStep(2);
  }, []);

  const handleWorldVerified = React.useCallback(() => {
    setWorldVerified(true);
    if (typeof window !== "undefined") {
      sessionStorage.setItem(worldReloadSessionKey(worldSignal), "1");
    }
    handleNextStep2();
  }, [worldSignal, handleNextStep2]);

  const handleReloadClick = React.useCallback(() => {
    if (!worldIdEnabled || worldVerified) {
      handleNextStep2();
      return;
    }
    setWorldGateOpen(true);
  }, [worldIdEnabled, worldVerified, handleNextStep2]);

  const handleSwapSuccess = React.useCallback(
    (txHash: string) => {
      setSwapTxHash(txHash);
      stepSlideDirRef.current = 1;
      setStep(4);
      emitFirstDepositSuccess();
    },
    [],
  );

  useEffect(() => {
    onStepChange?.(step);
  }, [step, onStepChange]);

  const handleNextStep3 = React.useCallback(() => {
    stepSlideDirRef.current = 1;
    setStep(3);
    emitDashboardInFlightOperation("reload");
  }, []);
  const handleBackToStep2 = goBackOneStep;

  const stepHeading =
    step === 4 ? "Success" : step === 3 ? (isError ? "Failed" : "Progress") : "Reload Card";

 /** Non-modal: horizontal slide. Modal: horizontal slide with direction from `stepSlideDirRef`. */
  const stepPresenceMotion = useMemo(
    () => ({
      initial: { opacity: 0, x: 20 } as const,
      animate: { opacity: 1, x: 0 } as const,
      exit: { opacity: 0, x: -20 } as const,
      transition: { duration: 0.3 } as const,
    }),
    [],
  );

  const modalStepSlideVariants = useMemo(
    () => ({
      initial: () => ({
        opacity: 0,
        x: stepSlideDirRef.current > 0 ? 28 : -28,
      }),
      animate: {
        opacity: 1,
        x: 0,
        transition: { duration: 0.32, ease: [0.33, 1, 0.68, 1] as const },
      },
      exit: () => ({
        opacity: 0,
 // Fade in place only: horizontal exit slide + box-shadow QR halo under a parent
 // `overflow-hidden` (modal shell) leaves a clipped strip / “QR on blank frame” for one frame.
        x: 0,
        transition: { duration: 0.24, ease: [0.33, 1, 0.68, 1] as const },
      }),
    }),
    [],
  );

  return (
    <div ref={reloadFlowRootRef} className="relative flex h-full min-h-0 w-full flex-col">
      {worldIdEnabled ? (
        <WorldIdReloadGate
          open={worldGateOpen}
          onOpenChange={setWorldGateOpen}
          signal={worldSignal}
          onVerified={handleWorldVerified}
        />
      ) : null}
      {variant === "modal" ? null : (
        <div className="relative w-full shrink-0 pb-[20px] z-10">
          <div className="flex min-w-0 flex-1 items-start gap-2 pr-10">
            {step > 1 && (
              <button
                type="button"
                onClick={goBackOneStep}
                className="-ml-1.5 -mt-[4px] shrink-0 bg-transparent p-0 text-[var(--color-text-primary)] outline-none hover:bg-transparent focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/25"
                aria-label="Back"
              >
                <ChevronIcon className="h-5 w-5" />
              </button>
            )}
            <div className="flex min-w-0 flex-col gap-2 pt-[1px]">
              <h1 className="text-lg font-semibold leading-none text-[var(--color-text-primary)]">{stepHeading}</h1>
              <p
                className={cn(
                  "whitespace-nowrap text-[13px] font-medium leading-none text-[var(--color-text-muted)]",
                  step > 1 ? "pointer-events-none select-none opacity-0" : "",
                )}
              >
                Top up your card with crypto.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={cn(
              "absolute right-0 top-0 z-[1] flex h-8 w-8 items-center justify-center rounded-[10px] p-1.5 text-[var(--color-text-muted)] outline-none",
              "transition-[color,background-color] duration-200 ease-out",
              "hover:bg-white/5 hover:text-[var(--color-text-primary)]",
              "focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/25",
            )}
            aria-label="Close"
          >
            <XIcon className="h-full w-full shrink-0" strokeWidth={2} aria-hidden />
          </button>
        </div>
      )}

      <div className="flex-1 w-full overflow-visible relative">
        <AnimatePresence mode="wait" initial={false}>
          {step === 1 && (
            <motion.div
              key="step1-container"
              className="h-full"
              {...(variant === "modal"
                ? {
                    variants: modalStepSlideVariants,
                    initial: "initial" as const,
                    animate: "animate" as const,
                    exit: "exit" as const,
                  }
                : {
                    initial: stepPresenceMotion.initial,
                    animate: stepPresenceMotion.animate,
                    exit: stepPresenceMotion.exit,
                    transition: stepPresenceMotion.transition,
                  })}
            >
              <ReloadOverview amountFieldAnchorRef={amountFieldAnchorRef} pickerTriggersRef={pickerTriggersRef} onReloadClick={handleReloadClick} onOpenToken={handleOpenToken} onOpenChain={handleOpenChain} selectedToken={selectedToken} selectedChain={selectedChain} amount={amount} setAmount={handleSetAmount} worldVerified={worldVerified} worldIdEnabled={worldIdEnabled} verifiedSwapMode={verifiedSwapMode} />
            </motion.div>
          )}
          {step === 2 && (
            <motion.div
              key="step2-container"
              className="h-full"
              {...(variant === "modal"
                ? {
                    variants: modalStepSlideVariants,
                    initial: "initial" as const,
                    animate: "animate" as const,
                    exit: "exit" as const,
                  }
                : {
                    initial: stepPresenceMotion.initial,
                    animate: stepPresenceMotion.animate,
                    exit: stepPresenceMotion.exit,
                    transition: stepPresenceMotion.transition,
                  })}
            >
              {verifiedSwapMode ? (
                <ReloadSwapFunds amount={amount} onSuccess={handleSwapSuccess} />
              ) : (
                <SendFunds
                  onNext={handleNextStep3}
                  selectedToken={selectedToken}
                  selectedChain={selectedChain}
                  amount={amount}
                  userDepositAddress={userDepositAddress}
                  depositAddressesReady={depositAddressesReady}
                />
              )}
            </motion.div>
          )}
          {step === 3 && (
            <motion.div
              key="step3-progress"
              className="h-full"
              {...(variant === "modal"
                ? {
                    variants: modalStepSlideVariants,
                    initial: "initial" as const,
                    animate: "animate" as const,
                    exit: "exit" as const,
                  }
                : {
                    initial: stepPresenceMotion.initial,
                    animate: stepPresenceMotion.animate,
                    exit: stepPresenceMotion.exit,
                    transition: stepPresenceMotion.transition,
                  })}
            >
              <ReloadProgressScreen onClose={onClose} onBack={handleBackToStep2} selectedToken={selectedToken} isError={isError} />
            </motion.div>
          )}
          {/* Step 4: when backend confirms the deposit while this modal is open, call setStep(4). Est. time on step 3 is display-only. */}
          {step === 4 && (
            <motion.div
              key="step4-success"
              className="h-full"
              {...(variant === "modal"
                ? {
                    variants: modalStepSlideVariants,
                    initial: "initial" as const,
                    animate: "animate" as const,
                    exit: "exit" as const,
                  }
                : {
                    initial: stepPresenceMotion.initial,
                    animate: stepPresenceMotion.animate,
                    exit: stepPresenceMotion.exit,
                    transition: stepPresenceMotion.transition,
                  })}
            >
              <ReloadSuccessScreen onClose={onClose} selectedToken={selectedToken} txHash={swapTxHash} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {variant === "modal" && hideProgressDots ? null : (
        <div className="flex justify-center gap-[6px] pt-6 shrink-0 z-0 w-full mt-auto">
          {[1, 2, 3].map((s) => (
            <div key={s} className={cn("w-2 h-2 rounded-full transition-all duration-300", step === s || (s === 3 && step === 4) ? "bg-[var(--color-progress-active)] w-4" : "bg-[var(--color-progress-inactive)]")} />
          ))}
        </div>
      )}

      {isPanePicker ? (
        isPickerOpen ? (
          <div
            ref={pickerPanelRef}
            style={{
              position: "absolute",
              top: pickerOverlayTopPx,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 9999,
            }}
            className={cn(
              "flex w-full min-w-0 flex-col overflow-hidden bg-[var(--color-bg-picker-panel)]",
              "rounded-[var(--radius-md)] border-0 shadow-none outline-none ring-0",
            )}
          >
            <div className="flex w-full min-w-0 shrink-0 flex-row items-center gap-3 p-[16px]">
              <span className="shrink-0 text-[15px] font-bold tracking-tight text-[var(--color-text-primary)]">
                {isChainOpen ? "Select Chain" : "Select Token"}
              </span>
              <div
                className={cn(
                  "relative ml-auto h-8 w-[176px] shrink-0 transition-opacity duration-150",
                  !isChainOpen && "pointer-events-none opacity-0",
                )}
              >
                <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-text-muted)] opacity-70" />
                <input
                  type="search"
                  placeholder="Search chains..."
                  value={chainSearch}
                  onChange={(e) => setChainSearch(e.target.value)}
                  disabled={!isChainOpen}
                  tabIndex={isChainOpen ? 0 : -1}
                  className="h-8 w-full rounded-[var(--radius-sm)] border border-transparent bg-white/[0.04] pl-8 pr-2 text-[12px] outline-none ring-0 transition-colors placeholder:text-[var(--color-text-muted)] placeholder:opacity-70 focus:border-white/10 focus:outline-none focus:ring-0 focus-visible:border-white/10 dark:border-transparent dark:bg-white/[0.04] dark:focus:border-white/10"
                  aria-label="Search chains"
                />
              </div>
            </div>
            <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden px-[16px] pb-[16px] pt-0 outline-none">
              {pickerView === "token" ? (
                  <div className="flex min-h-0 flex-1 flex-col">
                    <div className="grid min-h-0 flex-1 w-full min-w-0 grid-cols-3 gap-3 grid-rows-[minmax(0,1fr)]">
                      {[0, 1, 2].map((i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => {
                            setSelectedToken(i === 0 ? "USDC" : i === 1 ? TETHER_TOKEN : DAI_TOKEN);
                            setPickerView(null);
                          }}
                          className="relative overflow-hidden group/btn w-full min-h-0 h-full rounded-[var(--radius-md)] bg-white/[0.04] flex flex-col items-center justify-center gap-2.5 transition-all duration-300 outline-none hover:bg-white/[0.05]"
                        >
                          <div className="absolute inset-x-0 bottom-0 h-[45%] bg-[radial-gradient(50%_100%_at_50%_100%,var(--color-glass-highlight)_0%,transparent_100%)] opacity-0 group-hover/btn:opacity-100 transition-opacity pointer-events-none" />
                          <div className="relative z-10 h-[32.4px] w-[32.4px] overflow-hidden rounded-full flex items-center justify-center border-0 bg-transparent">
                            {i === 0 ? (
                              <img src={USDC_ICON_SRC} alt="USDC" width={32} height={32} className="h-full w-full object-cover" draggable={false} />
                            ) : i === 1 ? (
                              <img src={TETHER_ICON_SRC} alt="" width={32} height={32} className="h-full w-full object-cover" draggable={false} />
                            ) : (
                              <img src={DAI_ICON_SRC} alt="" width={32} height={32} className="h-full w-full object-contain" draggable={false} />
                            )}
                          </div>
                          <span className="relative z-10 text-[11.5px] font-semibold text-[var(--color-text-muted)] text-center leading-tight">
                            {i === 0 ? "USDC" : i === 1 ? TETHER_TOKEN : DAI_TOKEN}
                          </span>
                        </button>
                      ))}
                    </div>
                    <div
                      className="mt-[16px] flex h-[50px] w-full shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-white/[0.04] px-[16px]"
                      role="status"
                      aria-live="polite"
                    >
                      <span className="text-[11.5px] font-semibold text-[var(--color-text-muted)] text-center leading-tight">
                        More Tokens Coming Soon
                      </span>
                    </div>
                  </div>
                ) : (
                  <div
                    ref={pickerScrollBodyRef}
                    className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden overscroll-contain scrollbar-hide"
                    onScroll={(e) => updateChainScrollEdgeMask(e.currentTarget)}
                    style={
                      chainScrollEdgeMask.active
                        ? {
                            maskImage: chainPickerScrollMaskImage,
                            WebkitMaskImage: chainPickerScrollMaskImage,
                          }
                        : undefined
                    }
                  >
                    {isSplitChainPicker ? (
                      <>
                        <div className={cn("grid w-full min-w-0 grid-cols-3", splitChainPickerGap)}>
                          {reloadActiveChains.map((chain) =>
                            renderChainPickerTile(chain, { tileSize: splitChainTileSize }),
                          )}
                        </div>
                        {reloadComingSoonChains.length > 0 ? (
                          <>
                            <div
                              className="mt-[16px] flex h-[50px] w-full shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-white/[0.04] px-[16px]"
                              role="status"
                              aria-live="polite"
                            >
                              <span className="text-[11.5px] font-semibold text-[var(--color-text-muted)] text-center leading-tight">
                                Coming Soon
                              </span>
                            </div>
                            <div className={cn("mt-[16px] grid w-full min-w-0 grid-cols-3", splitChainPickerGap)}>
                              {reloadComingSoonChains.map((chain) =>
                                renderChainPickerTile(chain, { disabled: true, tileSize: splitChainTileSize }),
                              )}
                            </div>
                          </>
                        ) : null}
                      </>
                    ) : (
                      <div className={cn("grid w-full min-w-0 grid-cols-3", splitChainPickerGap)}>
                        {chainPickerFiltered.map((chain) => renderChainPickerTile(chain))}
                      </div>
                    )}
                  </div>
                )}
            </div>
          </div>
        ) : null
      ) : (
        <AnimatePresence>
          {isPickerOpen ? (
            <motion.div
              ref={pickerPanelRef}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{
                duration: 0.25,
                delay: 0,
                ease: [0.45, 0, 0.55, 1],
              }}
              style={{
                position: "absolute",
                top: pickerOverlayTopPx,
                left: 0,
                right: 0,
                bottom: variant === "modal" && hideProgressDots ? -modalPickerBottomExtendPx : 0,
                zIndex: 9999,
              }}
              className={cn(
                "flex w-full min-w-0 flex-col overflow-hidden bg-[var(--color-bg-picker-panel)]",
                "rounded-t-[var(--radius-md)] rounded-b-[var(--radius-xl)] border border-[var(--color-border-primary)] shadow-2xl",
                variant === "modal" && hideProgressDots && "shadow-none",
              )}
            >
              <div className="flex w-full min-w-0 shrink-0 flex-row items-center gap-3 p-[16px]">
                <span className="shrink-0 text-[15px] font-bold tracking-tight text-[var(--color-text-primary)]">
                  {isChainOpen ? "Select Chain" : "Select Token"}
                </span>
                {isChainOpen ? (
                  <>
                    <div className="min-w-0 flex-1" aria-hidden="true" />
                    <div className="flex shrink-0 items-center gap-3">
                      <div className="relative min-w-0 w-[176px] max-w-[min(176px,calc(100vw-10rem))]">
                        <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-text-muted)] opacity-70" />
                        <Input
                          placeholder="Search chains..."
                          value={chainSearch}
                          onChange={(e) => setChainSearch(e.target.value)}
                          size="sm"
                          className="border border-transparent bg-white/[0.04] pl-8 pr-2 text-[12px] outline-none ring-0 transition-colors placeholder:text-[var(--color-text-muted)] placeholder:opacity-70 focus:border-white/10 focus:outline-none focus:ring-0 focus-visible:border-white/10 dark:border-transparent dark:bg-white/[0.04] dark:focus:border-white/10"
                          aria-label="Search chains"
                        />
                      </div>
                      <button onClick={closePickers} type="button" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-white/[0.04] text-[var(--color-text-muted)] transition-colors outline-none hover:bg-white/[0.05] hover:text-[var(--color-text-primary)]">
                        <XIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </>
                ) : (
                  <button onClick={closePickers} type="button" className="ml-auto inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-white/[0.04] text-[var(--color-text-muted)] transition-colors outline-none hover:bg-white/[0.05] hover:text-[var(--color-text-primary)]">
                    <XIcon className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div
                ref={pickerView === "chain" ? pickerScrollBodyRef : undefined}
                className={cn(
                  "relative flex w-full min-h-0 flex-col px-[16px] pb-[16px] pt-0 outline-none",
                  pickerView === "token"
                    ? "min-h-0 shrink-0 flex-none overflow-hidden"
                    : "min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain scrollbar-autohide",
                )}
                onScroll={pickerView === "chain" ? (e) => updateChainScrollEdgeMask(e.currentTarget) : undefined}
                style={
                  pickerView === "chain" && chainScrollEdgeMask.active
                    ? {
                        maskImage: chainPickerScrollMaskImage,
                        WebkitMaskImage: chainPickerScrollMaskImage,
                      }
                    : undefined
                }
              >
                {pickerView === "token" && (
                  <div>
                    <div className="grid w-full min-w-0 grid-cols-3 gap-[16px]">
                      {[0, 1, 2].map((i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => {
                            setSelectedToken(i === 0 ? "USDC" : i === 1 ? TETHER_TOKEN : DAI_TOKEN);
                            setPickerView(null);
                          }}
                          className="relative overflow-hidden group/btn w-full min-h-0 rounded-[var(--radius-md)] bg-white/[0.04] aspect-[5/4] flex flex-col items-center justify-center gap-2.5 transition-all duration-300 outline-none hover:bg-white/[0.05]"
                        >
                          <div className="absolute inset-x-0 bottom-0 h-[45%] bg-[radial-gradient(50%_100%_at_50%_100%,var(--color-glass-highlight)_0%,transparent_100%)] opacity-0 group-hover/btn:opacity-100 transition-opacity pointer-events-none" />
                          <div className="relative z-10 h-[32.4px] w-[32.4px] overflow-hidden rounded-full flex items-center justify-center border-0 bg-transparent">
                            {i === 0 ? (
                              <img src={USDC_ICON_SRC} alt="USDC" width={32} height={32} className="h-full w-full object-cover" draggable={false} />
                            ) : i === 1 ? (
                              <img src={TETHER_ICON_SRC} alt="" width={32} height={32} className="h-full w-full object-cover" draggable={false} />
                            ) : (
                              <img src={DAI_ICON_SRC} alt="" width={32} height={32} className="h-full w-full object-contain" draggable={false} />
                            )}
                          </div>
                          <span className="relative z-10 text-[11.5px] font-semibold text-[var(--color-text-muted)] text-center leading-tight">
                            {i === 0 ? "USDC" : i === 1 ? TETHER_TOKEN : DAI_TOKEN}
                          </span>
                        </button>
                      ))}
                    </div>
                    <div
                      className="mt-[16px] flex h-[50px] w-full shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-white/[0.04] px-[16px]"
                      role="status"
                      aria-live="polite"
                    >
                      <span className="text-[11.5px] font-semibold text-[var(--color-text-muted)] text-center leading-tight">
                        More Tokens Coming Soon
                      </span>
                    </div>
                  </div>
                )}
                {pickerView === "chain" && (
                  <div className={cn("w-full min-w-0", isSplitChainPicker ? "flex flex-col" : "grid grid-cols-4 gap-[16px]")}>
                    {isSplitChainPicker ? (
                      <>
                        <div className="grid w-full min-w-0 grid-cols-3 gap-[16px]">
                          {reloadActiveChains.map((chain) =>
                            renderChainPickerTile(chain, { tileSize: "homeModal" }),
                          )}
                        </div>
                        {reloadComingSoonChains.length > 0 ? (
                          <>
                            <div
                              className="mt-[16px] flex h-[50px] w-full shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-white/[0.04] px-[16px]"
                              role="status"
                              aria-live="polite"
                            >
                              <span className="text-[11.5px] font-semibold text-[var(--color-text-muted)] text-center leading-tight">
                                Coming Soon
                              </span>
                            </div>
                            <div className="mt-[16px] grid w-full min-w-0 grid-cols-3 gap-[16px]">
                              {reloadComingSoonChains.map((chain) =>
                                renderChainPickerTile(chain, { disabled: true, tileSize: "homeModal" }),
                              )}
                            </div>
                          </>
                        ) : null}
                      </>
                    ) : (
                      chainPickerFiltered.map((chain) => renderChainPickerTile(chain))
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      )}
    </div>

  );
});

export default ReloadFlow;
