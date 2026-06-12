import { useState } from "react";
import type { NotificationSettings } from "../../../components";

interface Tab {
    key: string;
    label: string;
}

/**
 * Hook for managing settings page state
 */
export function useSettingsState(tabs: Tab[]) {
    const [activeTab, setActiveTab] = useState("Profile");
    const [notifications, setNotifications] = useState<NotificationSettings>({
        depositAlerts: true,
        withdrawalAlerts: true,
        largeTransfers: false,
        cardDeclined: true,
        limitApproaching: true,
        cardStatus: true,
        securityAlerts: true,
        marketingEmails: false,
    });

    const activeTabLabel = tabs.find((tab) => tab.key === activeTab)?.label || activeTab;

    return {
        activeTab,
        setActiveTab,
        notifications,
        setNotifications,
        activeTabLabel,
    };
}
