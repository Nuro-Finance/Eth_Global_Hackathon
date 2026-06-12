"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Info, Maximize2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { WalletQRModal } from "@/components/WalletQRModal";
import { getBlockExplorerAddressUrl } from "@/lib/blockExplorer";
import { cn } from "@/lib/utils";
import {
  DEMO_SEND_NETWORK_FEE_USD,
  NotEnoughBalanceInfoOverlay,
  ReceiveCryptoFirstPassBody,
  SendCryptoFirstPassBody,
  WalletPanelGasInline,
  formatSendEthDisplay,
  receiveShellBackButtonClass,
  receiveShellIconButtonClass,
  sendReceiveCascadeContainer,
  sendReceiveCascadeItem,
  truncateAddressMiddle,
  useWalletDisplayLabel,
  walletSwapShellMotion,
  type WalletRightShell,
} from "./WalletSendReceive5426";

function parsePositiveDecimalInput(raw: string): number {
  const normalized = raw.replace(/,/g, "").trim();
  if (!normalized) return 0;
  const n = Number.parseFloat(normalized);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function formatUsd(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

const DEMO_ETH_USD_PRICE = 3482.9;

export type SendTransactionToolbarEvent =
  | null
  | {
      phase: "pending";
      amount: string;
      symbol: string;
      usd: string;
      toLabel: string;
      iconSrc?: string;
    }
  | { phase: "success" };

export function WalletSendReceivePanel({
  shell,
  onShellChange,
  walletAddress,
  onSendTransactionToolbarChange,
  onOpenSendAssetPicker,
  sendPanelAsset,
  assetPickerOpen = false,
}: {
  shell: Extract<WalletRightShell, { kind: "sendReceive" }>;
  onShellChange: (next: WalletRightShell) => void;
  walletAddress: string;
  onSendTransactionToolbarChange?: (event: SendTransactionToolbarEvent) => void;
  onOpenSendAssetPicker: () => void;
  sendPanelAsset: { symbol: string; iconSrc?: string; fallbackBg: string };
  assetPickerOpen?: boolean;
}) {
  const [sendDestOverlayOpen, setSendDestOverlayOpen] = useState(false);
  const resolvedWallet = walletAddress.trim();
  const sendReceiveShellRef = useRef<HTMLDivElement | null>(null);
  const [receiveQrOpen, setReceiveQrOpen] = useState(false);
  const [sendNotEnoughInfoOpen, setSendNotEnoughInfoOpen] = useState(false);
  const [ctaCopied, setCtaCopied] = useState(false);
  const receiveWalletLabel = useWalletDisplayLabel(resolvedWallet);
  const receiveQrExplorerUrl = useMemo(
    () => getBlockExplorerAddressUrl("ethereum", undefined, resolvedWallet) ?? undefined,
    [resolvedWallet]
  );

  const copyAddressCta = useCallback(() => {
    if (!resolvedWallet) return;
    void navigator.clipboard.writeText(resolvedWallet);
    setCtaCopied(true);
  }, [resolvedWallet]);

  useEffect(() => {
    if (!ctaCopied) return;
    const id = window.setTimeout(() => setCtaCopied(false), 1200);
    return () => window.clearTimeout(id);
  }, [ctaCopied]);

  const [sendPanelAmount, setSendPanelAmount] = useState("");
  const [sendFlowStep, setSendFlowStep] = useState<"form" | "review" | "pending" | "success">("form");
  const sendToolbarPrevStepRef = useRef(sendFlowStep);
  const [sendDestToLabel, setSendDestToLabel] = useState("");
  const [sendStepSlideDir, setSendStepSlideDir] = useState<1 | -1>(1);
  const [sendDestinationReady, setSendDestinationReady] = useState(false);
  const [sendCryptoFormKey, setSendCryptoFormKey] = useState(0);

  const sendHasAmount = parsePositiveDecimalInput(sendPanelAmount) > 0;
  const sendAvailableAmount = useMemo(() => {
    switch (sendPanelAsset.symbol) {
      case "ETH":
        return 0.0009;
      case "BNB":
        return 0.004;
      default:
        return 0;
    }
  }, [sendPanelAsset.symbol]);
  const sendHasInsufficientFunds =
    parsePositiveDecimalInput(sendPanelAmount) > 0 &&
    parsePositiveDecimalInput(sendPanelAmount) > sendAvailableAmount;
  const sendPanelAmountUsd = useMemo(() => {
    const n = parsePositiveDecimalInput(sendPanelAmount);
    if (!n) return "$0.00";
    const price = sendPanelAsset.symbol === "ETH" ? DEMO_ETH_USD_PRICE : 0;
    return formatUsd(n * price);
  }, [sendPanelAmount, sendPanelAsset.symbol]);
  const sendCanContinue = sendHasAmount && sendDestinationReady;
  const sendCtaTightenBottom = sendDestOverlayOpen || assetPickerOpen || sendNotEnoughInfoOpen;

  const resetSendFormAfterTerminalClose = useCallback(() => {
    setSendPanelAmount("");
    setSendDestinationReady(false);
    setSendDestToLabel("");
    setSendCryptoFormKey((k) => k + 1);
  }, []);

  const pendingResetAfterSendStepExitRef = useRef(false);
  const handleSendStepExitComplete = useCallback(() => {
    if (!pendingResetAfterSendStepExitRef.current) return;
    pendingResetAfterSendStepExitRef.current = false;
    resetSendFormAfterTerminalClose();
  }, [resetSendFormAfterTerminalClose]);

  useEffect(() => {
    if (sendFlowStep !== "pending") return;
    const id = window.setTimeout(() => setSendFlowStep("success"), 2800);
    return () => window.clearTimeout(id);
  }, [sendFlowStep]);

  useEffect(() => {
    if (sendFlowStep !== "success") return;
    const id = window.setTimeout(() => {
      setSendStepSlideDir(-1);
      pendingResetAfterSendStepExitRef.current = true;
      setSendFlowStep("form");
    }, 15_000);
    return () => window.clearTimeout(id);
  }, [sendFlowStep]);

  useEffect(() => {
    if (shell.tab !== "send") {
      onSendTransactionToolbarChange?.(null);
      sendToolbarPrevStepRef.current = "form";
      return;
    }
    const prev = sendToolbarPrevStepRef.current;
    if (sendFlowStep === "pending" && prev !== "pending") {
      onSendTransactionToolbarChange?.({
        phase: "pending",
        amount: formatSendEthDisplay(sendPanelAmount),
        symbol: sendPanelAsset.symbol,
        usd: sendPanelAmountUsd,
        toLabel: sendDestToLabel || "—",
        iconSrc: sendPanelAsset.iconSrc,
      });
    } else if (sendFlowStep === "success" && prev !== "success") {
      onSendTransactionToolbarChange?.({ phase: "success" });
    } else if (
      (sendFlowStep === "form" || sendFlowStep === "review") &&
      (prev === "pending" || prev === "success")
    ) {
      onSendTransactionToolbarChange?.(null);
    }
    sendToolbarPrevStepRef.current = sendFlowStep;
  }, [
    onSendTransactionToolbarChange,
    shell.tab,
    sendFlowStep,
    sendPanelAmount,
    sendPanelAsset,
    sendPanelAmountUsd,
    sendDestToLabel,
  ]);

  useEffect(() => {
    if (shell.tab !== "send") {
      setSendFlowStep("form");
      setSendStepSlideDir(1);
    }
  }, [shell.tab]);

  const ctaRadius = sendCtaTightenBottom ? 8 : 14;
  const sendPrimaryCtaRadiusStyle = {
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    borderBottomLeftRadius: ctaRadius,
    borderBottomRightRadius: ctaRadius,
  };
  const sendBackCtaRadiusStyle = {
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    borderBottomLeftRadius: ctaRadius,
    borderBottomRightRadius: 14,
  };
  const sendConfirmCtaRadiusStyle = {
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: ctaRadius,
  };

  return (
    <>
      <motion.div
        key="sendReceive-shell"
        ref={sendReceiveShellRef}
        className="relative flex min-h-0 flex-1 flex-col overflow-hidden"
        initial={walletSwapShellMotion.initial}
        animate={walletSwapShellMotion.animate}
        exit={walletSwapShellMotion.exit}
      >
        <motion.div
          variants={sendReceiveCascadeContainer}
          initial="initial"
          animate="animate"
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <motion.div
            variants={sendReceiveCascadeItem}
            className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-0 px-4 pb-3 pt-4 sm:gap-x-3 sm:px-5"
          >
            <div className="flex min-w-0 items-center gap-1">
              <button
                type="button"
                onClick={() => onShellChange({ kind: "swap" })}
                className={receiveShellBackButtonClass}
                aria-label="Back to swap"
              >
                <ArrowLeft className="h-4 w-4" strokeWidth={2} aria-hidden />
              </button>
              <div
                className="flex min-w-0 -ml-2 flex-nowrap items-center gap-1 overflow-hidden text-[11px] font-semibold sm:text-xs"
                role="tablist"
                aria-label="Send or receive"
              >
                {(["send", "receive"] as const).map((tab) => {
                  const active = shell.tab === tab;
                  const label = tab === "send" ? "Send" : "Receive";
                  return (
                    <button
                      key={tab}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => onShellChange({ kind: "sendReceive", tab })}
                      className={cn(
                        "shrink-0 rounded-full px-3 py-1.5 transition-colors",
                        active
                          ? "bg-white/[0.08] text-[var(--color-text-primary)]"
                          : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex w-max min-w-0 max-w-full shrink-0 flex-nowrap items-center justify-end gap-1.5 sm:gap-2.5">
              {shell.tab === "send" && sendHasInsufficientFunds ? (
                <div className="flex min-w-0 max-w-[11rem] items-center gap-1.5 sm:max-w-[14rem]">
                  <span className="min-w-0 truncate text-right text-[11px] font-semibold text-white/55 sm:text-xs">
                    {`Not enough ${sendPanelAsset.symbol}`}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSendNotEnoughInfoOpen(true)}
                    className={cn(
                      "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[10px] text-white/45",
                      "hover:bg-white/[0.06] hover:text-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/15"
                    )}
                    aria-label="Why can't I use my max balance?"
                  >
                    <Info className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                  </button>
                </div>
              ) : null}
              {shell.tab === "send" && sendFlowStep === "pending" ? (
                <div
                  className="h-4 w-4 shrink-0 rounded-full border-2 border-[var(--color-primary)]/25 border-t-[var(--color-primary)] animate-spin"
                  role="status"
                  aria-label="Transaction pending"
                />
              ) : null}
              {shell.tab === "send" &&
              sendHasAmount &&
              !sendHasInsufficientFunds &&
              (sendFlowStep === "form" || sendFlowStep === "review") ? (
                <WalletPanelGasInline usd={DEMO_SEND_NETWORK_FEE_USD} />
              ) : null}
              <button
                type="button"
                onMouseDown={(e) => {
                  if (e.button === 0) e.preventDefault();
                }}
                onClick={() => setReceiveQrOpen(true)}
                className={cn(
                  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-transparent bg-white/[0.04] text-white/65 outline-none",
                  "transition-none hover:bg-white/[0.055] hover:text-white",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/25"
                )}
                aria-label="Show wallet QR code"
              >
                <Maximize2 className="h-4 w-4" strokeWidth={2} aria-hidden />
              </button>
            </div>
          </motion.div>
          <NotEnoughBalanceInfoOverlay open={sendNotEnoughInfoOpen} onClose={() => setSendNotEnoughInfoOpen(false)} />

          <div className={cn("flex min-h-0 flex-1 basis-0 flex-col px-4 pb-4 pt-1 sm:px-5 sm:pb-5", "gap-5")}>
            {shell.tab === "receive" ? (
              <>
                <div className="relative flex min-h-0 flex-1 basis-0 flex-col overflow-hidden">
                  <div className="flex min-h-0 flex-1 basis-0 flex-col overflow-hidden">
                    <ReceiveCryptoFirstPassBody
                      fullAddress={resolvedWallet}
                      shortAddress={truncateAddressMiddle(resolvedWallet)}
                      onCopyAddress={copyAddressCta}
                      onOpenQrModal={() => setReceiveQrOpen(true)}
                    />
                  </div>
                </div>
                <Button
                  type="button"
                  onClick={copyAddressCta}
                  className="h-11 w-full shrink-0 rounded-[14px] bg-[var(--color-primary)] text-sm font-semibold text-white hover:bg-[var(--color-primary)]/90"
                >
                  {ctaCopied ? "Copied" : "Copy Address"}
                </Button>
              </>
            ) : (
              <>
                <div className="relative flex min-h-0 flex-1 basis-0 flex-col overflow-x-hidden overflow-y-auto overscroll-contain">
                  <div className="flex min-h-0 flex-1 basis-0 flex-col overflow-x-hidden overflow-y-auto overscroll-contain">
                    <SendCryptoFirstPassBody
                      key={sendCryptoFormKey}
                      amount={sendPanelAmount}
                      amountUsd={sendPanelAmountUsd}
                      onAmountChange={setSendPanelAmount}
                      overlayMountRef={sendReceiveShellRef}
                      onDestOverlayOpenChange={setSendDestOverlayOpen}
                      sendFlowStep={sendFlowStep}
                      sendStepTransitionDir={sendStepSlideDir}
                      walletLabel={receiveWalletLabel}
                      walletAddressFull={resolvedWallet}
                      walletAddressShort={truncateAddressMiddle(resolvedWallet)}
                      onCopyAddress={copyAddressCta}
                      onOpenQrModal={() => setReceiveQrOpen(true)}
                      onSendDestinationReadyChange={setSendDestinationReady}
                      onSendDestinationToLabelChange={setSendDestToLabel}
                      sendAsset={sendPanelAsset}
                      onOpenSendAssetPicker={onOpenSendAssetPicker}
                      onSendStepExitComplete={handleSendStepExitComplete}
                    />
                  </div>
                </div>
                <div className="flex w-full min-w-0 shrink-0 items-stretch">
                  <motion.div
                    initial={false}
                    animate={{
                      width: sendFlowStep === "review" ? 44 : 0,
                      marginRight: sendFlowStep === "review" ? 12 : 0,
                    }}
                    transition={{ duration: 0.32, ease: [0.33, 1, 0.68, 1] }}
                    className="relative shrink-0 overflow-hidden"
                    aria-hidden={
                      sendFlowStep === "form" || sendFlowStep === "pending" || sendFlowStep === "success"
                        ? true
                        : undefined
                    }
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSendStepSlideDir(-1);
                        setSendFlowStep("form");
                      }}
                      tabIndex={sendFlowStep === "review" ? 0 : -1}
                      style={sendBackCtaRadiusStyle}
                      className="inline-flex h-11 w-11 shrink-0 items-center justify-center border-0 bg-white/[0.04] p-0 text-white outline-none transition-[background-color] duration-200 hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/25"
                      aria-label="Back to edit"
                    >
                      <ArrowLeft className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                    </button>
                  </motion.div>
                  <button
                    type="button"
                    disabled={sendFlowStep === "form" && !sendCanContinue}
                    onClick={() => {
                      if (sendFlowStep === "form") {
                        setSendStepSlideDir(1);
                        setSendFlowStep("review");
                        return;
                      }
                      if (sendFlowStep === "review") {
                        setSendStepSlideDir(1);
                        setSendFlowStep("pending");
                        return;
                      }
                      if (sendFlowStep === "pending" || sendFlowStep === "success") {
                        setSendStepSlideDir(-1);
                        pendingResetAfterSendStepExitRef.current = true;
                        setSendFlowStep("form");
                      }
                    }}
                    style={
                      sendFlowStep === "review" ? sendConfirmCtaRadiusStyle : sendPrimaryCtaRadiusStyle
                    }
                    className={cn(
                      buttonVariants({ variant: "default" }),
                      "h-11 min-w-0 flex-1 rounded-none bg-[var(--color-primary)] text-sm font-semibold text-white hover:bg-[var(--color-primary)]/90 disabled:opacity-40 disabled:pointer-events-none"
                    )}
                  >
                    {sendFlowStep === "form"
                      ? "Review Transfer"
                      : sendFlowStep === "review"
                        ? "Confirm send"
                        : "Close"}
                  </button>
                </div>
              </>
            )}
          </div>
        </motion.div>
      </motion.div>

      <WalletQRModal
        open={receiveQrOpen}
        onOpenChange={setReceiveQrOpen}
        address={resolvedWallet}
        symbol="ETH"
        networkName="Ethereum"
        userName={receiveWalletLabel}
        contentContext="sidebar"
        explorerUrl={receiveQrExplorerUrl}
      />
    </>
  );
}
