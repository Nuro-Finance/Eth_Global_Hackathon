"use client";

import React from "react";
import { MessageSquare, Smartphone, Usb, X } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { FORM_MODAL_SHELL_CLASS, FULL_MODAL_OVERLAY_CLASS } from "@/components/ui/modalPresets";
import { cn } from "@/lib/utils";
import type { Withdraw2FAMethod } from "../hooks/useWithdrawSettings";
import {
  SETTINGS_INPUT_CLASS,
  SETTINGS_LABEL_CLASS,
  SETTINGS_SECTION_ICON_CLASS,
  SETTINGS_CTA_BUTTON_CLASS,
} from "@/features/dashboard/settings/settingsStyles";
import { Button } from "@/components/ui/button";

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

const MODAL_CONTENT_CLASS = "flex flex-col px-6 pb-8 pt-6 sm:px-8 sm:pb-8 sm:pt-7";

const MODAL_FOOTER_CLASS = "mt-6 flex shrink-0 items-center justify-end";

const MODAL_INPUT_CLASS = cn(
  SETTINGS_INPUT_CLASS,
  "border border-transparent focus:border-white/20"
);

function TwoFADeactivateModalHeader({
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

function ModalCloseButton() {
  return (
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
  );
}

function OtpInput({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className={SETTINGS_LABEL_CLASS}>
        Verification code
      </label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="000000"
        autoFocus
        disabled={disabled}
        className={cn(
          MODAL_INPUT_CLASS,
          "text-center font-mono tracking-[0.3em]",
          disabled && "opacity-40"
        )}
      />
    </div>
  );
}

function DeactivateModalShell({
  open,
  onOpenChange,
  maxWidthClass,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  maxWidthClass: string;
  children: React.ReactNode;
}) {
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
        overlayClassName={FULL_MODAL_OVERLAY_CLASS}
        className={cn(FORM_MODAL_SHELL_CLASS, "!z-[120]", maxWidthClass)}
        style={MODAL_SHELL_STYLE}
      >
        <div className={MODAL_INNER_CLASS} style={MODAL_INNER_STYLE}>
          <ModalCloseButton />
          <div className={MODAL_CONTENT_CLASS}>{children}</div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AuthenticatorDeactivateModal({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const [code, setCode] = React.useState("");

  React.useEffect(() => {
    if (open) setCode("");
  }, [open]);

  const canSubmit = code.length === 6;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    onConfirm();
    onOpenChange(false);
  };

  return (
    <DeactivateModalShell open={open} onOpenChange={onOpenChange} maxWidthClass="!max-w-md">
      <TwoFADeactivateModalHeader
        icon={<Smartphone />}
        title="Deactivate authenticator"
        description="Enter the code from your authenticator app."
      />
      <form onSubmit={handleSubmit} className="mt-5 flex flex-col">
        <OtpInput id="deactivate-authenticator-code" value={code} onChange={setCode} />
        <div className={MODAL_FOOTER_CLASS}>
          <Button type="submit" disabled={!canSubmit} className={SETTINGS_CTA_BUTTON_CLASS}>
            Deactivate
          </Button>
        </div>
      </form>
    </DeactivateModalShell>
  );
}

function SmsDeactivateModal({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const [code, setCode] = React.useState("");
  const [codeSent, setCodeSent] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setCode("");
      setCodeSent(false);
    }
  }, [open]);

  const canSubmit = codeSent && code.length === 6;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    onConfirm();
    onOpenChange(false);
  };

  return (
    <DeactivateModalShell open={open} onOpenChange={onOpenChange} maxWidthClass="!max-w-md">
      <TwoFADeactivateModalHeader
        icon={<MessageSquare />}
        title="Deactivate SMS verification"
        description="Enter the code sent to your mobile number."
      />
      <form onSubmit={handleSubmit} className="mt-5 flex flex-col">
        <OtpInput
          id="deactivate-sms-code"
          value={code}
          onChange={setCode}
          disabled={!codeSent}
        />
        <div className={MODAL_FOOTER_CLASS}>
          {!codeSent ? (
            <Button
              type="button"
              onClick={() => setCodeSent(true)}
              className={SETTINGS_CTA_BUTTON_CLASS}
            >
              Send code
            </Button>
          ) : (
            <Button type="submit" disabled={!canSubmit} className={SETTINGS_CTA_BUTTON_CLASS}>
              Deactivate
            </Button>
          )}
        </div>
      </form>
    </DeactivateModalShell>
  );
}

function HardwareDeactivateModal({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm();
    onOpenChange(false);
  };

  return (
    <DeactivateModalShell open={open} onOpenChange={onOpenChange} maxWidthClass="!max-w-sm">
      <TwoFADeactivateModalHeader
        icon={<Usb />}
        title="Deactivate security key"
        description="Insert your security key and follow the browser prompt."
      />
      <form onSubmit={handleSubmit} className="mt-6">
        <div className={MODAL_FOOTER_CLASS}>
          <Button type="submit" className={SETTINGS_CTA_BUTTON_CLASS}>
            Verify and deactivate
          </Button>
        </div>
      </form>
    </DeactivateModalShell>
  );
}

interface Withdraw2FADeactivateModalProps {
  method: Withdraw2FAMethod | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function Withdraw2FADeactivateModal({
  method,
  open,
  onOpenChange,
  onConfirm,
}: Withdraw2FADeactivateModalProps) {
  if (!method) return null;

  if (method === "authenticator") {
    return (
      <AuthenticatorDeactivateModal open={open} onOpenChange={onOpenChange} onConfirm={onConfirm} />
    );
  }

  if (method === "hardware") {
    return (
      <HardwareDeactivateModal open={open} onOpenChange={onOpenChange} onConfirm={onConfirm} />
    );
  }

  return <SmsDeactivateModal open={open} onOpenChange={onOpenChange} onConfirm={onConfirm} />;
}
