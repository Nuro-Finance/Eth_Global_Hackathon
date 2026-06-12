"use client";

import { useCallback } from "react";
import { X } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { FORM_MODAL_SHELL_CLASS } from "@/components/ui/modalPresets";
import { cn } from "@/lib/utils";
import { ForgotPasswordRecoveryPanel } from "@/features/auth/components/LoginForm/components/ForgotPasswordRecoveryPanel";

interface ForgotPasswordModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultEmail?: string;
}

/** Auth forgot-password panel inside the app form-modal shell (Report Issue style). */
const FORGOT_MODAL_INNER_CLASS =
  "relative flex h-[528px] w-full min-h-[528px] max-h-[528px] flex-col overflow-hidden rounded-[26px] border !backdrop-blur-none";

export function ForgotPasswordModal({
  open,
  onOpenChange,
  defaultEmail = "",
}: ForgotPasswordModalProps) {
  const handleClose = useCallback(() => onOpenChange(false), [onOpenChange]);

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
        className={cn(FORM_MODAL_SHELL_CLASS, "!max-w-md")}
        style={{
          backgroundColor: "rgba(255, 255, 255, 0.02)",
          borderColor: "rgba(255, 255, 255, 0.03)",
          borderWidth: "1px",
          borderStyle: "solid",
        }}
      >
        <div
          className={FORGOT_MODAL_INNER_CLASS}
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
                "focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/25"
              )}
              aria-label="Close"
            >
              <X className="h-full w-full" strokeWidth={2} />
            </button>
          </DialogClose>

          <DialogTitle className="sr-only">Reset Password</DialogTitle>
          <DialogDescription className="sr-only">
            Enter your email address to receive a recovery link.
          </DialogDescription>

          <div className="flex h-full min-h-0 flex-col overflow-hidden p-10">
            {open ? (
              <ForgotPasswordRecoveryPanel
                includeCardShell={false}
                onDismiss={handleClose}
                dismissLabel="Cancel"
                sentBackLabel="Back to settings"
                defaultEmail={defaultEmail}
              />
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
