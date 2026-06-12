"use client";

import Image from "next/image";

export function LoginFormHeader({
  isSignUp,
  isForgotPassword,
  isSent,
  isVerifyEmail,
  bannerError,
}: {
  isSignUp?: boolean;
  isForgotPassword?: boolean;
  isSent?: boolean;
  isVerifyEmail?: boolean;
 /** Replaces subtitle copy in the h2 slot only — h1 and header spacing unchanged. */
  bannerError?: string | null;
}) {
  const defaultSubtitle = isVerifyEmail
    ? "We've sent a 6-digit code to your email."
    : isSent
      ? "We've sent a recovery link to your registered email address."
      : isForgotPassword
        ? "Enter your email address to receive a recovery link."
        : isSignUp
          ? "The Neobank for your AI Agents"
          : "Welcome back! Sign in to continue";

  const showBannerError = Boolean(bannerError?.trim());

  return (
    <div className="text-center mb-6">
      {/* FIXED 72px ICON CONTAINER - Mathematically frozen height */}
      <div className="h-[72px] flex items-center justify-center mb-4">
        {isForgotPassword && !isSent ? (
          <Image
            src="/New Lock Icon.svg"
            alt="Reset Password"
            width={72}
            height={72}
            className="object-contain"
            unoptimized
          />
        ) : isSent || isVerifyEmail ? (
          <Image
            src="/Updated Email Icon.svg"
            alt="Email Sent"
            width={72}
            height={72}
            className="object-contain"
            unoptimized
          />
        ) : (
          <div className="inline-flex items-center justify-center w-14 h-14 bg-white rounded-2xl relative shadow-[0_0_20px_rgba(255,255,255,1)]">
            <div className="absolute inset-[-4px] bg-white/20 blur-xl rounded-full -z-10" />
            <Image
              src="/nuro-logo-black.svg"
              alt="Nuro Finance"
              width={34}
              height={34}
              className="object-contain"
            />
          </div>
        )}
      </div>

      <div className="flex flex-col items-center justify-center">
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)] mb-1">
          {isVerifyEmail
            ? "Verify your email"
            : isSent
              ? "Check your inbox"
              : isForgotPassword
                ? "Reset Password"
                : "Nuro Finance"}
        </h1>
        {showBannerError ? (
          <h2
            role="alert"
            className="text-sm px-4 leading-relaxed text-center font-semibold text-[var(--color-error)] line-clamp-2 max-w-full"
          >
            {bannerError}
          </h2>
        ) : (
          <div className="text-[var(--color-text-muted)] text-sm px-4 leading-relaxed whitespace-nowrap">
            {defaultSubtitle}
          </div>
        )}
      </div>
    </div>
  );
}
