"use client";

import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { IconMenu2 } from "@tabler/icons-react";
import {
  LanguageSelector,
  HeaderActions,
  ConnectWallet,
  NotificationsDropdown,
  Breadcrumbs,
} from "./components";
import { HeaderMenuProvider } from "./HeaderMenuContext";
import { restoreDemoSampleForSwitchOff } from "@/features/dashboard/overview/hooks/designSampleData";
import { useDevPreviewMode } from "@/providers/DevPreviewModeProvider";
import { AccountOnboardingModal } from "@/features/onboarding";

interface HeaderProps {
  className?: string;
  scrolled?: boolean;
  onMobileMenuToggle?: () => void;
  onChatV2Toggle?: () => void;
}

/**
 * Header component with language selector, theme toggle, notifications, and user dropdown
 */
export default function Header({
  className = "",
  scrolled = false,
  onMobileMenuToggle,
  onChatV2Toggle,
}: HeaderProps) {
  const pathname = usePathname();
  const t = useTranslations();
  const { isDevAvailable, populated, togglePopulated } = useDevPreviewMode();
  const didInitDevPreview = useRef(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);

  useEffect(() => {
    if (!isDevAvailable) return;
    try {
      restoreDemoSampleForSwitchOff();
    } catch {
 // ignore
    }
    didInitDevPreview.current = true;
  }, [isDevAvailable]);

  const cleanPath = pathname.replace(/^\/[a-z]{2}/, "") || "/dashboard";
  const isDashboardHome = cleanPath === "/dashboard";

 // Get dynamic page title based on current pathname
  const getPageTitle = () => {
    switch (cleanPath) {
      case "/dashboard":
        return t("Header.dashboard");
      case "/dashboard/overview-2":
        return t("Header.dashboard");
      case "/dashboard/overview-3":
        return t("Header.dashboard");
      case "/dashboard/analytics":
        return t("Header.analytics");
      case "/dashboard/transactions":
        return t("Header.transactions");
      case "/dashboard/my-card":
      case "/dashboard/my-card-1":
      case "/dashboard/my-card-v2":
        return t("Header.cards");
      case "/dashboard/agent-cards":
        return t("Header.cards");
      case "/dashboard/settings":
        return t("Header.settings");
      default:
        return t("Header.dashboard");
    }
  };

  return (
    <div
      className={`flex h-full items-center justify-between bg-transparent flex-1 ${className}`}
    >
      {/* Left: wordmark and breadcrumbs */}
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="min-w-0">
            <Breadcrumbs scrolled={scrolled} />
          </div>
        </div>
      </div>

      {/* Right: search + actions — shared menu state so only one dropdown is open */}
      <HeaderMenuProvider>
        <div className="flex shrink-0 justify-end items-center gap-1 sm:gap-2">
          {/* <div className="hidden sm:block">
            <LanguageSelector />
          </div> */}
          <div className="hidden md:block">
            <HeaderActions
              devPopulatedPreview={
                isDevAvailable ? populated : undefined
              }
              onToggleDevPopulatedPreview={
                isDevAvailable ? togglePopulated : undefined
              }
              onOpenOnboarding={
                isDevAvailable && isDashboardHome
                  ? () => setOnboardingOpen(true)
                  : undefined
              }
            />
          </div>
          {/* 2026-05-25: ThemeToggle removed. Dark-only. The
              theme provider hard-locks to dark and ignores any other
              value. Settings page hides the darkMode row too. */}
          <div className="mr-2">
            <NotificationsDropdown />
          </div>
          <button
            type="button"
            onClick={() => onChatV2Toggle?.()}
            aria-label="Toggle Nuro AI chat panel"
            className="group hidden sm:inline-flex h-8 min-w-[3.5rem] items-center justify-center gap-2 rounded-[var(--radius-sm)] px-3 text-sm font-medium text-[var(--color-text-primary)] bg-white/[0.04] hover:bg-[var(--color-bg-hover)] transition-all duration-200 mr-2"
          >
            <img
              src="/Eccho%20AI%20Logo%20-%20Stroke.svg"
              alt=""
              aria-hidden="true"
              className="shrink-0 h-[18px] w-[18px]"
            />
            Nuro AI
          </button>
          <ConnectWallet />
        </div>
      </HeaderMenuProvider>
      <AccountOnboardingModal open={onboardingOpen} onOpenChange={setOnboardingOpen} />
    </div>
  );
}
