"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLocale } from "next-intl";
import { signIn } from "next-auth/react";

type Step = "form" | "otp" | "success";

export function RegisterLayout() {
  const router = useRouter();
  const locale = useLocale();
  const [step, setStep] = useState<Step>("form");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "" });

 // OTP step state
  const [otpCode, setOtpCode] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const [info, setInfo] = useState<string | null>(null);
  const cooldownRef = useRef<number | null>(null);

 // ── countdown for "Resend code" button ─────────────────────────────
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

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

 // ── Step 1 → Step 2: register, send OTP ────────────────────────────
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (form.password !== form.confirm) { setError("Passwords do not match."); return; }
    if (form.password.length < 8) { setError("Password must be at least 8 characters."); return; }
    setIsLoading(true);
    try {
      const res = await fetch(`/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name, email: form.email, password: form.password }),
      });
      const data = await res.json();
      if (res.status === 202 && data.needsVerification) {
        setStep("otp");
        setResendCooldown(30);
        setInfo(`We sent a 6-digit code to ${form.email}. Check your inbox (and spam).`);
        return;
      }
      if (!res.ok) {
        setError(data.error ?? "Registration failed.");
        return;
      }
 // Defensive: if backend ever flips back to immediate-JWT, accept it.
      setStep("success");
      setTimeout(() => router.push(`/${locale}/login`), 1500);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

 // ── Step 2 → Step 3: verify OTP, sign in ───────────────────────────
  const onVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    const code = otpCode.replace(/\D/g, "");
    if (code.length !== 6) {
      setError("Enter the 6-digit code from your email.");
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch(`/api/auth/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email, code, purpose: "signup" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Verification failed.");
        return;
      }
      setStep("success");
 // Now that the account is verified + JWT was issued by the BE, ask
 // NextAuth to mint a session cookie too so the dashboard pages work.
      const loginResult = await signIn("credentials", {
        redirect: false,
        email: form.email,
        password: form.password,
      });
      if (loginResult?.error) {
 // Fall back to manual login page
        setTimeout(() => router.push(`/${locale}/login`), 1200);
        return;
      }
      setTimeout(() => router.push(`/${locale}/dashboard`), 800);
    } catch {
      setError("Could not reach verification service.");
    } finally {
      setIsLoading(false);
    }
  };

  const onResend = async () => {
    if (resendCooldown > 0) return;
    setInfo(null);
    setError(null);
    setIsLoading(true);
    try {
      await fetch(`/api/auth/resend-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email, purpose: "signup" }),
      });
      setInfo("New code sent. Check your inbox.");
      setResendCooldown(30);
    } catch {
      setError("Could not resend code.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border-primary)] rounded-2xl p-8 shadow-xl">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">
              {step === "form" ? "Create your account" : step === "otp" ? "Verify your email" : "You're in"}
            </h1>
            <p className="text-[var(--color-text-muted)] text-sm mt-2">
              {step === "form"
                ? "Join Nuro.Finance today"
                : step === "otp"
                  ? `Enter the 6-digit code sent to ${form.email}`
                  : "Redirecting to your dashboard…"}
            </p>
          </div>

          {step === "success" ? (
            <div className="text-center py-6">
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-[var(--color-text-primary)] font-medium">Email verified!</p>
              <p className="text-[var(--color-text-muted)] text-sm mt-1">Signing you in…</p>
            </div>
          ) : step === "otp" ? (
            <form onSubmit={onVerify} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1.5">6-digit code</label>
                <input
                  name="otp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  required
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="123456"
                  className="w-full px-4 py-3 rounded-xl bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-primary)] text-center text-lg tracking-[0.5em] font-mono transition-colors"
                />
              </div>

              {info && (
                <div className="px-4 py-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-300 text-sm">{info}</div>
              )}
              {error && (
                <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>
              )}

              <button
                type="submit"
                disabled={isLoading || otpCode.length !== 6}
                className="w-full py-3 rounded-xl bg-[var(--color-primary)] text-white font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed mt-2"
              >
                {isLoading ? "Verifying…" : "Verify & continue"}
              </button>

              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={() => { setStep("form"); setOtpCode(""); setError(null); setInfo(null); }}
                  className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
                >
                  ← Change email
                </button>
                <button
                  type="button"
                  onClick={onResend}
                  disabled={resendCooldown > 0 || isLoading}
                  className="text-xs text-[var(--color-primary)] hover:underline disabled:text-[var(--color-text-muted)] disabled:no-underline disabled:cursor-not-allowed"
                >
                  {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend code"}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1.5">Full Name</label>
                <input name="name" type="text" required value={form.name} onChange={onChange} placeholder="Chris Brignola"
                  className="w-full px-4 py-2.5 rounded-xl bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-primary)] text-sm transition-colors" />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1.5">Email Address</label>
                <input name="email" type="email" required value={form.email} onChange={onChange} placeholder="you@example.com"
                  className="w-full px-4 py-2.5 rounded-xl bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-primary)] text-sm transition-colors" />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1.5">Password</label>
                <input name="password" type="password" required value={form.password} onChange={onChange} placeholder="Min. 8 characters" autoComplete="new-password"
                  className="w-full px-4 py-2.5 rounded-xl bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-primary)] text-sm transition-colors" />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1.5">Confirm Password</label>
                <input name="confirm" type="password" required value={form.confirm} onChange={onChange} placeholder="Repeat your password" autoComplete="new-password"
                  className="w-full px-4 py-2.5 rounded-xl bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-primary)] text-sm transition-colors" />
              </div>

              {error && (
                <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>
              )}

              <button type="submit" disabled={isLoading}
                className="w-full py-3 rounded-xl bg-[var(--color-primary)] text-white font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed mt-2">
                {isLoading ? "Sending code…" : "Create Account"}
              </button>
            </form>
          )}

          {step === "form" && (
            <p className="text-center text-sm text-[var(--color-text-muted)] mt-6">
              Already have an account?{" "}
              <Link href={`/${locale}/login`} className="text-[var(--color-primary)] hover:underline font-medium">
                Sign in
              </Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
