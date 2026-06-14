"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { FULL_MODAL_OVERLAY_CLASS } from "@/components/ui/modalPresets";
import { motion } from "framer-motion";
import { ChevronLeft, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { WithdrawFlow, type WithdrawFlowHandle } from "@/features/dashboard/my-card-1/components/WithdrawFlow";

interface WithdrawModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const HEADER_SHIFT_X = 40;
const headerCaretTransition = { duration: 0.4, ease: [0.33, 1, 0.68, 1] as const };
/** Fixed outer shell - body swaps per step; height never follows step content. */
const SHELL_HEIGHT_CLASS =
  "h-[min(540px,85vh)] min-h-[min(540px,85vh)] max-h-[min(540px,85vh)]";

/**
 * Withdraw - same shell as `ReloadModal` (header, X, dots) + `WithdrawFlow` (`variant="modal"`).
 */
export function WithdrawModal({ open, onOpenChange }: WithdrawModalProps) {
  const withdrawFlowRef = useRef<WithdrawFlowHandle>(null);
  const modalPaginationStripRef = useRef<HTMLDivElement>(null);
  const [flowStep, setFlowStep] = useState(1);
  const [flowMountKey, setFlowMountKey] = useState(0);

  useEffect(() => {
    if (open) {
      setFlowStep(1);
      setFlowMountKey((k) => k + 1);
    }
  }, [open]);

  const handleClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideClose
        overlayClassName={FULL_MODAL_OVERLAY_CLASS}
        className={cn(
          "notifications-full-dialog z-[110] flex min-h-0 flex-col gap-0 overflow-hidden p-2.5 sm:p-3",
          "w-[calc(100vw-2rem)] max-w-[min(32rem,calc(100vw-2rem))] !rounded-[56px] backdrop-blur-md shadow-xl",
          SHELL_HEIGHT_CLASS,
        )}
        style={{
          backgroundColor: "rgba(255, 255, 255, 0.02)",
          borderColor: "rgba(255, 255, 255, 0.03)",
          borderWidth: "1px",
          borderStyle: "solid",
        }}
      >
        <div
          className="relative flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden rounded-[44px] border !backdrop-blur-none"
          style={{
            backgroundColor: "rgba(255, 255, 255, 0.04)",
            borderColor: "rgba(255, 255, 255, 0.03)",
            borderWidth: "1px",
            borderStyle: "solid",
          }}
        >
          <div className="relative z-20 shrink-0 overflow-visible px-5 pb-3 pt-5 sm:px-6 sm:pb-3.5 sm:pt-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 flex-1 flex-col gap-1.5 text-start">
                <motion.div
                  className="relative min-w-0"
                  initial={false}
                  animate={{ x: flowStep > 1 ? HEADER_SHIFT_X : 0 }}
                  transition={headerCaretTransition}
                >
                  <motion.button
                    type="button"
                    onClick={() => withdrawFlowRef.current?.goBack()}
                    disabled={flowStep <= 1}
                    tabIndex={flowStep > 1 ? 0 : -1}
                    initial={false}
                    animate={{ opacity: flowStep > 1 ? 1 : 0 }}
                    transition={headerCaretTransition}
                    className={cn(
                      "absolute left-0 top-1/2 z-10 -ml-2.5 flex size-8 -translate-x-full -translate-y-1/2 items-center justify-center rounded-none bg-transparent p-0 text-[var(--color-text-primary)] outline-none hover:bg-transparent focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/25",
                      flowStep <= 1 && "pointer-events-none",
                    )}
                    aria-label="Back"
                  >
                    <ChevronLeft className="h-6 w-6" strokeWidth={2} />
                  </motion.button>
                  <DialogTitle className="relative m-0 min-w-0 text-2xl font-semibold leading-none tracking-tight text-[var(--color-text-primary)]">
                    Withdraw
                  </DialogTitle>
                </motion.div>
                <motion.p
                  className="m-0 text-[13px] font-medium leading-snug text-[var(--color-text-muted)]"
                  initial={false}
                  animate={{ opacity: flowStep === 1 ? 1 : 0 }}
                  transition={headerCaretTransition}
                  aria-hidden={flowStep > 1}
                  style={{ pointerEvents: flowStep === 1 ? "auto" : "none" }}
                >
                  Send funds to your wallet.
                </motion.p>
              </div>
              <DialogClose asChild>
                <button
                  type="button"
                  className={cn(
                    "relative z-[1] flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] p-1.5 text-[var(--color-text-muted)] outline-none",
                    "transition-[color,background-color,opacity] duration-200 ease-out",
                    "hover:bg-white/5 hover:text-[var(--color-text-primary)]",
                    "focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/25",
                  )}
                  aria-label="Close"
                >
                  <X className="h-full w-full" strokeWidth={2} />
                </button>
              </DialogClose>
            </div>
          </div>

          <div className="relative z-0 flex min-h-0 flex-1 flex-col gap-[16px] overflow-visible px-5 pt-0 sm:px-6">
            <div className="min-h-0 flex-1 overflow-visible">
              <WithdrawFlow
                key={flowMountKey}
                ref={withdrawFlowRef}
                variant="modal"
                hideProgressDots
                paginationStripRef={modalPaginationStripRef}
                onStepChange={setFlowStep}
                onNext={() => {}}
                onBack={() => {}}
                onClose={handleClose}
              />
            </div>
            <div className="flex shrink-0 flex-col items-center px-0 pb-6 pt-0">
              <div ref={modalPaginationStripRef} className="flex justify-center gap-[6px]">
                {[1, 2].map((s) => (
                  <div
                    key={s}
                    className={cn(
                      "h-2 rounded-full transition-all duration-300",
                      flowStep === s || (s === 2 && flowStep === 3)
                        ? "w-4 bg-[var(--color-progress-active)]"
                        : "w-2 bg-[var(--color-progress-inactive)]",
                    )}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
