"use client";

import * as React from "react";
import { LogIn, Loader2, ArrowLeft, CheckCircle2, Mail } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

interface SubmitButtonProps {
  isLoading: boolean;
  isSignUp?: boolean;
  isForgotPassword?: boolean;
  isValid?: boolean;
  isSent?: boolean;
  onCountdownEnd?: () => void;
  countdownDuration?: number;
 /** Label for the sent-state CTA before the countdown, e.g. "Back to Sign In" or "Back to settings". */
  sentBackLabel?: string;
  label?: string;
  onClick?: () => void;
}

export function SubmitButton({
  isLoading,
  isSignUp,
  isForgotPassword,
  isValid,
  isSent,
  onCountdownEnd,
  countdownDuration = 5,
  sentBackLabel = "Back to Sign In",
  label,
  onClick
}: SubmitButtonProps) {
  const t = useTranslations("Login");
  const [countdown, setCountdown] = React.useState(countdownDuration);
  const calledRef = React.useRef(false);

 // Reset state when isSent changes
  React.useEffect(() => {
    if (!isSent) {
      setCountdown(countdownDuration);
      calledRef.current = false;
    }
  }, [isSent, countdownDuration]);

 // Countdown timer - only runs when isSent is true
  React.useEffect(() => {
    if (!isSent) return;
    if (countdown <= 0) {
      if (!calledRef.current && onCountdownEnd) {
        calledRef.current = true;
        onCountdownEnd();
      }
      return;
    }
    const timer = setInterval(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [isSent, countdown, onCountdownEnd]);

  const buttonText = React.useMemo(() => {
    if (label) return label;
    if (isSent) {
      return `${sentBackLabel} (${countdown}s)`;
    }
    if (isLoading) {
      return isForgotPassword ? "Sending..." : t("signingIn");
    }
    if (isForgotPassword) {
      return "Send Recovery Link";
    }
    return isSignUp ? "Create Account" : t("signIn");
  }, [label, isLoading, isForgotPassword, isSignUp, isSent, countdown, sentBackLabel, t]);

  const Icon = React.useMemo(() => {
    if (isSent) return ArrowLeft;
    if (isLoading) return Loader2;
    if (isForgotPassword) return Mail;
    if (isSignUp) return null;
    return LogIn;
  }, [isLoading, isSent, isForgotPassword, isSignUp]);

  return (
    <Button
      type={onClick ? "button" : "submit"}
      onClick={onClick}
      className={`w-full text-base font-medium h-12 backdrop-blur-none transition-colors duration-200
        ${isValid || isSent
          ? "bg-[var(--color-primary)] text-white cursor-pointer shadow-[0_0_18px_var(--color-primary-glow)] hover:bg-[var(--color-primary-dark)]"
          : "bg-[var(--color-primary)]/40 text-white/50 cursor-not-allowed shadow-none"
        }
      `}
      disabled={(isLoading && !isSent) || (!isSent && !isValid)}
    >
      {Icon && (!label || isLoading) && (
        <Icon className={`w-5 h-5 mr-2 ${isLoading ? "animate-spin" : ""}`} />
      )}
      {buttonText}
    </Button>
  );
}
