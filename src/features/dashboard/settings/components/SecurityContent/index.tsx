"use client";
import { useMemo, useState } from "react";
import { useAppSession } from "@/hooks/useAppSession";
import { Lock, Eye, EyeOff, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ForgotPasswordModal } from "./components/ForgotPasswordModal";
import SettingsSection from "@/components/settings-section";
import SettingRow from "../SettingRow";
import { cn } from "@/lib/utils";
import {
  SETTINGS_CTA_BUTTON_CLASS,
  SETTINGS_INPUT_WITH_ICON_CLASS,
  SETTINGS_LABEL_CLASS,
} from "@/features/dashboard/settings/settingsStyles";

type HeaderStatusTone = "error" | "success";

function resolvePasswordHeaderStatus({
  success,
  error,
  currentPassword,
  newPassword,
  confirmPassword,
}: {
  success: boolean;
  error: string;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}): { tone: HeaderStatusTone; message: string } | null {
  if (success) {
    return { tone: "success", message: "Password changed successfully!" };
  }
  if (error) {
    return { tone: "error", message: error };
  }
  if (confirmPassword.length > 0 && newPassword !== confirmPassword) {
    return { tone: "error", message: "New passwords do not match." };
  }
  if (newPassword.length > 0 && newPassword.length < 8) {
    return { tone: "error", message: "New password must be at least 8 characters." };
  }
  if ((newPassword.length > 0 || confirmPassword.length > 0) && !currentPassword) {
    return { tone: "error", message: "Enter your current password." };
  }
  if (!currentPassword && !newPassword && confirmPassword.length > 0) {
    return { tone: "error", message: "Please fill in all fields." };
  }
  return null;
}

export default function SecurityContent() {
  const { data: session } = useAppSession();
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const headerStatus = useMemo(
    () =>
      resolvePasswordHeaderStatus({
        success,
        error,
        currentPassword,
        newPassword,
        confirmPassword,
      }),
    [success, error, currentPassword, newPassword, confirmPassword]
  );

  const handleChangePassword = async () => {
    setError("");
    setSuccess(false);
    if (!currentPassword || !newPassword) {
      setError("Please fill in all fields.");
      return;
    }
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }
    if (!session?.accessToken) return;
    setSaving(true);
    try {
      const res = await fetch("/api/users/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.accessToken}`,
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to change password");
      }
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => setSuccess(false), 4000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  const clearServerError = () => {
    if (error) setError("");
    if (success) setSuccess(false);
  };

  const PwField = ({
    id,
    name,
    label,
    value,
    onChange,
    show,
    onToggle,
    ph,
    autoComplete = "off",
  }: {
    id: string;
    name: string;
    label: string;
    value: string;
    onChange: (v: string) => void;
    show: boolean;
    onToggle: () => void;
    ph?: string;
    autoComplete?: string;
  }) => (
    <div>
      <label htmlFor={id} className={SETTINGS_LABEL_CLASS}>
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          name={name}
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => {
            clearServerError();
            onChange(e.target.value);
          }}
          placeholder={ph ?? "••••••••"}
          className={SETTINGS_INPUT_WITH_ICON_CLASS}
          autoComplete={autoComplete}
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          data-1p-ignore
          data-lpignore="true"
          readOnly
          onFocus={(e) => e.currentTarget.removeAttribute("readOnly")}
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-primary)]"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );

  const changePasswordHeaderActions = (
    <>
      {headerStatus ? (
        <p
          className={cn(
            "min-w-0 flex-1 text-right text-sm leading-snug sm:max-w-[280px]",
            headerStatus.tone === "error"
              ? "text-red-500"
              : "text-emerald-500"
          )}
          role={headerStatus.tone === "error" ? "alert" : "status"}
        >
          {headerStatus.message}
        </p>
      ) : null}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="shrink-0 rounded-[10px] text-white hover:text-white"
        onClick={() => setForgotPasswordOpen(true)}
      >
        Forgot password
      </Button>
    </>
  );

  const accountEmail =
    session?.user?.email ?? "";

  return (
    <div className="space-y-8">
      <ForgotPasswordModal
        open={forgotPasswordOpen}
        onOpenChange={setForgotPasswordOpen}
        defaultEmail={accountEmail}
      />
      <SettingsSection
        title="Change Password"
        description="Update your account password"
        icon={<Lock className="h-5 w-5" />}
        actions={changePasswordHeaderActions}
      >
        <form
          className="space-y-4"
          autoComplete="off"
          data-1p-ignore
          onSubmit={(e) => {
            e.preventDefault();
            void handleChangePassword();
          }}
        >
          <PwField
            id="nuro-current-password"
            name="nuro-current-password"
            label="Current Password"
            value={currentPassword}
            onChange={setCurrentPassword}
            show={showCurrent}
            onToggle={() => setShowCurrent((v) => !v)}
            ph="Enter current password"
            autoComplete="off"
          />
          <PwField
            id="nuro-new-password"
            name="nuro-new-password"
            label="New Password"
            value={newPassword}
            onChange={setNewPassword}
            show={showNew}
            onToggle={() => setShowNew((v) => !v)}
            ph="Min. 8 characters"
            autoComplete="off"
          />
          <PwField
            id="nuro-confirm-password"
            name="nuro-confirm-new-password"
            label="Confirm New Password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            show={showConfirm}
            onToggle={() => setShowConfirm((v) => !v)}
            ph="Re-enter new password"
            autoComplete="off"
          />
          <div className="flex justify-end">
            <Button type="submit" disabled={saving} className={SETTINGS_CTA_BUTTON_CLASS}>
              {saving ? "Updating..." : "Update Password"}
            </Button>
          </div>
        </form>
      </SettingsSection>
      <SettingsSection
        title="Two-Factor Authentication"
        description="Add an extra layer of security"
        icon={<ShieldAlert className="h-5 w-5" />}
      >
        <SettingRow
          title="Authenticator App"
          description="Use an authenticator app to generate one-time codes"
          action={
            <Button variant="outline" size="sm" disabled className="rounded-[10px]">
              Coming Soon
            </Button>
          }
        />
      </SettingsSection>
    </div>
  );
}
