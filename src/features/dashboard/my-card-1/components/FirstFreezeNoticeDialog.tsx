"use client";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Snowflake, X } from "lucide-react";

interface FirstFreezeNoticeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FirstFreezeNoticeDialog({
  open,
  onOpenChange,
}: FirstFreezeNoticeDialogProps) {
  const handleDismiss = () => onOpenChange(false);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) handleDismiss();
      }}
    >
      <DialogContent
        hideClose
        hideOverlay
        className={cn(
          "notifications-full-dialog z-[110] flex min-h-0 flex-col gap-0 !overflow-visible p-2",
          "h-auto w-[calc(100vw-2rem)] max-w-[min(18.5rem,calc(100vw-2rem))] !rounded-[32px] backdrop-blur-md shadow-xl",
        )}
        style={{
          backgroundColor: "rgba(255, 255, 255, 0.02)",
          borderColor: "rgba(255, 255, 255, 0.03)",
          borderWidth: "1px",
          borderStyle: "solid",
        }}
      >
        <div
          className="relative flex w-full flex-col overflow-hidden rounded-[26px] border !backdrop-blur-none"
          style={{
            backgroundColor: "rgba(255, 255, 255, 0.04)",
            borderColor: "rgba(255, 255, 255, 0.03)",
            borderWidth: "1px",
            borderStyle: "solid",
          }}
        >
          <DialogClose asChild>
            <button
              type="button"
              className={cn(
                "absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-[10px] p-1.5 text-[var(--color-text-muted)] outline-none transition-all",
                "hover:bg-white/5 hover:text-[var(--color-text-primary)]",
                "focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/25",
              )}
              aria-label="Close"
            >
              <X className="h-full w-full" strokeWidth={2} />
            </button>
          </DialogClose>

          <div className="flex flex-col px-5 pb-7 pt-6 sm:px-6 sm:pb-8 sm:pt-7">
            <div className="mx-auto mb-4 flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border border-[var(--color-error)] bg-[var(--color-bg-input)]">
              <Snowflake className="h-5 w-5 text-[var(--color-error)]" strokeWidth={2} />
            </div>

            <DialogTitle asChild>
              <h1 className="w-full text-center text-[17px] font-medium leading-snug tracking-tight text-[var(--color-text-primary)] sm:text-lg">
                Spending Disabled
              </h1>
            </DialogTitle>

            <DialogDescription asChild>
              <p className="mt-3 text-center text-[13px] leading-snug text-[var(--color-text-muted)]">
                Reload and Withdraw stay available so you can still move funds.
              </p>
            </DialogDescription>

            <button
              type="button"
              className={cn(
                "mt-6 box-border inline-flex h-10 w-full shrink-0 cursor-pointer items-center justify-center rounded-[10px] border border-white/10 px-5 text-sm font-medium leading-none outline-none",
                "bg-white/5 text-white",
                "transition-all duration-300 motion-reduce:transition-none motion-reduce:hover:translate-y-0",
                "hover:-translate-y-[2px] hover:bg-white/10 active:translate-y-0",
                "sm:w-[60%] sm:self-center",
              )}
              onClick={handleDismiss}
            >
              Got it
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
