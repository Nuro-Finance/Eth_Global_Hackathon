"use client";

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState, forwardRef, useImperativeHandle } from "react";
import { useAppSession } from "@/hooks/useAppSession";
import { motion, AnimatePresence } from "framer-motion";
import { X, Copy, Check, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";
import { ReloadFlowTokenHero, reloadFlowHeroStyles } from "./ReloadFlow";
import { DESIGN_MOCK_WITHDRAW } from "@/config/design-mode";
import { emitDashboardInFlightOperation } from "@/lib/dashboardInFlightOperation";
import { useFitMonospaceAddressRow } from "./useFitMonospaceAddressRow";

/** Design sessions: step 2 → success without backend withdraw/ledger APIs. */
const DEMO_WITHDRAW_COMPLETE_MS = 4_000;

const USDC_ICON_SRC = "/assets/images/icons/usdc.svg";
const TETHER_ICON_SRC = "/assets/images/icons/tether.svg";

const TETHER_TOKEN = "Tether";

/** Same success illustration as wallet send-complete (`public/Success_Square.svg`). */
const FLOW_SUCCESS_ILLUSTRATION_SRC = "/Success_Square.svg";

type WithdrawStep1Token = "USDC" | typeof TETHER_TOKEN;

/** Placeholder - replace with wallet from session / signup when wired. */
const SIGNUP_WALLET_ADDRESS = "0x34e81c59BB1487E599B4857D7A32490F11C8";

const XIcon = X;
const ChevronIcon = ChevronLeft;

/** Shared footer CTA - same placement on every withdraw step (above pagination). */
const WITHDRAW_FOOTER_BUTTON_CLASS = cn(
  "inline-flex h-12 w-full items-center justify-center rounded-[14px] border-none text-sm font-bold transition-[color,background-color,opacity,box-shadow] duration-200 ease-out",
  "bg-[var(--color-reload-button-bg)] text-white hover:bg-[var(--color-reload-button-bg)]/90",
  "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-30",
);

const WITHDRAW_PAGINATION_CLASS = "flex w-full shrink-0 justify-center gap-[6px] pt-3";
/** 16px between step body (amount row on step 1) and shared footer CTA - all steps. */
const WITHDRAW_FOOTER_TOP_GAP = "mt-4";

/** Caret + H1 move as one unit; caret sits left of H1 (no layout slot on page 1). Same as `ReloadModal`. */
const HEADER_SHIFT_X = 40;
const headerCaretTransition = { duration: 0.4, ease: [0.33, 1, 0.68, 1] as const };

function withdrawTokenCTALabel(selectedToken: string) {
  if (selectedToken === TETHER_TOKEN) return "USDT";
  return selectedToken;
}

/** Selected USDC/USDT - 1px rim + inset glow geometry matches header ConnectWallet (tight spread). */
const TOKEN_SELECTED_INSET_HALO =
  "shadow-[inset_0_0_10px_1px_rgba(255,255,255,0.32)]";

function tokenPickerButtonClass(active: boolean) {
  return cn(
    "h-12 flex items-center justify-center gap-2 rounded-[12px] text-[var(--color-text-primary)] outline-none transition-[border-color,box-shadow,background-color] duration-200 ease-out",
    "border border-solid",
    active
      ? cn(
          "border-[1px] border-white/70 bg-[var(--color-bg-input-hover)]",
          TOKEN_SELECTED_INSET_HALO,
          "hover:bg-[var(--color-bg-input-hover)]",
        )
      : cn(
          "border-[var(--color-border-deposit-input)] bg-[var(--color-bg-deposit-input)]",
          "hover:border-[var(--color-border-input-hover)] hover:bg-[var(--color-bg-input-hover)]",
        ),
  );
}

function WithdrawStep1({
  selectedToken,
  setSelectedToken,
  amount,
  setAmount,
  withdrawAddress,
  setWithdrawAddress,
  usingSignupAddress,
  setUsingSignupAddress,
  variant = "default",
  footerAction,
}: {
  selectedToken: WithdrawStep1Token;
  setSelectedToken: (t: WithdrawStep1Token) => void;
  amount: string;
  setAmount: (v: string) => void;
  withdrawAddress: string;
  setWithdrawAddress: (v: string) => void;
  usingSignupAddress: boolean;
  setUsingSignupAddress: (v: boolean) => void;
  variant?: "default" | "modal";
 /** Modal: primary CTA lives inside the step column (same as `ReloadOverview`). */
  footerAction?: React.ReactNode;
}) {
  const isModal = variant === "modal";
  const displayAddress = usingSignupAddress ? SIGNUP_WALLET_ADDRESS : withdrawAddress;
  const [addressCopied, setAddressCopied] = useState(false);

  useEffect(() => {
    setAddressCopied(false);
  }, [usingSignupAddress, displayAddress]);

  const copyDisplayAddressToClipboard = useCallback(() => {
    if (!displayAddress) return;
    navigator.clipboard.writeText(displayAddress);
    setAddressCopied(true);
    window.setTimeout(() => setAddressCopied(false), 2000);
  }, [displayAddress]);

  const handleCopySignupAddress = (e: React.MouseEvent) => {
    e.stopPropagation();
    copyDisplayAddressToClipboard();
  };

  const handleUseAnotherAddress = useCallback(() => {
    setUsingSignupAddress(false);
    if (usingSignupAddress) {
      setWithdrawAddress("");
    }
  }, [setUsingSignupAddress, setWithdrawAddress, usingSignupAddress]);

  const handleBackToSignupAddress = useCallback(() => {
    setUsingSignupAddress(true);
    setWithdrawAddress("");
  }, [setUsingSignupAddress, setWithdrawAddress]);

  const {
    addressRowRef,
    addressTextCellRef,
    addressTextRef,
    addressFontPx,
    addressRowGridStyle,
  } = useFitMonospaceAddressRow(displayAddress || "-");

  const addressRow = (
    <div className="h-14 w-full shrink-0 box-border">
      {usingSignupAddress ? (
        <div
          ref={addressRowRef}
          role="button"
          tabIndex={0}
          onClick={displayAddress ? handleCopySignupAddress : undefined}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              copyDisplayAddressToClipboard();
            }
          }}
          className={cn(
            "relative grid h-14 w-full min-w-0 items-center rounded-[12px] border border-[var(--color-border-deposit-input)] bg-[var(--color-bg-deposit-input)] pl-5 pr-[12px] transition-all outline-none",
            displayAddress && "cursor-pointer hover:border-[var(--color-border-input-hover)] hover:bg-[var(--color-bg-input-hover)]",
            "focus-visible:ring-2 focus-visible:ring-[var(--color-border-input-hover)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg-primary)]",
          )}
          style={addressRowGridStyle}
        >
          <div ref={addressTextCellRef} className="relative z-0 flex min-w-0 items-center overflow-visible">
            <span
              ref={addressTextRef}
              className="inline-block select-all font-mono whitespace-nowrap leading-none text-[var(--color-text-muted)]"
              style={{ fontSize: `${addressFontPx}px` }}
            >
              {displayAddress}
            </span>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              copyDisplayAddressToClipboard();
            }}
            disabled={!displayAddress}
            className={cn(
              "relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border transition-colors",
              "border-white/12 bg-white/[0.04] text-[var(--color-text-muted)] opacity-70",
              "hover:border-white/20 hover:bg-white/10 hover:text-[var(--color-text-primary)] hover:opacity-100",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/30",
              !displayAddress && "pointer-events-none opacity-40",
            )}
            aria-label="Copy withdraw address"
          >
            <AnimatePresence mode="wait">
              {addressCopied ? (
                <motion.div key="check" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }} transition={{ duration: 0.15 }}>
                  <Check className="h-4 w-4" strokeWidth={2.5} />
                </motion.div>
              ) : (
                <motion.div key="copy" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }} transition={{ duration: 0.15 }}>
                  <Copy className="h-4 w-4" strokeWidth={2.5} />
                </motion.div>
              )}
            </AnimatePresence>
          </button>
        </div>
      ) : (
        <input
          type="text"
          value={withdrawAddress}
          onChange={(e) => setWithdrawAddress(e.target.value.trim())}
          placeholder="0x…"
          autoComplete="off"
          spellCheck={false}
          className="h-14 w-full box-border px-4 bg-[var(--color-bg-deposit-input)] border border-[var(--color-border-deposit-input)] rounded-[12px] text-sm font-mono text-[var(--color-text-primary)] placeholder:text-[var(--color-text-placeholder)] outline-none focus:border-[var(--color-border-input-hover)] transition-all"
        />
      )}
    </div>
  );

  const withdrawAddressBlock = (
    <div className="flex w-full shrink-0 flex-col gap-2">
      <div className="flex min-h-0 w-full items-center justify-between gap-3">
        <span
          className={cn(
            "font-semibold leading-snug text-[var(--color-text-primary)]",
            isModal ? "text-[13px]" : "text-xs",
          )}
        >
          Your Withdraw Address
        </span>
        {usingSignupAddress ? (
          <button
            type="button"
            onClick={handleUseAnotherAddress}
            className="shrink-0 text-xs font-semibold leading-none text-[var(--color-primary)] transition-colors outline-none hover:text-[var(--color-primary)]/85"
          >
            Change
          </button>
        ) : (
          <button
            type="button"
            onClick={handleBackToSignupAddress}
            className="shrink-0 text-xs font-semibold leading-none text-[var(--color-text-muted)] transition-colors outline-none hover:text-[var(--color-text-primary)]"
          >
            Use signup address
          </button>
        )}
      </div>
      {addressRow}
    </div>
  );

  const amountField = (
    <div className="relative w-full shrink-0">
      <div className="relative group w-full">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] text-sm font-medium z-10 opacity-60">Amount:</span>
        <Input
          value={amount}
          onChange={(e) => {
            const val = e.target.value.replace(/[^0-9.]/g, "");
            if ((val.match(/\./g) || []).length <= 1) {
              setAmount(val);
            }
          }}
          placeholder="0"
          className="h-14 w-full pl-20 pr-16 bg-[var(--color-bg-deposit-input)] border border-[var(--color-border-deposit-input)] rounded-[12px] text-lg font-bold text-[var(--color-text-primary)] outline-none focus:!border-[var(--color-border-input-hover)] transition-all text-right"
        />
        <span
          className={cn(
            "absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold z-10",
            amount && !Number.isNaN(Number(amount)) ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-dimmed)]",
          )}
        >
          {withdrawTokenCTALabel(selectedToken)}
        </span>
      </div>
    </div>
  );

  const tokenBlock = (
    <div className={cn("flex shrink-0 flex-col", isModal ? "gap-2" : "gap-4")}>
      <span
        className={cn(
          "font-semibold leading-snug text-[var(--color-text-primary)]",
          isModal ? "text-[13px]" : "text-xs",
        )}
      >
        {withdrawTokenCTALabel(selectedToken)} on Base
      </span>
      <div className={cn("grid grid-cols-2", isModal ? "gap-4" : "gap-3")}>
        <button
          type="button"
          aria-pressed={selectedToken === "USDC"}
          onClick={() => setSelectedToken("USDC")}
          className={tokenPickerButtonClass(selectedToken === "USDC")}
        >
          <div className="w-5 h-5 shrink-0 rounded-full overflow-hidden">
            <img src={USDC_ICON_SRC} alt="" width={20} height={20} className="h-full w-full object-cover" draggable={false} />
          </div>
          <span className="text-sm font-semibold">USDC</span>
        </button>
        <button
          type="button"
          aria-pressed={selectedToken === TETHER_TOKEN}
          onClick={() => setSelectedToken(TETHER_TOKEN)}
          className={tokenPickerButtonClass(selectedToken === TETHER_TOKEN)}
        >
          <div className="w-5 h-5 shrink-0 rounded-full overflow-hidden">
            <img src={TETHER_ICON_SRC} alt="" width={20} height={20} className="h-full w-full object-cover" draggable={false} />
          </div>
          <span className="text-sm font-semibold">USDT</span>
        </button>
      </div>
    </div>
  );

  const step1StackClass = cn(
    "flex w-full flex-col",
    isModal ? "h-full min-h-0 gap-4" : "gap-4",
  );

  return (
    <div className={step1StackClass}>
      {isModal ? (
        <>
          <div className="min-h-0 flex-1" aria-hidden />
          <div className="flex shrink-0 flex-col gap-4">
            {withdrawAddressBlock}
            {tokenBlock}
            {amountField}
          </div>
          <div className="min-h-0 flex-1" aria-hidden />
        </>
      ) : (
        <div className="flex flex-col gap-4">
          {withdrawAddressBlock}
          {tokenBlock}
          {amountField}
        </div>
      )}
      {footerAction ? <div className="relative w-full shrink-0 shadow-2xl">{footerAction}</div> : null}
    </div>
  );
}

/** Reserved space for the pinned footer CTA (h-12) - matches `ReloadProgressScreen` `bottom-[88px]`. */
const WITHDRAW_STATUS_FOOTER_RESERVE_PX = 88;

/** Step 2 - token hero + copy; footer CTA pinned like `ReloadProgressScreen`. */
const WithdrawProgressScreen = ({
  selectedToken,
  isError,
  footerAction,
}: {
  selectedToken: string;
  isError: boolean;
  footerAction?: React.ReactNode;
}) => (
  <div className="relative flex h-full min-h-0 w-full flex-col">
    <style>{reloadFlowHeroStyles}</style>
    <div
      className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col items-center justify-center"
      style={{ bottom: footerAction ? WITHDRAW_STATUS_FOOTER_RESERVE_PX : 0 }}
    >
      <div className="flex flex-col items-center text-center">
        <ReloadFlowTokenHero
          selectedToken={selectedToken}
          pulse
          tone={isError ? "error" : "default"}
          className="mb-0"
        />
        <div className="relative top-[15px] flex flex-col items-center">
          <h2 className="mb-3 text-[20px] font-bold leading-none tracking-tight text-[var(--color-text-primary)]">
            {isError ? "Withdraw Failed" : "Withdraw In Progress"}
          </h2>
          <p className="text-[13px] font-medium leading-[1.6] text-[var(--color-text-muted)]">
            {isError ? (
              <>
                Try going back a step and
                <br />
                check your connection.
              </>
            ) : (
              <>
                You can close this window.
                <br />
                {`We're sending your funds`}
              </>
            )}
          </p>
          <p
            className={cn(
              "mt-6 text-[11px] font-bold uppercase tracking-wide text-[var(--color-text-dimmed)]",
              isError && "invisible",
            )}
          >
            Est time ~5-10 minutes
          </p>
        </div>
      </div>
    </div>
    {footerAction ? (
      <div className="relative z-20 mt-auto w-full shrink-0 shadow-2xl">{footerAction}</div>
    ) : null}
  </div>
);

/** Step 3 - success; same column + footer slot as other steps. */
const WithdrawSuccessScreen = ({ footerAction }: { footerAction?: React.ReactNode }) => (
  <div className="flex h-full min-h-0 w-full flex-col">
    <div className="flex min-h-0 flex-1 items-center justify-center">
      <div className="flex flex-col items-center text-center">
        <motion.img
          src={FLOW_SUCCESS_ILLUSTRATION_SRC}
          alt=""
          width={82}
          height={82}
          initial={{ scale: 0.94, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 24 }}
          className="h-[82px] w-[82px] shrink-0 object-contain"
        />
        <div className="mt-4 flex flex-col items-center">
          <h2 className="mb-3 text-[20px] font-bold leading-none tracking-tight text-[var(--color-text-primary)]">
            Withdraw Complete
          </h2>
          <p className="text-[13px] font-medium leading-[1.6] text-[var(--color-text-muted)]">
            Your withdrawal was successful.
            <br />
            This window will close automatically.
          </p>
        </div>
      </div>
    </div>
    {footerAction ? <div className="w-full shrink-0 shadow-2xl">{footerAction}</div> : null}
  </div>
);

type WithdrawFlowProps = {
  onNext?: () => void;
  onBack: () => void;
  onClose: () => void;
 /** Shell matches `ReloadModal` when `modal`. */
  variant?: "default" | "modal";
 /** Modal shell renders its own pagination row. */
  hideProgressDots?: boolean;
  paginationStripRef?: React.RefObject<HTMLDivElement | null>;
  onStepChange?: (step: number, meta?: { isError?: boolean }) => void;
};

export type WithdrawFlowHandle = { goBack: () => void };

export const WithdrawFlow = forwardRef<WithdrawFlowHandle, WithdrawFlowProps>(function WithdrawFlow(
  {
    onClose,
    variant = "default",
    hideProgressDots = false,
    paginationStripRef: _paginationStripRef,
    onStepChange,
  },
  ref,
) {
  const [step, setStep] = useState(1);
  const [selectedToken, setSelectedToken] = useState<WithdrawStep1Token>("USDC");
  const [amount, setAmount] = useState("");
  const [usingSignupAddress, setUsingSignupAddress] = useState(true);
  const [customWithdrawAddress, setCustomWithdrawAddress] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [withdrawSubmitError, setWithdrawSubmitError] = useState(false);
 /** After POST succeeds, poll `/api/card-transactions` for a new `withdrawal` row (same idea as reload step 3). */
  const [withdrawLedgerWatch, setWithdrawLedgerWatch] = useState(false);
  const withdrawLedgerBaselineMsRef = useRef<number | null>(null);
  const withdrawLedgerMatchedRef = useRef(false);
  const withdrawFlowRootRef = useRef<HTMLDivElement>(null);
  const [paneLockedHeightPx, setPaneLockedHeightPx] = useState<number | null>(null);
  const [autoCloseCountdown, setAutoCloseCountdown] = useState(5);
  const { data: session } = useAppSession();

  const isModalShell = variant === "modal" && hideProgressDots;

  useLayoutEffect(() => {
    if (isModalShell || step !== 1) return;
    const el = withdrawFlowRootRef.current;
    if (!el) return;
    const h = Math.ceil(el.getBoundingClientRect().height);
    setPaneLockedHeightPx((prev) => (prev == null || h > prev ? h : prev));
  }, [isModalShell, step, amount, selectedToken, usingSignupAddress, customWithdrawAddress]);

  const goBackOneStep = useCallback(() => {
    setStep((s) => {
      if (s <= 1) return 1;
      if (s === 2) setWithdrawSubmitError(false);
      if (s === 3) {
        withdrawLedgerMatchedRef.current = false;
        withdrawLedgerBaselineMsRef.current = null;
      }
      return s - 1;
    });
  }, []);

  useImperativeHandle(ref, () => ({ goBack: goBackOneStep }), [goBackOneStep]);

  useEffect(() => {
    onStepChange?.(step, { isError: withdrawSubmitError });
  }, [step, withdrawSubmitError, onStepChange]);

  useEffect(() => {
    if (step === 1) {
      setWithdrawLedgerWatch(false);
      setWithdrawSubmitError(false);
    }
    if (step !== 3) {
      setAutoCloseCountdown(5);
    }
  }, [step]);

  useEffect(() => {
    if (step !== 3) return;
    if (autoCloseCountdown === 0) {
      onClose();
      return;
    }
    const timer = window.setTimeout(() => {
      setAutoCloseCountdown((prev) => prev - 1);
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [step, autoCloseCountdown, onClose]);

  useEffect(() => {
    if (step !== 2 || !withdrawLedgerWatch) {
      if (step !== 2) {
        withdrawLedgerMatchedRef.current = false;
        withdrawLedgerBaselineMsRef.current = null;
      }
      return;
    }
    if (withdrawLedgerMatchedRef.current) return;
    if (withdrawLedgerBaselineMsRef.current === null) {
      withdrawLedgerBaselineMsRef.current = Date.now();
    }
    const token = (session as { accessToken?: string } | null)?.accessToken;
    if (!token) return;
    let cancelled = false;
    const isWithdrawalRow = (typeRaw: unknown) => {
      const t = String(typeRaw ?? "").toLowerCase();
      return t === "withdrawal" || t === "withdraw" || t.includes("withdraw");
    };
    const tick = async () => {
      if (cancelled || withdrawLedgerMatchedRef.current) return;
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
        const baseline = withdrawLedgerBaselineMsRef.current ?? Date.now();
        for (const raw of rows) {
          const tx = raw as Record<string, unknown>;
          if (!isWithdrawalRow(tx.type)) continue;
          const rawDate = tx.date ?? tx.created_at ?? tx.createdAt;
          const dateMs = rawDate ? new Date(String(rawDate)).getTime() : 0;
          if (dateMs >= baseline - 8_000) {
            withdrawLedgerMatchedRef.current = true;
            emitDashboardInFlightOperation("withdraw");
            setStep(3);
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
  }, [step, withdrawLedgerWatch, session]);

  useEffect(() => {
    if (!DESIGN_MOCK_WITHDRAW || step !== 2 || withdrawSubmitError) return;
    const id = window.setTimeout(() => {
      withdrawLedgerMatchedRef.current = true;
      setStep(3);
    }, DEMO_WITHDRAW_COMPLETE_MS);
    return () => window.clearTimeout(id);
  }, [step, withdrawSubmitError]);

  const canProceedStep1 =
    Boolean(amount) &&
    !Number.isNaN(Number(amount)) &&
    Number(amount) > 0 &&
    (usingSignupAddress || /^0x[a-fA-F0-9]{40}$/.test(customWithdrawAddress.trim()));

  const handleWithdraw = async () => {
    if (!canProceedStep1) return;
    setWithdrawSubmitError(false);
    setWithdrawLedgerWatch(false);
    setStep(2);
    emitDashboardInFlightOperation("withdraw");
    if (DESIGN_MOCK_WITHDRAW) {
      setIsSubmitting(false);
      return;
    }
    setIsSubmitting(true);
    try {
      const addr = usingSignupAddress ? SIGNUP_WALLET_ADDRESS : customWithdrawAddress.trim();
      const tk = selectedToken === "Tether" ? "USDT" : selectedToken;
      const res = await fetch("/api/withdrawals", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.accessToken || ""}`,
        },
        body: JSON.stringify({
          destinationAddress: addr,
          amount: parseFloat(amount),
          token: tk,
        }),
      });
      if (!res.ok) {
        await res.json().catch(() => ({}));
        setWithdrawSubmitError(true);
        return;
      }
      setWithdrawLedgerWatch(true);
    } catch {
      setWithdrawSubmitError(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const stepHeading =
    step === 3 ? "Success" : step === 2 ? (withdrawSubmitError ? "Failed" : "Progress") : "Withdraw";

  const withdrawPrimaryLabel =
    amount && !Number.isNaN(Number(amount)) && Number(amount) > 0
      ? `Withdraw ${amount} ${withdrawTokenCTALabel(selectedToken)}`
      : "Withdraw";

  const step1FooterButton = (
    <button
      type="button"
      onClick={handleWithdraw}
      disabled={!canProceedStep1 || isSubmitting}
      className={cn(
        WITHDRAW_FOOTER_BUTTON_CLASS,
        !isModalShell && canProceedStep1 && !isSubmitting && "shadow-xl shadow-[var(--color-reload-button-bg)]/25",
        !isModalShell && (!canProceedStep1 || isSubmitting) && "shadow-none",
        isModalShell && canProceedStep1 && !isSubmitting && "shadow-xl shadow-[var(--color-reload-button-bg)]/25",
      )}
    >
      {withdrawPrimaryLabel}
    </button>
  );

  const closeFooterButton = (
    <button
      type="button"
      onClick={onClose}
      className={cn(WITHDRAW_FOOTER_BUTTON_CLASS, "shadow-xl shadow-[var(--color-reload-button-bg)]/20")}
    >
      Close
    </button>
  );

  const autoCloseFooterButton = (
    <Button
      type="button"
      onClick={onClose}
      className={cn(WITHDRAW_FOOTER_BUTTON_CLASS, "shadow-xl shadow-[var(--color-reload-button-bg)]/20 active:scale-[0.98]")}
    >
      Auto Close in {Math.max(autoCloseCountdown, 1)}
    </Button>
  );

  return (
    <div
      ref={withdrawFlowRootRef}
      className="relative flex h-full min-h-0 w-full flex-col"
      style={!isModalShell && paneLockedHeightPx != null ? { minHeight: paneLockedHeightPx } : undefined}
    >
      {variant !== "modal" && (
        <div className="relative w-full shrink-0 pb-[20px] z-10">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5 pr-10 text-start">
            <motion.div
              className="relative min-w-0"
              initial={false}
              animate={{ x: step > 1 ? HEADER_SHIFT_X : 0 }}
              transition={headerCaretTransition}
            >
              <motion.button
                type="button"
                onClick={goBackOneStep}
                disabled={step <= 1}
                tabIndex={step > 1 ? 0 : -1}
                initial={false}
                animate={{ opacity: step > 1 ? 1 : 0 }}
                transition={headerCaretTransition}
                className={cn(
                  "absolute left-0 top-1/2 z-10 -ml-2.5 flex size-8 -translate-x-full -translate-y-1/2 items-center justify-center rounded-none bg-transparent p-0 text-[var(--color-text-primary)] outline-none hover:bg-transparent focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/25",
                  step <= 1 && "pointer-events-none",
                )}
                aria-label="Back"
              >
                <ChevronIcon className="h-5 w-5" strokeWidth={2} />
              </motion.button>
              <h1 className="relative m-0 min-w-0 text-lg font-semibold leading-none tracking-tight text-[var(--color-text-primary)]">
                {stepHeading}
              </h1>
            </motion.div>
            <motion.p
              className="m-0 text-[13px] font-medium leading-snug text-[var(--color-text-muted)]"
              initial={false}
              animate={{ opacity: step === 1 ? 1 : 0 }}
              transition={headerCaretTransition}
              aria-hidden={step > 1}
              style={{ pointerEvents: step === 1 ? "auto" : "none" }}
            >
              Send funds to your wallet.
            </motion.p>
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

      <div className="relative min-h-0 flex-1 w-full overflow-visible">
        <AnimatePresence mode="wait" initial={false}>
          {step === 1 && (
            <motion.div
              key="withdraw-step1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className={cn(
                "flex w-full flex-col",
                isModalShell ? "absolute inset-0 min-h-0" : "h-full min-h-0",
              )}
            >
              <WithdrawStep1
                selectedToken={selectedToken}
                setSelectedToken={setSelectedToken}
                amount={amount}
                setAmount={setAmount}
                withdrawAddress={customWithdrawAddress}
                setWithdrawAddress={setCustomWithdrawAddress}
                usingSignupAddress={usingSignupAddress}
                setUsingSignupAddress={setUsingSignupAddress}
                variant={variant}
                footerAction={isModalShell ? step1FooterButton : undefined}
              />
            </motion.div>
          )}
          {step === 2 && (
            <motion.div
              key="withdraw-step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="absolute inset-0 flex min-h-0 w-full flex-col"
            >
              <WithdrawProgressScreen
                selectedToken={selectedToken}
                isError={withdrawSubmitError}
                footerAction={isModalShell ? closeFooterButton : undefined}
              />
            </motion.div>
          )}
          {step === 3 && (
            <motion.div
              key="withdraw-step3-success"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="absolute inset-0 flex h-full min-h-0 w-full flex-col"
            >
              <WithdrawSuccessScreen footerAction={isModalShell ? autoCloseFooterButton : undefined} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {!isModalShell && (
        <div className={cn("w-full shrink-0", WITHDRAW_FOOTER_TOP_GAP, "shadow-2xl")}>
          {step === 1 ? step1FooterButton : step === 2 ? closeFooterButton : autoCloseFooterButton}
        </div>
      )}

      {!hideProgressDots && (
        <div className={WITHDRAW_PAGINATION_CLASS}>
          {[1, 2].map((s) => (
            <div
              key={s}
              className={cn(
                "h-2 rounded-full transition-all duration-300",
                step === s || (s === 2 && step === 3) ? "w-4 bg-[var(--color-progress-active)]" : "w-2 bg-[var(--color-progress-inactive)]",
              )}
            />
          ))}
        </div>
      )}

    </div>
  );
});

export default WithdrawFlow;
