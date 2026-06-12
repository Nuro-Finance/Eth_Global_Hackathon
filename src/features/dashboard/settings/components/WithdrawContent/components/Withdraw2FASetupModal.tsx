"use client";

import React from "react";
import { MessageSquare, Usb, X } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  FORM_MODAL_SHELL_CLASS,
  FULL_MODAL_OVERLAY_CLASS,
} from "@/components/ui/modalPresets";
import { cn } from "@/lib/utils";
import type { Withdraw2FAMethod } from "../hooks/useWithdrawSettings";
import {
  SETTINGS_INPUT_CLASS,
  SETTINGS_LABEL_CLASS,
  SETTINGS_SECTION_ICON_CLASS,
  SETTINGS_CTA_BUTTON_CLASS,
} from "@/features/dashboard/settings/settingsStyles";
import { Button } from "@/components/ui/button";
import { AuthenticatorSetupModal } from "./AuthenticatorSetupModal";

const MODAL_INNER_CLASS =
  "relative flex w-full flex-col overflow-hidden rounded-[26px] border !backdrop-blur-none";

const MODAL_INNER_STYLE = {
  backgroundColor: "rgba(255, 255, 255, 0.04)",
  borderColor: "rgba(255, 255, 255, 0.03)",
  borderWidth: "1px",
  borderStyle: "solid" as const,
};

const MODAL_CONTENT_CLASS = "flex flex-col px-6 pb-8 pt-6 sm:px-8 sm:pb-8 sm:pt-7";

const MODAL_FOOTER_CLASS = "mt-6 flex shrink-0 items-center justify-end";

function TwoFASetupModalHeader({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex shrink-0 items-start gap-3 pr-8">
      <div className={SETTINGS_SECTION_ICON_CLASS}>{icon}</div>
      <div className="min-w-0 flex-1">
        <DialogTitle asChild>
          <h1 className="text-[16px] font-medium leading-none text-[var(--color-text-primary)]">
            {title}
          </h1>
        </DialogTitle>
        <DialogDescription asChild>
          <p className="mt-1.5 text-[13px] leading-snug text-[var(--color-text-muted)]">
            {description}
          </p>
        </DialogDescription>
      </div>
    </div>
  );
}

const MODAL_INPUT_CLASS = cn(
  SETTINGS_INPUT_CLASS,
  "border border-transparent focus:border-white/20"
);

interface Withdraw2FASetupModalProps {
  method: Withdraw2FAMethod | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

function HardwareSetupModal({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const handleClose = () => onOpenChange(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm();
    handleClose();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) handleClose();
      }}
    >
      <DialogContent
        hideClose
        overlayClassName={FULL_MODAL_OVERLAY_CLASS}
        className={cn(FORM_MODAL_SHELL_CLASS, "!z-[120]", "!max-w-md")}
        style={{
          backgroundColor: "rgba(255, 255, 255, 0.02)",
          borderColor: "rgba(255, 255, 255, 0.03)",
          borderWidth: "1px",
          borderStyle: "solid",
        }}
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

          <div className="flex flex-col items-center px-6 pb-8 pt-6 text-center sm:px-8 sm:pb-8 sm:pt-7">
            <div className={SETTINGS_SECTION_ICON_CLASS}>
              <Usb />
            </div>
            <DialogTitle asChild>
              <h1 className="mt-4 w-full text-[16px] font-medium leading-none text-[var(--color-text-primary)]">
                Hardware security key
              </h1>
            </DialogTitle>
            <DialogDescription asChild>
              <p className="mt-1.5 w-full text-[13px] leading-snug text-[var(--color-text-muted)]">
                Insert your security key and follow
                <br />
                the browser prompt.
              </p>
            </DialogDescription>

            <form onSubmit={handleSubmit} className="mt-6 w-full">
              <Button type="submit" className={cn(SETTINGS_CTA_BUTTON_CLASS, "w-full")}>
                Register key
              </Button>
            </form>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SmsSetupModal({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const [phone, setPhone] = React.useState("");
  const [code, setCode] = React.useState("");
  const [codeSent, setCodeSent] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setPhone("");
      setCode("");
      setCodeSent(false);
    }
  }, [open]);

  const handleClose = () => onOpenChange(false);
  const canSubmit = codeSent && code.length === 6;

  const handleSendCode = () => {
    if (phone.trim().length < 8) return;
    setCodeSent(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    onConfirm();
    handleClose();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) handleClose();
      }}
    >
      <DialogContent
        hideClose
        overlayClassName={FULL_MODAL_OVERLAY_CLASS}
        className={cn(FORM_MODAL_SHELL_CLASS, "!z-[120]", "!max-w-md")}
        style={{
          backgroundColor: "rgba(255, 255, 255, 0.02)",
          borderColor: "rgba(255, 255, 255, 0.03)",
          borderWidth: "1px",
          borderStyle: "solid",
        }}
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

          <div className={MODAL_CONTENT_CLASS}>
            <TwoFASetupModalHeader
              icon={<MessageSquare />}
              title="SMS verification"
              description="Enter your phone number and code."
            />

            <form onSubmit={handleSubmit} className="mt-5 flex flex-col">
              <div className="flex flex-col gap-4">
                <div>
                  <label htmlFor="sms-phone" className={SETTINGS_LABEL_CLASS}>
                    Phone number
                  </label>
                  <input
                    id="sms-phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+1 (555) 000-0000"
                    className={MODAL_INPUT_CLASS}
                    autoComplete="tel"
                  />
                </div>
                <div>
                  <label htmlFor="sms-code" className={SETTINGS_LABEL_CLASS}>
                    Verification code
                  </label>
                  <input
                    id="sms-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="000000"
                    disabled={!codeSent}
                    className={cn(
                      MODAL_INPUT_CLASS,
                      "text-center font-mono tracking-[0.3em] disabled:opacity-40"
                    )}
                  />
                </div>
              </div>

              <div className="mt-6 w-full shrink-0">
                {!codeSent ? (
                  <Button
                    type="button"
                    onClick={handleSendCode}
                    disabled={phone.trim().length < 8}
                    className={cn(SETTINGS_CTA_BUTTON_CLASS, "w-full")}
                  >
                    Send code
                  </Button>
                ) : (
                  <Button type="submit" disabled={!canSubmit} className={cn(SETTINGS_CTA_BUTTON_CLASS, "w-full")}>
                    Enable
                  </Button>
                )}
              </div>
            </form>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function Withdraw2FASetupModal({
  method,
  open,
  onOpenChange,
  onConfirm,
}: Withdraw2FASetupModalProps) {
  if (!method) return null;

  if (method === "authenticator") {
    return (
      <AuthenticatorSetupModal
        open={open}
        onOpenChange={onOpenChange}
        onConfirm={onConfirm}
      />
    );
  }

  if (method === "hardware") {
    return (
      <HardwareSetupModal open={open} onOpenChange={onOpenChange} onConfirm={onConfirm} />
    );
  }

  return <SmsSetupModal open={open} onOpenChange={onOpenChange} onConfirm={onConfirm} />;
}
