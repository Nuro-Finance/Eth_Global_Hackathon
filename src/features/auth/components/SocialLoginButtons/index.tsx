"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  TooltipProvider,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { SOCIAL_PROVIDERS } from "./config";

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
  onAppleLogin,
  onTelegramLogin,
}: SocialLoginButtonsProps) {
  const t = useTranslations("Login");

  const onTelegram = onTelegramLogin ?? onAppleLogin ?? (() => {});

  const handlers: Record<string, () => void> = {
    google: onGoogleLogin,
    telegram: onTelegram,
  };

  return (
    <TooltipProvider delayDuration={0}>
      <div className="space-y-3">
        <Divider label={t("orContinueWith")} />

        <div className="grid grid-cols-2 gap-3">
          {SOCIAL_PROVIDERS.map((provider) => {
            const Icon = provider.icon;
            return (
              <Button
                key={provider.id}
                type="button"
                variant="outline"
                className="w-full hover:bg-white/10 dark:hover:bg-white/10 hover:text-white dark:hover:text-white border-[var(--color-border-input)] transition-all duration-200 backdrop-blur-none"
                onClick={handlers[provider.id]}
                icon={
                  <Icon
                    className={cn("w-4 h-4 shrink-0", provider.iconClassName)}
                  />
                }
              >
                {provider.name}
              </Button>
            );
          })}
        </div>
      </div>
    </TooltipProvider>
  );
}
