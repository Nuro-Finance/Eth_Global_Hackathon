"use client";

/**
 * ReceiveModal — Session 25
 *
 * Simple "show me my address + QR" modal, opened from the Receive button on
 * ConnectedWalletDashboard. No network call, no state beyond copy-feedback.
 */

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { ArrowDownLeft, Check, Copy, X } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  COMPACT_GLASS_SHELL_INNER_STYLE,
  COMPACT_GLASS_SHELL_OUTER_STYLE,
  FORM_MODAL_SHELL_CLASS,
  FULL_MODAL_OVERLAY_CLASS,
  WALLET_TRANSFER_MODAL_INNER_CLASS,
} from "@/components/ui/modalPresets";
import { cn } from "@/lib/utils";

export function ReceiveModal({
  open,
  onOpenChange,
  walletAddress,
  previewMode: _previewMode = false,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  walletAddress: string;
 /** Reserved — dev preview uses demo address from parent. */
  previewMode?: boolean;
}) {
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!open || !walletAddress) return;
    QRCode.toDataURL(walletAddress, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 320,
      color: { dark: "#e8e8e8", light: "#00000000" },
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl("");
      });
    return () => {
      cancelled = true;
    };
  }, [open, walletAddress]);

  const handleCopy = async () => {
    if (!walletAddress) return;
    try {
      await navigator.clipboard.writeText(walletAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
 // Silent fail; user can still read the address on screen
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideClose
        overlayClassName={FULL_MODAL_OVERLAY_CLASS}
        className={cn(FORM_MODAL_SHELL_CLASS, "!max-w-md")}
        style={COMPACT_GLASS_SHELL_OUTER_STYLE}
      >
        <div className={WALLET_TRANSFER_MODAL_INNER_CLASS} style={COMPACT_GLASS_SHELL_INNER_STYLE}>
          <DialogClose asChild>
            <button
              type="button"
              className={cn(
                "absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-[10px] p-1.5 text-[var(--color-text-muted)] outline-none transition-all",
                "hover:bg-white/5 hover:text-[var(--color-text-primary)]",
                "focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/25"
              )}
              aria-label="Close"
            >
              <X className="h-full w-full" strokeWidth={2} />
            </button>
          </DialogClose>

          <div className="flex min-h-0 flex-1 flex-col px-6 pb-6 pt-6 sm:px-8 sm:pb-6 sm:pt-7">
            <div className="flex shrink-0 items-center gap-3 pr-8">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-white/10 bg-[var(--color-bg-input)]">
                <ArrowDownLeft
                  className="h-[18px] w-[18px] text-[var(--color-primary)]"
                  strokeWidth={2}
                  aria-hidden
                />
              </div>
              <div className="min-w-0 flex-1">
                <DialogTitle asChild>
                  <h1 className="text-[16px] font-medium leading-none text-[var(--color-text-primary)]">
                    Receive
                  </h1>
                </DialogTitle>
                <DialogDescription asChild>
                  <p className="mt-1.5 text-[13px] leading-snug text-[var(--color-text-muted)]">
                    Send assets to this address on the same chain as your wallet.
                  </p>
                </DialogDescription>
              </div>
            </div>

            <div className="mt-5 min-h-0 flex-1 overflow-y-auto">
              <div className="mx-auto mb-5 flex h-[240px] w-[240px] items-center justify-center rounded-[18px] border border-white/10 bg-gradient-to-br from-white/[0.03] to-white/[0.01] p-4 sm:h-[260px] sm:w-[260px]">
                {qrDataUrl ? (
 // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={qrDataUrl}
                    alt={`QR for ${walletAddress}`}
                    className="h-full w-full"
                  />
                ) : (
                  <div className="h-full w-full animate-pulse rounded-lg bg-white/[0.04]" />
                )}
              </div>

              <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-dimmed)]">
                Wallet address
              </div>
              <button
                type="button"
                onClick={handleCopy}
                className={cn(
                  "flex w-full items-center justify-between gap-3 rounded-[12px] border border-white/10 bg-white/[0.04] px-4 py-3 text-left transition-colors",
                  "hover:border-white/20 hover:bg-white/[0.05]",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/40"
                )}
                aria-label="Copy wallet address"
              >
                <span className="truncate font-mono text-sm text-[var(--color-text-primary)]">
                  {walletAddress || "—"}
                </span>
                <span className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-[var(--color-primary)]">
                  {copied ? (
                    <>
                      <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" strokeWidth={2} />
                      Copy
                    </>
                  )}
                </span>
              </button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
