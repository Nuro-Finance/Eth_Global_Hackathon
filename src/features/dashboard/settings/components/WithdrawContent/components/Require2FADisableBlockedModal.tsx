"use client";

import React from "react";
import { X } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { FORM_MODAL_SHELL_CLASS } from "@/components/ui/modalPresets";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SETTINGS_CTA_BUTTON_CLASS } from "@/features/dashboard/settings/settingsStyles";

const MODAL_INNER_CLASS =
  "relative flex w-full flex-col overflow-hidden rounded-[26px] border !backdrop-blur-none";

const MODAL_INNER_STYLE = {
  backgroundColor: "rgba(255, 255, 255, 0.04)",
  borderColor: "rgba(255, 255, 255, 0.03)",
  borderWidth: "1px",
  borderStyle: "solid" as const,
};

const MODAL_SHELL_STYLE = {
  backgroundColor: "rgba(255, 255, 255, 0.02)",
  borderColor: "rgba(255, 255, 255, 0.03)",
  borderWidth: "1px",
  borderStyle: "solid" as const,
};

interface Require2FADisableBlockedModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function Require2FADisableBlockedModal({
  open,
  onOpenChange,
}: Require2FADisableBlockedModalProps) {
  const handleClose = () => onOpenChange(false);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) handleClose();
      }}
    >
      <DialogContent
        hideClose
        hideOverlay
        className={cn(FORM_MODAL_SHELL_CLASS, "!max-w-sm")}
        style={MODAL_SHELL_STYLE}
      >
        <div className={MODAL_INNER_CLASS} style={MODAL_INNER_STYLE}>
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

          <div className="flex flex-col px-6 pb-8 pt-6 sm:px-8 sm:pb-8 sm:pt-7">
            <div className="min-w-0 pr-8">
              <DialogTitle asChild>
                <h1 className="text-[16px] font-medium leading-none text-[var(--color-text-primary)]">
                  Deactivate 2FA first
                </h1>
              </DialogTitle>
              <DialogDescription asChild>
                <p className="mt-1.5 text-[13px] leading-snug text-[var(--color-text-muted)]">
                  Turn off your active verification method before disabling withdraw protection.
                </p>
              </DialogDescription>
            </div>

            <footer className="mt-6 flex shrink-0">
              <Button
                type="button"
                onClick={handleClose}
                className={cn(SETTINGS_CTA_BUTTON_CLASS, "w-full")}
              >
                OK
              </Button>
            </footer>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
