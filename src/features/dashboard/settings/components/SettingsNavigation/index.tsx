"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

interface SettingsNavigationProps {
  activeTab: string;
  onChangeTab: (tab: string) => void;
}

export default function SettingsNavigation({
  activeTab,
  onChangeTab,
}: SettingsNavigationProps) {
  const t = useTranslations("Settings");

  const items = [
    { key: "Profile", label: t("profile") },
    { key: "Security", label: t("security") },
    { key: "Withdraw", label: t("withdraw") },
    { key: "AgentLimits", label: t("agentLimits") },
    { key: "Wallets", label: t("wallets") },
    { key: "Cards", label: t("cards") },
    { key: "Subscription", label: t("subscription") },
    { key: "Notifications", label: t("notifications") },
    { key: "Preferences", label: t("preferences") },
    { key: "PrivacyData", label: t("privacyData") },
  ] as const;

  return (
    <div className="flex flex-row gap-1 pb-0 overflow-x-auto no-scrollbar mobile-nav-mask sm:flex-col sm:gap-1 sm:overflow-visible sm:pb-0">
      {items.map((item) => {
        const isActive = activeTab === item.key;
        return (
          <button
            key={item.key}
            type="button"
            onClick={(e) => {
              onChangeTab(item.key);
              e.currentTarget.scrollIntoView({
                behavior: "smooth",
                block: "nearest",
                inline: "center",
              });
            }}
            className={cn(
              "group relative flex h-[36px] w-full shrink-0 items-center rounded-[var(--radius-sm)] px-3 transition-colors duration-200 ease-in-out",
              "whitespace-nowrap text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/25",
              "indent" in item && item.indent && "pl-6",
            )}
            aria-current={isActive ? "page" : undefined}
          >
            <div
              className={cn(
                "absolute inset-0 rounded-[var(--radius-sm)] transition-all duration-200",
                isActive ? "bg-white/5" : "bg-transparent group-hover:bg-white/2",
              )}
              aria-hidden
            />
            <span
              className={cn(
                "relative z-10 text-[13px] font-medium transition-colors duration-200",
                isActive
                  ? "text-[var(--color-primary)]"
                  : "text-[var(--color-text-muted)] group-hover:text-white",
              )}
            >
              {item.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}