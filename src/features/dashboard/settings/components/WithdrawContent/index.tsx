"use client";

import React from "react";
import {
  ArrowUpRight,
  Check,
  Copy,
  KeyRound,
  Layers,
  MessageSquare,
  ShieldAlert,
  Smartphone,
  Usb,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { SettingsSection } from "@/components/settings-section";
import { Switch } from "@/components/ui/switch";
import { SettingsGlassPicker } from "../SettingsGlassPicker";
import { cn } from "@/lib/utils";
import {
  useWithdrawSettings,
  WITHDRAW_PROTOCOL_OPTIONS,
  type Withdraw2FAMethod,
} from "./hooks/useWithdrawSettings";
import { Withdraw2FASetupModal } from "./components/Withdraw2FASetupModal";
import { Withdraw2FADeactivateModal } from "./components/Withdraw2FADeactivateModal";
import { Require2FADisableBlockedModal } from "./components/Require2FADisableBlockedModal";
import { SETTINGS_ROW_STACK_CLASS } from "@/features/dashboard/settings/settingsStyles";

const ROW_ICON_CLASS =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-white/[0.04] text-white [&_svg]:h-5 [&_svg]:w-5";

const METHOD_META: Record<
  Withdraw2FAMethod,
  {
    title: string;
    description: string;
    icon: React.ReactNode;
    comingSoon?: boolean;
  }
> = {
  hardware: {
    title: "Hardware security key",
    description: "YubiKey or FIDO2 key - strongest protection, human must be present.",
    icon: <Usb />,
    comingSoon: true,
  },
  authenticator: {
    title: "Authenticator app",
    description: "Authy, Google Authenticator, or any TOTP app.",
    icon: <Smartphone />,
  },
  sms: {
    title: "SMS verification",
    description: "One-time codes sent to your mobile number.",
    icon: <MessageSquare />,
  },
};

function Withdraw2FAMethodRow({
  method,
  active,
  configureLocked,
  onConfigure,
  onDeactivate,
}: {
  method: Withdraw2FAMethod;
  active: boolean;
  configureLocked: boolean;
  onConfigure: () => void;
  onDeactivate: () => void;
}) {
  const meta = METHOD_META[method];

  return (
    <div
      className={cn(
        "rounded-[20px] border p-4 transition-all duration-300",
        active
          ? "border-[var(--color-primary)]/40 bg-[var(--color-primary)]/[0.08]"
          : "border-transparent bg-white/[0.04] hover:bg-white/5"
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 items-start gap-4">
          <div
            className={cn(
              ROW_ICON_CLASS,
              active && "text-[var(--color-primary)]"
            )}
          >
            {meta.icon}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-[14px] font-medium text-[var(--color-text-primary)]">
                {meta.title}
              </h4>
            </div>
            <p className="mt-1 text-[12px] text-[var(--color-text-muted)]">{meta.description}</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center">
          {active ? (
            <button
              type="button"
              onClick={onDeactivate}
              className="inline-flex h-9 items-center justify-center rounded-[10px] border-none bg-[var(--color-cta-button-bg)] px-3 text-[11px] font-medium text-white transition-colors hover:bg-[var(--color-cta-button-bg-hover)]"
            >
              Deactivate
            </button>
          ) : meta.comingSoon ? (
            <span className="inline-flex h-9 items-center justify-center rounded-[10px] border border-transparent bg-white/5 px-3 text-[11px] font-medium text-[var(--color-text-muted)]">
              Coming Soon
            </span>
          ) : (
            <button
              type="button"
              onClick={onConfigure}
              disabled={configureLocked}
              className={cn(
                "inline-flex h-9 items-center justify-center rounded-[10px] border border-transparent px-3 text-[11px] font-medium transition-colors",
                configureLocked
                  ? "cursor-not-allowed bg-white/[0.04] text-[var(--color-text-muted)] opacity-40"
                  : "bg-white/5 text-[var(--color-primary)] hover:bg-white/10"
              )}
            >
              Configure
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function WithdrawContent() {
  const {
    settings,
    isSaving,
    hasActive2FA,
    saveAddress,
    saveProtocol,
    setRequire2FA,
    configure2FAMethod,
    remove2FAMethod,
    active2FAMethod,
  } = useWithdrawSettings();

  const [addressDraft, setAddressDraft] = React.useState(settings.address);
  const [addressSaved, setAddressSaved] = React.useState(false);
  const [addressCopied, setAddressCopied] = React.useState(false);
  const [setupMethod, setSetupMethod] = React.useState<Withdraw2FAMethod | null>(null);
  const [deactivateMethod, setDeactivateMethod] = React.useState<Withdraw2FAMethod | null>(null);
  const [require2FABlockedOpen, setRequire2FABlockedOpen] = React.useState(false);

  React.useEffect(() => {
    setAddressDraft(settings.address);
  }, [settings.address]);

  const handleSaveAddress = () => {
    saveAddress(addressDraft.trim());
    setAddressSaved(true);
    window.setTimeout(() => setAddressSaved(false), 2000);
  };

  const handleCopyAddress = () => {
    const value = addressDraft.trim();
    if (!value) return;
    navigator.clipboard.writeText(value);
    setAddressCopied(true);
    window.setTimeout(() => setAddressCopied(false), 2000);
  };

  const protectionWarning = settings.require2FA && !hasActive2FA;

  const handleRequire2FAToggle = () => {
    if (settings.require2FA && hasActive2FA) {
      setRequire2FABlockedOpen(true);
      return;
    }
    setRequire2FA(!settings.require2FA);
  };

  return (
    <div className="space-y-8">
      <SettingsSection
        title="Withdraw"
        description="Withdraw destination and account protection"
        icon={<ArrowUpRight className="h-5 w-5" />}
      >
        <div className={SETTINGS_ROW_STACK_CLASS}>
          <div className="rounded-[20px] bg-white/[0.04] p-4 transition-all duration-300 hover:bg-white/5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 flex-1 items-start gap-4">
                <div className={ROW_ICON_CLASS}>
                  <Layers />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="text-[14px] font-medium text-[var(--color-text-primary)]">
                    Withdraw protocol
                  </h4>
                  <p className="mt-1 text-[12px] text-[var(--color-text-muted)]">
                    Network used to settle withdrawals to your address.
                  </p>
                </div>
              </div>
              <SettingsGlassPicker
                value={settings.protocol}
                onValueChange={(value) => saveProtocol(value as typeof settings.protocol)}
                options={WITHDRAW_PROTOCOL_OPTIONS}
                triggerClassName="w-full sm:w-56"
                ariaLabel="Select withdraw protocol"
              />
            </div>
          </div>

          <div className="rounded-[20px] bg-white/[0.04] p-4 transition-all duration-300 hover:bg-white/5">
            <div className="flex flex-col gap-4">
              <div className="flex min-w-0 items-start gap-4">
                <div className={ROW_ICON_CLASS}>
                  <ArrowUpRight />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="text-[14px] font-medium text-[var(--color-text-primary)]">
                    Withdraw address
                  </h4>
                  <p className="mt-1 text-[12px] text-[var(--color-text-muted)]">
                    Default destination for card balance withdrawals and account closures.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 pl-[60px]">
                <div className="relative min-w-0 flex-1">
                  <input
                    value={addressDraft}
                    onChange={(e) => {
                      setAddressDraft(e.target.value);
                      setAddressSaved(false);
                    }}
                    spellCheck={false}
                    autoComplete="off"
                    className="h-11 w-full rounded-[12px] border border-transparent bg-white/[0.04] py-0 pl-3 pr-10 font-mono text-[15px] tracking-tight text-[var(--color-text-primary)] outline-none transition-all focus:border-white/20 focus:bg-white/[0.05]"
                  />
                  <button
                    type="button"
                    onClick={handleCopyAddress}
                    disabled={!addressDraft.trim()}
                    className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-[8px] text-[var(--color-text-muted)] transition-colors hover:bg-white/10 hover:text-[var(--color-text-primary)] disabled:pointer-events-none disabled:opacity-40"
                    title="Copy address"
                  >
                    <AnimatePresence mode="wait">
                      {addressCopied ? (
                        <motion.div
                          key="check"
                          initial={{ scale: 0.8, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0.8, opacity: 0 }}
                        >
                          <Check className="h-3.5 w-3.5 text-[var(--color-success)]" strokeWidth={2.5} />
                        </motion.div>
                      ) : (
                        <motion.div
                          key="copy"
                          initial={{ scale: 0.8, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0.8, opacity: 0 }}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleSaveAddress}
                  disabled={isSaving || !addressDraft.trim()}
                  className={cn(
                    "flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] transition-all duration-300",
                    addressSaved
                      ? "bg-[var(--color-success)] text-white"
                      : "bg-white/[0.04] text-[var(--color-text-muted)] hover:bg-white/10"
                  )}
                  title="Save address"
                >
                  <Check className="h-4 w-4" strokeWidth={3} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Withdraw protection"
        description="Require human verification for maximum security"
        icon={<ShieldAlert className="h-5 w-5" />}
        actions={
          protectionWarning ? (
            <span className="inline-flex h-9 items-center justify-center whitespace-nowrap rounded-[10px] bg-amber-400/10 px-3 text-[11px] font-medium text-amber-200/90">
              2FA is not configured
            </span>
          ) : null
        }
      >
        <div className={SETTINGS_ROW_STACK_CLASS}>
          <div className="flex flex-col gap-4 rounded-[20px] border border-transparent bg-white/[0.04] p-4 transition-all duration-300 hover:bg-white/5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 flex-1 items-start gap-4">
              <div className={ROW_ICON_CLASS}>
                <KeyRound />
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="text-[14px] font-medium text-[var(--color-text-primary)]">
                  Require 2FA for withdrawls
                </h4>
                <p className="mt-1 text-[12px] text-[var(--color-text-muted)]">
                  Address and protocol updates must pass verification before they take effect.
                </p>
              </div>
            </div>
            <Switch
              checked={settings.require2FA}
              onChange={handleRequire2FAToggle}
              size="sm"
            />
          </div>

          <div className={cn(SETTINGS_ROW_STACK_CLASS, "pl-[60px]")}>
            {(Object.keys(METHOD_META) as Withdraw2FAMethod[]).map((method) => (
              <Withdraw2FAMethodRow
                key={method}
                method={method}
                active={settings.configured2FA[method]}
                configureLocked={active2FAMethod !== null && active2FAMethod !== method}
                onConfigure={() => setSetupMethod(method)}
                onDeactivate={() => setDeactivateMethod(method)}
              />
            ))}
          </div>
        </div>
      </SettingsSection>

      <Withdraw2FASetupModal
        method={setupMethod}
        open={setupMethod !== null}
        onOpenChange={(open) => {
          if (!open) setSetupMethod(null);
        }}
        onConfirm={() => {
          if (setupMethod) configure2FAMethod(setupMethod);
        }}
      />

      <Require2FADisableBlockedModal
        open={require2FABlockedOpen}
        onOpenChange={setRequire2FABlockedOpen}
      />

      <Withdraw2FADeactivateModal
        method={deactivateMethod}
        open={deactivateMethod !== null}
        onOpenChange={(open) => {
          if (!open) setDeactivateMethod(null);
        }}
        onConfirm={() => {
          if (deactivateMethod) remove2FAMethod(deactivateMethod);
        }}
      />
    </div>
  );
}
