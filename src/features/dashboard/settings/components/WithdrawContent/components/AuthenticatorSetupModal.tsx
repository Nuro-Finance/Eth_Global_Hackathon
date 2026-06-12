"use client";

import React from "react";
import { Copy, Check, Smartphone, X } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import QRCode from "qrcode";
import { cn } from "@/lib/utils";
import { useAppSession } from "@/hooks/useAppSession";
import {
  SETTINGS_INPUT_CLASS,
  SETTINGS_LABEL_CLASS,
  SETTINGS_SECTION_ICON_CLASS,
  SETTINGS_CTA_BUTTON_CLASS,
} from "@/features/dashboard/settings/settingsStyles";

const QR_WHITE_BOX_PX = 168;
const QR_PATTERN_PX = 140;

const AUTHENTICATOR_MODAL_INNER_CLASS =
  "relative flex w-full flex-col overflow-hidden rounded-[26px] border !backdrop-blur-none";

const MODAL_INPUT_CLASS = cn(
  SETTINGS_INPUT_CLASS,
  "border border-transparent focus:border-white/20"
);

const QR_GENERATE_OPTIONS: QRCode.QRCodeToDataURLOptions = {
  width: QR_PATTERN_PX,
  margin: 2,
  color: {
    dark: "#000000",
    light: "#FFFFFF",
  },
  errorCorrectionLevel: "M",
};

function generateBase32Secret(length = 16) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function buildTotpUri(secret: string, account: string) {
  const label = encodeURIComponent(`Nuro:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=Nuro`;
}

interface AuthenticatorSetupModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function AuthenticatorSetupModal({
  open,
  onOpenChange,
  onConfirm,
}: AuthenticatorSetupModalProps) {
  const { data: session } = useAppSession();
  const account = session?.user?.email ?? "user@nuro.finance";

  const [secret, setSecret] = React.useState("");
  const [qrDataUrl, setQrDataUrl] = React.useState<string | null>(null);
  const [qrLoaded, setQrLoaded] = React.useState(false);
  const [code, setCode] = React.useState("");
  const [secretCopied, setSecretCopied] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    const nextSecret = generateBase32Secret();
    setSecret(nextSecret);
    setCode("");
    setSecretCopied(false);
    setQrDataUrl(null);
    setQrLoaded(false);

    QRCode.toDataURL(buildTotpUri(nextSecret, account), QR_GENERATE_OPTIONS)
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, [open, account]);

  const handleClose = () => onOpenChange(false);
  const canSubmit = code.length === 6;

  const handleCopySecret = () => {
    if (!secret) return;
    navigator.clipboard.writeText(secret);
    setSecretCopied(true);
    window.setTimeout(() => setSecretCopied(false), 2000);
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
        <div className={AUTHENTICATOR_MODAL_INNER_CLASS}
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

          <div className="flex flex-col px-6 pb-8 pt-6 sm:px-8 sm:pb-8 sm:pt-7">
            <div className="flex shrink-0 items-start gap-3 pr-8">
              <div className={SETTINGS_SECTION_ICON_CLASS}>
                <Smartphone />
              </div>
              <div className="min-w-0 flex-1">
                <DialogTitle asChild>
                  <h1 className="text-[16px] font-medium leading-none text-[var(--color-text-primary)]">
                    Authenticator app
                  </h1>
                </DialogTitle>
                <DialogDescription asChild>
                  <p className="mt-1.5 text-[13px] leading-snug text-[var(--color-text-muted)]">
                    Scan the QR code to authenticate
                  </p>
                </DialogDescription>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="mt-5 flex flex-col" autoComplete="off">
              <div className="flex flex-col items-center gap-4">
                {!qrDataUrl ? (
                  <div
                    className="shrink-0 animate-pulse rounded-[20px] bg-white/[0.04]"
                    style={{ width: QR_WHITE_BOX_PX, height: QR_WHITE_BOX_PX }}
                  />
                ) : (
                  <div
                    className="relative isolate shrink-0 overflow-visible rounded-[22px]"
                    style={{ width: QR_WHITE_BOX_PX, height: QR_WHITE_BOX_PX }}
                  >
                    <div
                      className={cn(
                        "relative z-[1] overflow-hidden rounded-[20px] bg-white transition-[opacity,transform] duration-500 ease-out",
                        qrLoaded ? "scale-100 opacity-100" : "scale-95 opacity-0"
                      )}
                      style={{ width: QR_WHITE_BOX_PX, height: QR_WHITE_BOX_PX }}
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
                            src={qrDataUrl}
                            alt="Authenticator QR code"
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

                <div className="w-full">
                  <p className={SETTINGS_LABEL_CLASS}>Setup key</p>
                  <div className="flex items-center gap-2">
                    <code className="min-w-0 flex-1 truncate rounded-[12px] bg-white/[0.04] px-3 py-2.5 font-mono text-[12px] text-[var(--color-text-primary)]">
                      {secret || "Generating..."}
                    </code>
                    <button
                      type="button"
                      onClick={handleCopySecret}
                      disabled={!secret}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-white/[0.04] text-[var(--color-text-muted)] transition-colors hover:bg-white/10 hover:text-[var(--color-text-primary)] disabled:opacity-40"
                      title="Copy setup key"
                    >
                      {secretCopied ? (
                        <Check className="h-4 w-4 text-[var(--color-success)]" strokeWidth={2.5} />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="w-full pb-1">
                  <label htmlFor="authenticator-verification-code" className={SETTINGS_LABEL_CLASS}>
                    Verification code
                  </label>
                  <input
                    id="authenticator-verification-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="000000"
                    className={cn(MODAL_INPUT_CLASS, "text-center font-mono tracking-[0.3em]")}
                  />
                </div>
              </div>

              <footer className="mt-6 w-full shrink-0">
                <Button type="submit" disabled={!canSubmit} className={cn(SETTINGS_CTA_BUTTON_CLASS, "w-full")}>
                  Enable
                </Button>
              </footer>
            </form>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
