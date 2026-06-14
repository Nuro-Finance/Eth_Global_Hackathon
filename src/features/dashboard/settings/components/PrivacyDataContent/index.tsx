"use client";
import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Trash2,
  ExternalLink,
  Key,
  AlertCircle,
  ChevronRight,
  Shield,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
import SettingsSection, { SettingsSectionHeader } from "@/components/settings-section";
import SettingRow from "../SettingRow";
import { ReloadFlowTokenHero, reloadFlowHeroStyles } from "@/features/dashboard/my-card-1/components/ReloadFlow";
import {
  getPersistedWithdrawAddress,
} from "@/features/dashboard/settings/components/WithdrawContent/hooks/useWithdrawSettings";
import { useAppSession } from "@/hooks/useAppSession";
import { useAppLogout } from "@/hooks/useAppLogout";
import { clearAccountClientState } from "@/lib/clear-account-client-state";
import { cn } from "@/lib/utils";
const DELETE_MODAL_ICON_CLASS =
  "mx-auto mb-5 flex h-14 w-14 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-error)]/15 bg-[var(--color-error)]/10 text-[var(--color-error)]";

const DELETE_ACCOUNT_MODAL_INNER_CLASS =
  "relative flex h-[475px] w-full min-h-[475px] max-h-[475px] flex-col overflow-hidden rounded-[26px] border !backdrop-blur-none";

const DELETE_ACCOUNT_MODAL_SHELL_STYLE = {
  backgroundColor: "rgba(255, 255, 255, 0.02)",
  borderColor: "rgba(255, 255, 255, 0.03)",
  borderWidth: "1px",
  borderStyle: "solid",
} as const;

const DELETE_ACCOUNT_MODAL_INNER_STYLE = {
  backgroundColor: "rgba(255, 255, 255, 0.04)",
  borderColor: "rgba(255, 255, 255, 0.03)",
  borderWidth: "1px",
  borderStyle: "solid",
} as const;

function isValidEthAddress(addr: string): boolean {
  return (
    addr.startsWith("0x") &&
    addr.length === 42 &&
    /^0x[a-fA-F0-9]{40}$/.test(addr)
  );
}

async function fetchRealAccountBalance(token: string): Promise<number> {
  const res = await fetch("/api/cards", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return 0;
  const data = await res.json();
  const rawCards = (Array.isArray(data) ? data : data.cards || []) as Record<string, unknown>[];
  const isReal = (c: Record<string, unknown>) => {
    if ("isIssuerLinked" in c) return Boolean(c.isIssuerLinked);
    if ("issuer_card_id" in c) return c.issuer_card_id != null;
    return true;
  };
  return rawCards
    .filter(isReal)
    .reduce(
      (sum, c) => sum + (parseFloat(String(c.balance ?? 0)) || 0),
      0,
    );
}

const ConfirmDeleteModal = ({
  open,
  onOpenChange,
  balance,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  balance: number;
}) => {
  const { data: session } = useAppSession();
  const logout = useAppLogout();

  const hasWithdrawableBalance = balance > 0;
  const [address, setAddress] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [isProcessing, setIsProcessing] = useState(true);
  const [deleteError, setDeleteError] = useState("");
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState(30);
  const deleteStartedRef = useRef(false);

  const formattedBalance = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(balance);

  const finishDelete = useCallback(async () => {
    clearAccountClientState(session?.user?.id);
    await logout();
  }, [logout, session?.user?.id]);

 // Countdown logic for the final completion state
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (open && step === 2 && !isProcessing && !deleteError && countdown > 0) {
      timer = setInterval(() => {
        setCountdown((prev) => prev - 1);
      }, 1000);
    } else if (countdown === 0 && open && step === 2 && !isProcessing && !deleteError) {
      void finishDelete();
    }
    return () => clearInterval(timer);
  }, [open, step, isProcessing, countdown, deleteError, finishDelete]);

  useEffect(() => {
    if (!open) {
      deleteStartedRef.current = false;
      const timer = setTimeout(() => {
        setStep(0);
        setIsEditing(false);
        setError("");
        setDeleteError("");
        setIsProcessing(true);
        setCountdown(30);
        setAddress("");
      }, 300);
      return () => clearTimeout(timer);
    }

    setAddress(getPersistedWithdrawAddress());
  }, [open]);

  const runAccountDeletion = useCallback(async (): Promise<boolean> => {
    const token = session?.accessToken;
    if (!token) {
      setDeleteError("Session expired. Please sign in again and retry.");
      return false;
    }

    try {
      const res = await fetch("/api/users/me", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setDeleteError(data.error ?? "Account deletion failed. Please try again.");
        return false;
      }
      return true;
    } catch {
      setDeleteError("Could not reach the server. Please try again.");
      return false;
    }
  }, [session?.accessToken]);

  const startDeletionStep = useCallback(() => {
    if (deleteStartedRef.current) return;
    deleteStartedRef.current = true;
    setStep(2);
    setIsProcessing(true);
    setDeleteError("");

    const minDelayMs = hasWithdrawableBalance ? 15000 : 2500;
    void (async () => {
      const [ok] = await Promise.all([
        runAccountDeletion(),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(true), minDelayMs)),
      ]);
      setIsProcessing(false);
      if (!ok) deleteStartedRef.current = false;
    })();
  }, [hasWithdrawableBalance, runAccountDeletion]);

  const handleWithdrawAndDelete = () => {
    if (hasWithdrawableBalance) {
      if (!isValidEthAddress(address)) {
        setError("Please supply a valid ETH format string (0x...)");
        return;
      }
    }
    setError("");
    startDeletionStep();
  };

  const renderStep0 = () => (
    <div className="flex flex-col text-left animate-in slide-in-from-right-4 fade-in duration-300 h-full">
      <div className={DELETE_MODAL_ICON_CLASS}>
        <AlertCircle className="h-7 w-7" strokeWidth={1.5} />
      </div>
      <DialogTitle className="text-[20px] font-semibold text-[var(--color-text-primary)] mb-2 tracking-tight text-center">
        Before you continue
      </DialogTitle>

      <div className="flex-1 overflow-y-auto pr-1 space-y-4 my-4">
        <div className="p-4 rounded-[16px] bg-white/[0.04] border border-white/5 space-y-3">
          <div className="flex gap-3">
            <Trash2 className="w-5 h-5 text-[var(--color-error)] shrink-0 mt-0.5" strokeWidth={1.5} />
            <p className="text-[13px] text-[var(--color-text-muted)] leading-relaxed">
              Your account and data will be <span className="text-[var(--color-text-primary)] font-medium">permanently deleted</span>.
              {hasWithdrawableBalance
                ? " Card balances will be sent to your withdrawal wallet."
                : " There is nothing to withdraw from your account."}
            </p>
          </div>
          <div className="flex gap-3">
            <Key className="w-5 h-5 text-[var(--color-warning)] shrink-0 mt-0.5" strokeWidth={1.5} />
            <p className="text-[13px] text-[var(--color-text-muted)] leading-relaxed">
              Ensure you have your <span className="text-[var(--color-text-primary)] font-medium">wallet private keys backed up</span>. You will lose access to this interface permanently after deletion.
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 w-full mt-auto shrink-0 px-1 pb-1">
        <button
          onClick={() => onOpenChange(false)}
          className="flex-1 px-4 py-2.5 rounded-[12px] bg-white/5 border border-white/10 text-[var(--color-text-muted)] hover:bg-white/10 hover:text-[var(--color-text-primary)] transition-all font-medium text-[14px]"
        >
          Cancel
        </button>
        <button
          onClick={() => setStep(1)}
          className="flex-1 px-4 py-2.5 rounded-[12px] bg-white/5 border border-white/10 text-[var(--color-text-primary)] hover:bg-white/10 hover:border-white/20 transition-all font-semibold text-[14px] flex items-center justify-center gap-1.5"
        >
          Continue <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );

  const renderStep1 = () => (
    <div className="flex flex-col text-left animate-in slide-in-from-right-4 fade-in duration-300 h-full">
      <div className={DELETE_MODAL_ICON_CLASS}>
        <Trash2 className="h-7 w-7" strokeWidth={1.5} />
      </div>
      <DialogTitle className="text-[20px] font-semibold text-[var(--color-text-primary)] mb-2 tracking-tight text-center">
        Final Confirmation
      </DialogTitle>
      <DialogDescription className="text-[14px] text-[var(--color-text-muted)] mb-8 leading-relaxed text-center px-2">
        {hasWithdrawableBalance ? (
          <>
            Your total balance of <span className="text-[var(--color-text-primary)] font-medium">{formattedBalance}</span> will be automatically withdrawn to your address. This action cannot be undone.
          </>
        ) : (
          <>
            Your account balance is <span className="text-[var(--color-text-primary)] font-medium">{formattedBalance}</span>. There is nothing to withdraw. Your account and all associated data will be permanently deleted. This action cannot be undone.
          </>
        )}
      </DialogDescription>

      <div className="mb-8 w-full">
        <div className="flex items-center justify-between mb-2.5 px-1">
          <label className="text-[11px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest">Withdrawal Address</label>
          <button
            onClick={() => setIsEditing(!isEditing)}
            className="text-[12px] text-white/50 hover:text-[var(--color-text-primary)] font-medium transition-colors outline-none"
          >
            {isEditing ? "Save" : address ? "Change" : "Add"}
          </button>
        </div>
        <div
          className={`flex items-center w-full px-3 py-2.5 bg-white/[0.02] border rounded-[12px] transition-all ${
            isEditing
              ? error
                ? "border-[var(--color-error)]/50 bg-[var(--color-error)]/5"
                : "border-white/30 bg-white/[0.05] shadow-[0_0_15px_rgba(255,255,255,0.03)]"
              : "border-white/10"
          }`}
        >
          <input
            type="text"
            value={address}
            onChange={(e) => {
              setAddress(e.target.value);
              if (error) setError("");
            }}
            readOnly={!isEditing}
            placeholder="0x..."
            className={`bg-transparent w-full outline-none text-[13px] font-mono transition-colors placeholder:text-white/30 ${
              isEditing ? "text-[var(--color-text-primary)]" : address ? "text-white/60" : "text-white/30"
            }`}
          />
        </div>
        {error && <div className="text-[var(--color-error)] text-[11.5px] mt-2 font-medium px-1 flex items-center gap-1.5 animate-in fade-in">{error}</div>}
      </div>

      <div className="flex items-center gap-3 w-full mt-auto shrink-0 px-1 pb-1">
        <button
          onClick={() => setStep(0)}
          className="flex-1 px-4 py-2.5 rounded-[12px] bg-white/5 border border-white/10 text-[var(--color-text-muted)] hover:bg-white/10 hover:text-[var(--color-text-primary)] transition-all font-medium text-[14px]"
        >
          Back
        </button>
        <button
          onClick={handleWithdrawAndDelete}
          className="flex-1 px-4 py-2.5 rounded-[12px] bg-[var(--color-error)]/10 border border-[var(--color-error)]/20 text-[var(--color-error)] hover:bg-[var(--color-error)]/20 transition-all font-semibold text-[14px] whitespace-nowrap"
        >
          {hasWithdrawableBalance ? "Withdraw & Delete" : "Delete Account"}
        </button>
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="flex flex-col items-center justify-center text-center py-2 animate-in slide-in-from-right-4 fade-in duration-300 w-full h-full">
      {deleteError ? (
        <div className="flex flex-col items-center w-full h-full animate-in fade-in zoom-in-95 duration-300">
          <div className={DELETE_MODAL_ICON_CLASS}>
            <AlertCircle className="h-7 w-7" strokeWidth={1.5} />
          </div>
          <DialogTitle className="text-[20px] font-semibold text-[var(--color-text-primary)] mb-2 tracking-tight shrink-0 text-center">
            Deletion failed
          </DialogTitle>
          <DialogDescription className="text-[14px] text-[var(--color-text-muted)] leading-relaxed px-2 shrink-0 max-w-[320px] text-center">
            {deleteError}
          </DialogDescription>
          <div className="w-full shrink-0 mt-auto">
            <button
              onClick={() => {
                deleteStartedRef.current = false;
                setDeleteError("");
                setStep(1);
              }}
              className="w-full px-4 py-3 rounded-[12px] bg-white/5 border border-white/10 text-[var(--color-text-primary)] hover:bg-white/10 transition-all font-semibold text-[14px]"
            >
              Back
            </button>
          </div>
        </div>
      ) : isProcessing ? (
        <div className="flex flex-col items-center w-full h-full animate-in fade-in zoom-in-95 duration-300">
          <style>{reloadFlowHeroStyles}</style>
          <style>{`
            @keyframes dot-animation {
              0%, 20% { opacity: 0; }
              40% { opacity: 1; }
              60% { opacity: 1; }
              80%, 100% { opacity: 0; }
            }
            .animate-dot-1 { animation: dot-animation 1.5s infinite 0s; }
            .animate-dot-2 { animation: dot-animation 1.5s infinite 0.3s; }
            .animate-dot-3 { animation: dot-animation 1.5s infinite 0.6s; }
          `}</style>
          <div className="flex flex-col items-center justify-center mb-0 mt-6 w-full shrink-0 h-20 relative">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 scale-[0.80] pointer-events-none">
              <ReloadFlowTokenHero selectedToken="USDC" pulse />
            </div>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center w-full">
            <DialogTitle className="text-[20px] font-semibold text-[var(--color-text-primary)] mb-2 tracking-tight shrink-0 text-center">
              {hasWithdrawableBalance ? "Withdraw in progress" : "Deleting your account"}
            </DialogTitle>
            <DialogDescription className="text-[14px] text-[var(--color-text-muted)] leading-relaxed px-2 shrink-0 max-w-[320px] text-center">
              {hasWithdrawableBalance ? (
                <>
                  Your balance of <span className="text-[var(--color-text-primary)] font-medium">{formattedBalance} USDC</span> is being withdrawn via smart contract. Your account will be permanently deleted once complete.
                </>
              ) : (
                <>We&apos;re removing your account and all associated data. This only takes a moment.</>
              )}
            </DialogDescription>

            {hasWithdrawableBalance && (
              <a href="#" className="flex items-center gap-1.5 mt-5 text-[13px] font-semibold text-[var(--color-primary)] hover:text-[var(--color-primary)]/80 transition-colors shrink-0">
                View on Block Explorer <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>

          <div className="w-full shrink-0">
            <button
              disabled
              className="w-full px-4 py-3 rounded-[12px] bg-white/5 border border-white/10 text-white font-semibold text-[14px] flex items-center justify-center gap-0.5 cursor-not-allowed"
            >
              Wait
              <span className="animate-dot-1">.</span>
              <span className="animate-dot-2">.</span>
              <span className="animate-dot-3">.</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center w-full h-full animate-in fade-in zoom-in-95 duration-300">
          <div className="flex flex-col items-center justify-center mb-0 mt-6 w-full shrink-0">
            <img src="/green-check.png" alt="Success" className="w-20 h-20 object-contain drop-shadow-[0_0_15px_rgba(16,185,129,0.2)]" draggable={false} />
          </div>

          <div className="flex-1 flex flex-col items-center justify-center w-full">
            <DialogTitle className="text-[20px] font-semibold text-[var(--color-text-primary)] mb-2 tracking-tight shrink-0 text-center">
              {hasWithdrawableBalance ? "Withdrawal Complete" : "Account deleted"}
            </DialogTitle>
            <DialogDescription className="text-[14px] text-[var(--color-text-muted)] leading-relaxed px-2 shrink-0 max-w-[320px] text-center">
              {hasWithdrawableBalance ? (
                <>
                  <span className="text-[var(--color-text-primary)] font-medium">{formattedBalance}</span> successfully withdrawn. Your account has been permanently deleted.
                </>
              ) : (
                <>Your Nuro account has been permanently deleted.</>
              )}
            </DialogDescription>

            {hasWithdrawableBalance && (
              <a href="#" className="flex items-center gap-1.5 mt-5 text-[13px] font-semibold text-[var(--color-primary)] hover:text-[var(--color-primary)]/80 transition-colors shrink-0">
                View on Block Explorer <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>

          <div className="w-full shrink-0">
            <button
              onClick={() => void finishDelete()}
              className="w-full px-4 py-3 rounded-[12px] bg-white/5 border border-white/10 text-[var(--color-text-primary)] hover:bg-[var(--color-error)]/10 hover:text-[var(--color-error)] hover:border-[var(--color-error)]/20 transition-all font-semibold text-[14px]"
            >
              Log Out In {countdown} seconds
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onOpenChange(false);
      }}
    >
      <DialogContent
        hideClose
        overlayClassName={FULL_MODAL_OVERLAY_CLASS}
        className={cn(FORM_MODAL_SHELL_CLASS, "!z-[120]", "!max-w-[420px]")}
        style={DELETE_ACCOUNT_MODAL_SHELL_STYLE}
      >
        <div
          className={DELETE_ACCOUNT_MODAL_INNER_CLASS}
          style={DELETE_ACCOUNT_MODAL_INNER_STYLE}
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

          <div className="flex h-full min-h-0 flex-col p-8 pb-6">
            <div className="flex min-h-0 w-full flex-1 flex-col justify-center">
              {step === 0 && renderStep0()}
              {step === 1 && renderStep1()}
              {step === 2 && renderStep2()}
            </div>

            <div className="mt-7 flex shrink-0 animate-in items-center justify-center gap-2 fade-in duration-300">
              <div
                className={`h-2 rounded-full transition-all duration-300 ${step === 0 ? "w-4 bg-white" : "w-2 bg-white/20"}`}
              />
              <div
                className={`h-2 rounded-full transition-all duration-300 ${step === 1 ? "w-4 bg-white" : "w-2 bg-white/20"}`}
              />
              <div
                className={`h-2 rounded-full transition-all duration-300 ${step === 2 ? "w-4 bg-white" : "w-2 bg-white/20"}`}
              />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default function PrivacyDataContent() {
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const { data: session } = useAppSession();
  const [deleteBalance, setDeleteBalance] = useState(0);

  useEffect(() => {
    if (!showDeleteModal) {
      setDeleteBalance(0);
      return;
    }

    const token = (session as { accessToken?: string } | null)?.accessToken;
    if (!token) {
      setDeleteBalance(0);
      return;
    }

    let cancelled = false;
    void fetchRealAccountBalance(token).then((balance) => {
      if (!cancelled) setDeleteBalance(balance);
    });
    return () => {
      cancelled = true;
    };
  }, [showDeleteModal, session]);

  return (
    <div className="space-y-12 p-1">
      <SettingsSectionHeader
        title="Data & Privacy"
        description="Manage your data and privacy settings."
        icon={<Shield className="h-5 w-5" />}
      />

      <SettingsSection
        title="Data Usage"
        description="View how your data is used and stored. Read our Privacy Policy to learn more about your data protection."
      >
          <SettingRow
            title="Privacy Policy"
            description="View our latest Privacy Policy documentation"
            action={
              <Button
                variant="outline"
                size="sm"
                className="w-full sm:w-[120px] rounded-[var(--radius-sm)] text-[12px] h-8"
                onClick={() =>
                  window.open("https://nuro.finance/privacy", "_blank", "noopener,noreferrer")
                }
              >
                View
              </Button>
            }
          />
          <SettingRow
            title="Download Your Data"
            description="Request a copy of your data and transaction history"
            action={
              <Button
                variant="outline"
                size="sm"
                className="w-full sm:w-[120px] rounded-[var(--radius-sm)] text-[12px] h-8"
                onClick={async () => {
                  try {
                    const res = await fetch("/api/users/export-data");
                    const data = await res.json();
                    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = "nuro-data-export.json";
                    a.click();
                    URL.revokeObjectURL(url);
                  } catch { alert("Export failed"); }
                }}
              >
                Export
              </Button>
            }
          />
      </SettingsSection>

      <SettingsSection
        title="Danger Zone"
        className="[&_h2]:text-[rgba(255,82,82,1)]"
        description="Permanent and irreversible account actions"
      >
          <SettingRow
            title="Delete Account"
            description="Permanently delete your account and all associated data. Card balances will be automatically sent to your withdrawal wallet and any subscription will be canceled."
            action={
              <Button
                variant="ghost"
                className="h-8 px-6 rounded-[var(--radius-sm)] font-semibold text-[12px] text-[rgba(255,82,82,0.9)] hover:bg-[rgba(255,82,82,0.1)] hover:text-[rgba(255,82,82,1)] border border-[rgba(255,82,82,0.2)] transition-all duration-200 shrink-0"
                onClick={() => setShowDeleteModal(true)}
              >
                Delete My Account
              </Button>
            }
          />
      </SettingsSection>

      <ConfirmDeleteModal
        open={showDeleteModal}
        onOpenChange={setShowDeleteModal}
        balance={deleteBalance}
      />
    </div>
  );
}
