"use client";

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { AnimatePresence, motion, type Variants } from "framer-motion";
import { Check, Copy, Globe, X } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { FULL_MODAL_OVERLAY_CLASS } from "@/components/ui/modalPresets";
import { Switch } from "@/components/ui/switch";
import { Avatar } from "@/components/ui";
import { cn } from "@/lib/utils";

/** Outer white QR face; modal shell unchanged. */
const QR_WHITE_BOX_PX = 196;
/** Generated + displayed QR bitmap (smaller face + inner padding). */
const QR_PATTERN_PX = 168;

const layerVariants: Variants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: {
      duration: 0.4,
      ease: "easeOut",
      staggerChildren: 0.08,
      delayChildren: 0.1,
    },
  },
  exit: { opacity: 0, transition: { duration: 0.2, ease: "easeIn" } },
};

const cascadeVariants: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.33, 1, 0.68, 1] },
  },
};

interface WalletQRModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  address: string;
  symbol: string;
  networkName: string;
  explorerUrl?: string;
  userName?: string;
  /** Sidebar entry uses extra logo-row rhythm from design spec. */
  contentContext?: "default" | "sidebar";
}

const qrGenerateOptions: QRCode.QRCodeToDataURLOptions = {
  width: QR_PATTERN_PX,
  margin: 2,
  color: {
    dark: "#000000",
    light: "#FFFFFF",
  },
  errorCorrectionLevel: "M",
};

function chainIconSrc(symbol: string): string {
  return symbol.toUpperCase() === "SOL" ? "/SOL%20Coin.svg" : "/Eth%20Coin.svg";
}

/** Middle `...`, always shows last 4 chars; caps total length (~prior single-line density). */
function formatWalletQrAddressDisplay(raw: string, maxChars = 39): string {
  const a = raw.trim();
  if (!a || a.length <= maxChars) return a;
  const tailLen = 4;
  const sep = "...";
  const headLen = maxChars - sep.length - tailLen;
  if (headLen < 1) return `${a.slice(0, 1)}${sep}${a.slice(-tailLen)}`;
  return `${a.slice(0, headLen)}${sep}${a.slice(-tailLen)}`;
}

/** Per-asset glows; ETH lavender fixed off `--color-primary`. */
function getWalletQrAssetTheme(symbol: string): {
  glowFilter: string;
  qrShellGlowBoxShadow: string;
} {
  const u = symbol.toUpperCase();
  if (u === "SOL") {
    return {
      glowFilter:
        "drop-shadow(0 0 8px rgba(153, 69, 255, 0.5)) drop-shadow(0 0 18px rgba(20, 241, 149, 0.22)) drop-shadow(0 0 28px rgba(153, 69, 255, 0.18))",
      qrShellGlowBoxShadow:
        "0 0 6px 2px rgba(153, 69, 255, 0.48), 0 0 16px 5px rgba(153, 69, 255, 0.28), 0 0 28px 9px rgba(20, 241, 149, 0.14), 0 0 40px 12px rgba(153, 69, 255, 0.12)",
    };
  }
  return {
    glowFilter:
      "drop-shadow(0 0 6px rgba(132, 111, 255, 0.85)) drop-shadow(0 0 14px rgba(132, 111, 255, 0.55)) drop-shadow(0 0 26px rgba(132, 111, 255, 0.32)) drop-shadow(0 0 40px rgba(132, 111, 255, 0.16))",
    qrShellGlowBoxShadow:
      "0 0 5px 2px rgba(132, 111, 255, 0.78), 0 0 14px 5px rgba(132, 111, 255, 0.48), 0 0 28px 9px rgba(132, 111, 255, 0.28), 0 0 44px 14px rgba(132, 111, 255, 0.14)",
  };
}

export function WalletQRModal({
  open,
  onOpenChange,
  address,
  symbol,
  networkName,
  explorerUrl,
  userName = "User Profile",
  contentContext = "default",
}: WalletQRModalProps) {
  const [copied, setCopied] = useState(false);
  const [includeChainPrefix, setIncludeChainPrefix] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrLoaded, setQrLoaded] = useState(false);
  const qrImgRef = useRef<HTMLImageElement | null>(null);

  const chainLabel = symbol.toLowerCase();
  const qrPayload = includeChainPrefix ? `${chainLabel}:${address}` : address;
  const assetTheme = useMemo(() => getWalletQrAssetTheme(symbol), [symbol]);

  /** Same QR version for prefix on/off so module count (grid) stays fixed at this output width. */
  const pinnedQrVersion = useMemo(() => {
    if (!address) return undefined;
    try {
      const maxPayload = `${chainLabel}:${address}`;
      return QRCode.create(maxPayload, { errorCorrectionLevel: "M" }).version;
    } catch {
      return undefined;
    }
  }, [address, chainLabel]);

  useEffect(() => {
    setQrLoaded(false);
  }, [address]);

  useEffect(() => {
    if (!open || !address) return;

    let cancelled = false;
    const renderOpts: QRCode.QRCodeToDataURLOptions = {
      ...qrGenerateOptions,
      ...(typeof pinnedQrVersion === "number" ? { version: pinnedQrVersion } : {}),
    };
    QRCode.toDataURL(qrPayload, renderOpts)
      .then((url) => {
        if (cancelled) return;
        setQrDataUrl(url);
      })
      .catch((err) => {
        console.error("[WalletQRModal] Failed to generate QR:", err);
      });

    return () => {
      cancelled = true;
    };
  }, [open, address, qrPayload, pinnedQrVersion]);

  useLayoutEffect(() => {
    if (!open || !qrDataUrl) return;
    const img = qrImgRef.current;
    if (img?.complete && img.naturalWidth > 0) {
      setQrLoaded(true);
    }
  }, [open, qrDataUrl]);

  const handleCopy = () => {
    if (!qrPayload) return;
    void navigator.clipboard.writeText(qrPayload);
    setCopied(true);
  };

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1200);
    return () => window.clearTimeout(timer);
  }, [copied]);

  return (
    <Dialog
      open={open}
      onOpenChange={(val) => {
        if (!val) {
          setQrDataUrl(null);
          setQrLoaded(false);
        }
        onOpenChange(val);
      }}
    >
      <DialogContent
        hideClose
        overlayClassName={FULL_MODAL_OVERLAY_CLASS}
        onCloseAutoFocus={(e) => {
          // Avoid refocusing the shell "expand" control: Radix restores the last focused
          // element, which animates border/bg (transition) and shows a focus ring flash.
          e.preventDefault();
        }}
        className="z-[110] flex min-h-0 max-h-[min(84vh,42rem)] w-[calc(100vw-2rem)] max-w-xl flex-col gap-0 overflow-x-hidden overflow-y-auto p-[12px] !rounded-[56px] backdrop-blur-none shadow-xl"
        style={{
          backgroundColor: "rgba(255, 255, 255, 0.02)",
          borderColor: "rgba(255, 255, 255, 0.03)",
          borderWidth: "1px",
          borderStyle: "solid",
        }}
      >
        <div
          className="relative flex w-full flex-col overflow-visible rounded-[44px] border !backdrop-blur-none"
          style={{
            backgroundColor: "rgba(255, 255, 255, 0.04)",
            borderColor: "rgba(255, 255, 255, 0.03)",
            borderWidth: "1px",
            borderStyle: "solid",
          }}
        >
          <div className="relative z-10 shrink-0 px-4 pt-5 pb-2">
            <div className="flex items-center justify-between gap-3 pl-3 pr-3">
              <DialogTitle className="m-0 flex-1 text-start text-2xl font-semibold leading-none tracking-tight text-[var(--color-text-primary)]">
                Connected Wallet
              </DialogTitle>
              <DialogClose asChild>
                <button
                  type="button"
                  className={cn(
                    "shrink-0 w-8 h-8 p-1.5 flex items-center justify-center rounded-[10px] text-[var(--color-text-muted)] outline-none transition-all",
                    "hover:bg-white/5 hover:text-[var(--color-text-primary)]",
                    "focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/25",
                  )}
                  aria-label="Close"
                >
                  <X className="h-full w-full" strokeWidth={2} />
                </button>
              </DialogClose>
            </div>
            <p className="mt-1 px-3 text-[15px] leading-relaxed text-[var(--color-text-muted)]">
              Scan the QR code or copy the address below.
            </p>
          </div>

          <div className="relative z-0 overflow-visible px-4 pt-0 pb-4 scroll-gutter-stable">
            <AnimatePresence mode="wait">
              {open ? (
                <motion.div
                  key={address}
                  className="pb-4 pl-3 pr-3 pt-2"
                  variants={layerVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                >
                  <motion.div
                    variants={cascadeVariants}
                    className={cn(
                      "flex flex-row items-center justify-center gap-12",
                      contentContext === "sidebar" && "py-3",
                      contentContext === "default" && "py-1",
                    )}
                  >
                    <div className="shrink-0" style={{ filter: assetTheme.glowFilter }}>
                      <img
                        src={chainIconSrc(symbol)}
                        alt=""
                        className="h-32 w-32 object-contain"
                        draggable={false}
                      />
                    </div>

                    {!qrDataUrl ? (
                      <div
                        className="shrink-0 rounded-[20px] bg-white/[0.04]"
                        style={{
                          width: QR_WHITE_BOX_PX,
                          height: QR_WHITE_BOX_PX,
                          boxShadow: assetTheme.qrShellGlowBoxShadow,
                        }}
                      />
                    ) : (
                      <div
                        className="relative isolate shrink-0 overflow-visible rounded-[22px]"
                        style={{
                          width: QR_WHITE_BOX_PX,
                          height: QR_WHITE_BOX_PX,
                          boxShadow: assetTheme.qrShellGlowBoxShadow,
                        }}
                      >
                        <div
                          className={cn(
                            "relative z-[1] overflow-hidden rounded-[20px] bg-white transition-[opacity,transform] duration-500 ease-out",
                            qrLoaded ? "scale-100 opacity-100" : "scale-95 opacity-0",
                          )}
                          style={{
                            width: QR_WHITE_BOX_PX,
                            height: QR_WHITE_BOX_PX,
                            filter: assetTheme.glowFilter,
                          }}
                        >
                          <div className="flex size-full items-center justify-center p-3">
                            <div
                              className="shrink-0 overflow-hidden"
                              style={{
                                width: QR_PATTERN_PX,
                                height: QR_PATTERN_PX,
                                minWidth: QR_PATTERN_PX,
                                minHeight: QR_PATTERN_PX,
                                maxWidth: QR_PATTERN_PX,
                                maxHeight: QR_PATTERN_PX,
                              }}
                            >
                              <img
                                ref={qrImgRef}
                                src={qrDataUrl}
                                alt="Wallet address QR code"
                                width={QR_PATTERN_PX}
                                height={QR_PATTERN_PX}
                                className="block size-full max-h-full max-w-full object-contain"
                                draggable={false}
                                onLoad={() => setQrLoaded(true)}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </motion.div>

                  <motion.div variants={cascadeVariants} className="mt-4 text-center text-[15px] text-[var(--color-text-muted)]">
                    Only send {networkName} assets to this address.
                  </motion.div>

                  <motion.div
                    variants={cascadeVariants}
                    className={cn(
                      "mt-3 flex items-center justify-center gap-3 text-sm text-[var(--color-text-muted)]",
                      contentContext === "sidebar" ? "pb-7" : "pb-5",
                    )}
                  >
                    <Switch
                      checked={includeChainPrefix}
                      onChange={() => setIncludeChainPrefix((v) => !v)}
                      className={
                        includeChainPrefix ? undefined : "bg-[var(--color-bg-input)]"
                      }
                    />
                    <span>
                      QR code with chain prefix (<span className="font-semibold">{chainLabel}:</span>)
                    </span>
                  </motion.div>

                  <motion.div
                    variants={cascadeVariants}
                    className="mt-0 flex w-full items-center gap-3 rounded-[var(--radius-card)] bg-[var(--color-bg-input)] p-4"
                  >
                    <Avatar
                      alt={userName}
                      size="sm"
                      variant="rounded"
                      className="shrink-0"
                      fallback={
                        <span className="flex h-full w-full items-center justify-center bg-[var(--color-primary)]/20 text-[var(--color-primary)] text-xs font-semibold uppercase">
                          {userName.charAt(0).toUpperCase()}
                        </span>
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-semibold text-[var(--color-text-primary)]">
                        {userName}
                      </p>
                      <p
                        className="min-w-0 whitespace-nowrap text-[13px] text-[var(--color-text-muted)]"
                        title={address}
                      >
                        <span className="font-bold text-[var(--color-text-primary)]">{symbol}:</span>{" "}
                        {formatWalletQrAddressDisplay(address)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleCopy}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-[8px] text-[var(--color-text-muted)] transition-[opacity,transform] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
                      aria-label={copied ? "Address copied" : "Copy wallet address"}
                    >
                      {copied ? (
                        <Check className="h-3.5 w-3.5 text-[var(--color-success)]" strokeWidth={2.5} />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!explorerUrl) return;
                        window.open(explorerUrl, "_blank", "noopener,noreferrer");
                      }}
                      disabled={!explorerUrl}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-[8px] text-[var(--color-text-muted)] transition-[opacity,transform] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label="Open block explorer"
                    >
                      <Globe className="h-3.5 w-3.5" />
                    </button>
                  </motion.div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
