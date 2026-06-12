"use client";

import { useTranslations } from "next-intl";
import { CreditCard, Wallet, Gem } from "lucide-react";
import {
  SettingsNavigation,
  ProfileContent,
  SecurityContent,
  WithdrawContent,
  AgentLimitsContent,
  type NotificationSettings,
  NotificationsContent,
  PreferencesContent,
  WalletsContent,
  CardsContent,
  SubscriptionContent,
  PrivacyDataContent,
} from "../../../components";
import SettingsSection from "@/components/settings-section";

interface SettingsContentProps {
  activeTab: string;
  notifications: NotificationSettings;
  setNotifications: (notifications: NotificationSettings) => void;
}

/**
 * Settings content renderer - Renders content based on active tab
 */
export function SettingsContent({
  activeTab,
  notifications,
  setNotifications,
}: SettingsContentProps) {
  const t = useTranslations("Settings");

  const Placeholder = ({
    title,
    description,
    icon,
  }: {
    title: string;
    description: string;
    icon: React.ReactNode;
  }) => (
    <div className="space-y-8">
      <SettingsSection title={title} description={description} icon={icon}>
        <div />
      </SettingsSection>
    </div>
  );

  switch (activeTab) {
    case "Profile":
      return <ProfileContent />;
    case "Security":
      return <SecurityContent />;
    case "Withdraw":
      return <WithdrawContent />;
    case "AgentLimits":
      return <AgentLimitsContent />;
    case "Wallets":
      return <WalletsContent />;
    case "Cards":
      return (
        <div className="flex h-full min-h-0 flex-col">
          <CardsContent />
        </div>
      );
    case "Subscription":
      return <SubscriptionContent />;
    case "Notifications":
      return (
        <NotificationsContent
          notifications={notifications}
          setNotifications={setNotifications}
        />
      );
    case "Preferences":
      return <PreferencesContent />;
    case "PrivacyData":
      return <PrivacyDataContent />;
    default:
      return null;
  }
}

export { SettingsNavigation };
