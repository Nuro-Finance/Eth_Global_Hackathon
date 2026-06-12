"use client";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  FULL_MODAL_OVERLAY_CLASS,
} from "@/components/ui/modalPresets";
import { ArrowLeft, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { ReactNode } from "react";
import {
  walletModalItemCascadeVariants,
  walletModalShellLayerVariants,
} from "@/components/createWalletModalMotion";

interface CreateWalletModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  onBack?: () => void;
  hideTitle?: boolean;
  motionKey?: string | number;
  children?: ReactNode;
  /** When false, removes the bottom scroll fade so short “success” layouts are not clipped. */
  contentFadeMask?: boolean;
}

/**
 * Standard Nuro Modal Shell: Create Wallet Flow
 * Rebuilt to PERFECTLY match the architectural pattern of NotificationsModal.tsx.
 */
export function CreateWalletModal({
  open,
  onOpenChange,
  title = "Create Your Wallet",
  onBack,
  hideTitle = false,
  motionKey,
  children,
  contentFadeMask = true,
}: CreateWalletModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideClose
        overlayClassName={FULL_MODAL_OVERLAY_CLASS}
        className="create-wallet-full-dialog z-[110] flex min-h-0 flex-col gap-0 !overflow-visible p-[12px] w-[calc(100vw-2rem)] max-w-3xl !rounded-[56px] backdrop-blur-md shadow-xl"
        style={{
          // Fixed-height modal (not content-sized): slightly taller than current baseline.
          height: "min(70vh, 34rem)",
          maxHeight: "min(70vh, 34rem)",
          backgroundColor: 'rgba(255, 255, 255, 0.02)',
          borderColor: 'rgba(255, 255, 255, 0.03)',
          borderWidth: '1px',
          borderStyle: 'solid'
        }}
      >
        <div
          className="relative w-full h-full !backdrop-blur-none rounded-[44px] overflow-hidden flex flex-col border"
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.04)',
            borderColor: 'rgba(255, 255, 255, 0.03)',
            borderWidth: '1px',
            borderStyle: 'solid'
          }}
        >
          <motion.div
            className="flex flex-col flex-1 min-h-0"
            variants={walletModalShellLayerVariants}
            initial="initial"
            animate="animate"
          >
            <motion.div className="shrink-0 px-4 pt-6 pb-3" variants={walletModalItemCascadeVariants}>
              <div className="flex items-center justify-between gap-3 pl-3 pr-3">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  {onBack && (
                    <button
                      type="button"
                      onClick={onBack}
                      className={cn(
                        "shrink-0 w-8 h-8 p-1.5 flex items-center justify-center rounded-[10px] text-[var(--color-text-muted)] outline-none transition-all",
                        "hover:bg-white/5 hover:text-[var(--color-text-primary)]",
                        "focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/25"
                      )}
                      aria-label="Back"
                      title="Back"
                    >
                      <ArrowLeft className="h-full w-full" strokeWidth={2} />
                    </button>
                  )}
                  {!hideTitle && (
                    <DialogTitle className="m-0 min-w-0 flex-1 text-start text-2xl font-semibold leading-none tracking-tight text-[var(--color-text-primary)]">
                      {title}
                    </DialogTitle>
                  )}
                </div>
                <DialogClose asChild>
                  <button
                    type="button"
                    className={cn(
                      "shrink-0 w-8 h-8 p-1.5 flex items-center justify-center rounded-[10px] text-[var(--color-text-muted)] outline-none transition-all",
                      "hover:bg-white/5 hover:text-[var(--color-text-primary)]",
                      "focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/25"
                    )}
                    aria-label="Close"
                  >
                    <X className="h-full w-full" strokeWidth={2} />
                  </button>
                </DialogClose>
              </div>
            </motion.div>

            <div
              className={cn(
                "min-h-0 flex flex-1 flex-col overflow-y-auto overscroll-contain px-4 pt-0 scroll-gutter-stable",
                contentFadeMask ? "pb-2" : "pb-4"
              )}
              style={
                contentFadeMask
                  ? {
                      maskImage:
                        "linear-gradient(to bottom, black 0, black calc(100% - 2.5rem), transparent 100%)",
                      WebkitMaskImage:
                        "linear-gradient(to bottom, black 0, black calc(100% - 2.5rem), transparent 100%)",
                    }
                  : undefined
              }
            >
              <div key={motionKey ?? "create-wallet-flow"} className="flex min-h-0 w-full flex-1 flex-col">
                {children}
              </div>
            </div>
          </motion.div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
