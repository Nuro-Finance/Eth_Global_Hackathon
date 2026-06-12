"use client";

import { useTranslations } from "next-intl";
import { useSettingsState } from "./hooks";
import { SettingsContent } from "./components";
import { SettingsNavigation } from "../../components";
import { PageHeader, PageTitle } from "@/components";

/**
 * SettingsLayout - Main layout component for the settings page
 * Handles all state management and renders the settings UI
 */
export function SettingsLayout() {
  const t = useTranslations("Settings");

  const tabs = [
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
  ];

  const {
    activeTab,
    setActiveTab,
    notifications,
    setNotifications,
  } = useSettingsState(tabs);

  return (
    <div>
      <PageHeader
        className="mb-2 md:mb-4"
        leftSection={
          <PageTitle
            title={t("title")}
            subtitle={t("subtitle")}
          />
        }
      />

      <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-[200px_1fr]">
      {/* Left: settings secondary nav */}
      <div className="self-start bg-[var(--color-bg-card)] dark:bg-[var(--color-bg-card)] dark:backdrop-blur-[var(--widget-blur)] glass-card-inner rounded-[var(--radius-card)] border-none p-5 shadow-none ring-0">
        <SettingsNavigation activeTab={activeTab} onChangeTab={setActiveTab} />
      </div>

      {/* Right: settings content */}
      <div className="flex h-full min-h-0 flex-col bg-[var(--color-bg-card)] dark:bg-[var(--color-bg-card)] dark:backdrop-blur-[var(--widget-blur)] glass-card-inner rounded-[var(--radius-card)] border-none p-10 shadow-none ring-0">
        <SettingsContent
          activeTab={activeTab}
          notifications={notifications}
          setNotifications={setNotifications}
        />
      </div>
      </div>
    </div>
  );
}
