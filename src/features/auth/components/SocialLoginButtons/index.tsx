"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipArrow,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
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
  variant = "stacked",
  isSignUp,
}: SocialLoginButtonsProps) {
  const t = useTranslations("Login");
  const [isMoltbookHovered, setIsMoltbookHovered] = useState(false);



  const onTelegram = onTelegramLogin ?? onAppleLogin ?? (() => { });

  const handlers: Record<string, () => void> = {
    google: onGoogleLogin,
    telegram: onTelegram,
  };

  return (
    <TooltipProvider delayDuration={0}>
      <div className="space-y-3">
        <Divider label={t("orContinueWith")} />

        {/* Moltbook Login */}
        <Button
          type="button"
          variant="outline"
          className="w-full justify-center gap-2 text-[var(--color-text-primary)] hover:bg-white hover:text-black dark:hover:bg-white dark:hover:text-black transition-all duration-200 backdrop-blur-none cursor-default overflow-hidden relative h-10"
          onMouseEnter={() => setIsMoltbookHovered(true)}
          onMouseLeave={() => setIsMoltbookHovered(false)}
        >
          <AnimatePresence>
            {!isMoltbookHovered ? (
              <motion.div
                key="login"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="flex items-center gap-2 absolute inset-0 justify-center"
              >
                <Image src="/moltbook-lobster.png" alt="Moltbook" width={20} height={20} className="h-5 w-5" />
                <span>{isSignUp ? "Sign Up with Moltbook" : "Login with Moltbook"}</span>
              </motion.div>
            ) : (
              <motion.div
                key="coming-soon"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="font-medium tracking-wide absolute inset-0 flex items-center justify-center"
              >
                Coming Soon
              </motion.div>
            )}
          </AnimatePresence>
        </Button>

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
