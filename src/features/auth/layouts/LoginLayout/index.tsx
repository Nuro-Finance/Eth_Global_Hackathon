"use client";

import { useState, useEffect, useRef } from "react";
import { ChevronLeft } from "lucide-react";
import { LoginForm } from "../../components";
import { SubmitButton } from "../../components/LoginForm/components";
import { useLogin } from "./hooks";
import { LoginBackground } from "./components";
import { InputOTP } from "@/components/ui/input-otp";

/**
 * LoginLayout - Main layout component for the login page
 * Handles all state management and renders the login UI.
 *
 * Day-7 demo-critical: when useLogin returns `pendingVerification`, swap
 * the form for the OTP entry step. This covers BOTH paths:
 * 1. Brand-new signup via the inline "create account" toggle
 * 2. Existing user logging in whose account isn't yet verified
 */
export function LoginLayout({ initialSignUp = false }: { initialSignUp?: boolean }) {
  const isSignUp = initialSignUp;
  const [isForgot, setIsForgot] = useState(false);
  const {
    isLoading, error, onSubmit, handleGoogleLogin, handleAppleLogin,
    pendingVerification, verifyOtp, resendOtp, cancelVerification,
  } = useLogin();

  const [otpCode, setOtpCode] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const cooldownRef = useRef<number | null>(null);

  useEffect(() => {
    if (pendingVerification) {
      setResendCooldown(30);
      setOtpCode("");
    }
  }, [pendingVerification]);

  useEffect(() => {
    if (resendCooldown <= 0) {
      if (cooldownRef.current !== null) {
        window.clearInterval(cooldownRef.current);
        cooldownRef.current = null;
      }
      return;
    }
    if (cooldownRef.current === null) {
      cooldownRef.current = window.setInterval(() => {
        setResendCooldown((s) => Math.max(0, s - 1));
      }, 1000);
    }
    return () => {
      if (cooldownRef.current !== null) {
        window.clearInterval(cooldownRef.current);
        cooldownRef.current = null;
      }
    };
  }, [resendCooldown]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    await verifyOtp(otpCode);
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    const ok = await resendOtp();
    if (ok) setResendCooldown(30);
  };

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)] flex items-center justify-center p-4 relative overflow-hidden">
      <LoginBackground />

      <div className="relative w-full max-w-md z-10">
        {pendingVerification ? (
          <div className="relative flex flex-col overflow-hidden rounded-[28px] border border-[var(--color-border-secondary)] bg-[var(--color-bg-secondary)] shadow-none">
            <form onSubmit={handleVerify} className="flex flex-col">
              <div className="px-10 pt-10">
                <div className="relative mb-5 shrink-0">
                  <button
                    type="button"
                    onClick={cancelVerification}
                    className="absolute left-0 top-0 z-10 flex items-center justify-start p-0 text-[var(--color-text-primary)] transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/25"
                    aria-label="Back"
                  >
                    <ChevronLeft className="h-6 w-6 shrink-0 -ml-[9px]" strokeWidth={2} />
                  </button>
                  <div className="flex h-[90px] items-center justify-center">
                    <img
                      src="/Updated Email Icon.svg"
                      alt=""
                      className="h-[125px] w-[125px] object-contain"
                    />
                  </div>
                </div>

                <div className="shrink-0 text-center">
                  <h1 className="mb-2 text-2xl font-bold leading-none text-[var(--color-text-primary)]">
                    Verify your email
                  </h1>
                  <h2
                    role={error ? "alert" : undefined}
                    className={
                      error
                        ? "text-sm font-semibold leading-relaxed text-[var(--color-error)]"
                        : "text-sm font-normal leading-relaxed text-[var(--color-text-muted)]"
                    }
                  >
                    {error ?? (
                      <>
                        Enter the 6-digit code we sent to
                        <br />
                        <span className="text-[var(--color-text-primary)]">{pendingVerification.email}</span>
                      </>
                    )}
                  </h2>
                </div>

                <div className="mt-8 flex flex-col items-center gap-4">
                  <div className="relative flex justify-center">
                    <InputOTP value={otpCode} onChange={setOtpCode} disabled={isLoading} />
                  </div>
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={resendCooldown > 0 || isLoading}
                    className="text-sm font-medium text-[var(--color-primary)] hover:underline disabled:cursor-not-allowed disabled:text-[var(--color-text-muted)] disabled:no-underline"
                  >
                    {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend code"}
                  </button>
                </div>
              </div>

              <div className="px-10 pb-10 pt-8">
                <SubmitButton
                  isLoading={isLoading}
                  isValid={otpCode.length === 6}
                  label={isLoading ? "Signing in…" : "Verify & continue"}
                />
              </div>
            </form>
          </div>
        ) : (
          <>
            <LoginForm
              isSignUp={isSignUp}
              onSubmit={onSubmit}
              isLoading={isLoading}
              error={error}
              onGoogleLogin={handleGoogleLogin}
              onAppleLogin={handleAppleLogin}
              onForgotPasswordChange={setIsForgot}
            />
            {!isForgot && <div className="hidden" aria-hidden="true" />}
          </>
        )}
      </div>
    </div>
  );
}
