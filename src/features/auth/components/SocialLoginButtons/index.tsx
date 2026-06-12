"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  TooltipProvider,
} from "@/components/ui/tooltip";
import GoogleGMark from "./GoogleGMark";

interface SocialLoginButtonsProps {
  onGoogleLogin: () => void;
  /**
   * Historical prop name used elsewhere in the codebase.
   * Treated as an alias for Telegram in this UI.
   */
  onAppleLogin?: () => void;
  onTelegramLogin?: () => void;
  variant?: "stacked" | "inline";
  isSignUp?: boolean;
}

function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 text-xs">
      <div className="h-px min-w-0 flex-1 bg-[var(--color-border-secondary)]" />
      <span className="shrink-0 text-[var(--color-text-muted)]">{label}</span>
      <div className="h-px min-w-0 flex-1 bg-[var(--color-border-secondary)]" />
    </div>
  );
}

export default function SocialLoginButtons({
  onGoogleLogin,
}: SocialLoginButtonsProps) {
  const t = useTranslations("Login");

  return (
    <TooltipProvider delayDuration={0}>
      <div className="space-y-3">
        <Divider label={t("orContinueWith")} />

        <Button
          type="button"
          variant="outline"
          className="w-full hover:bg-white/10 dark:hover:bg-white/10 hover:text-white dark:hover:text-white border-[var(--color-border-input)] transition-all duration-200 backdrop-blur-none"
          onClick={onGoogleLogin}
          icon={<GoogleGMark className="w-4 h-4 shrink-0" />}
        >
          Google
        </Button>
      </div>
    </TooltipProvider>
  );
}
