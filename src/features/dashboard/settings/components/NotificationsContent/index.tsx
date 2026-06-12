"use client";
import { useState, useEffect, useRef } from "react";
import { useAppSession } from "@/hooks/useAppSession";
import { Bell } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import SettingsSection from "@/components/settings-section";
import SettingRow from "../SettingRow";

interface NotificationPrefs {
  transactions: boolean;
  security: boolean;
  promotions: boolean;
  weeklyReport: boolean;
  agentDeployments: boolean;
  agentTrades: boolean;
  agentProfits: boolean;
  marketBets: boolean;
  bridgeDeposits: boolean;
}

const DEFAULTS: NotificationPrefs = {
  transactions: true,
  security: true,
  promotions: false,
  weeklyReport: true,
  agentDeployments: true,
  agentTrades: true,
  agentProfits: true,
  marketBets: true,
  bridgeDeposits: true,
};

export default function NotificationsContent() {
  const { data: session } = useAppSession();
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULTS);
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!session?.accessToken) return;
    fetch("/api/users/me", {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    })
      .then((r) => r.json())
      .then((data: any) => {
        if (data?.notificationPrefs) setPrefs({ ...DEFAULTS, ...data.notificationPrefs });
      })
      .catch(() => {});
  }, [session?.accessToken]);

  const toggle = (key: keyof NotificationPrefs) => {
    const updated = { ...prefs, [key]: !prefs[key] };
    setPrefs(updated);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaving(true);
    saveTimer.current = setTimeout(async () => {
      try {
        if (!session?.accessToken) return;
        await fetch("/api/users/notifications", {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.accessToken}` },
          body: JSON.stringify({ notificationPrefs: updated }),
        });
      } catch {} finally { setSaving(false); }
    }, 800);
  };

  const cardRows: { key: keyof NotificationPrefs; title: string; description: string }[] = [
    { key: "transactions", title: "Transaction Alerts", description: "Get notified for every card transaction" },
    { key: "security", title: "Security Alerts", description: "Login attempts, password changes, and suspicious activity" },
    { key: "bridgeDeposits", title: "Bridge Deposits", description: "When crypto deposits are detected and bridged to your card" },
    { key: "weeklyReport", title: "Weekly Spend Report", description: "A weekly summary of your spending and balance" },
  ];

  const agentRows: { key: keyof NotificationPrefs; title: string; description: string }[] = [
    { key: "agentDeployments", title: "Agent Deployments", description: "When you deploy or remove a trading agent" },
    { key: "agentTrades", title: "Agent Trades", description: "When your agents place bets or execute trades" },
    { key: "agentProfits", title: "Agent Profits", description: "When agents earn profits or settle to your card" },
    { key: "marketBets", title: "Market Bets", description: "When you place bets on prediction markets" },
  ];

  const marketRows: { key: keyof NotificationPrefs; title: string; description: string }[] = [
    { key: "promotions", title: "Promotions & Offers", description: "Cashback deals, partner offers, and announcements" },
  ];

  return (
    <div className="space-y-8">
      <SettingsSection title="Card & Security" description={saving ? "Saving..." : "Alerts for card activity and account security"} icon={<Bell className="h-5 w-5" />}>
        {cardRows.map(({ key, title, description }) => (
          <SettingRow key={key} title={title} description={description} action={<Switch checked={prefs[key]} onChange={() => toggle(key)} size="sm" />} />
        ))}
      </SettingsSection>

      <SettingsSection title="Agents & Trading" description="Notifications from your AI agents and market activity" icon={<Bell className="h-5 w-5" />}>
        {agentRows.map(({ key, title, description }) => (
          <SettingRow key={key} title={title} description={description} action={<Switch checked={prefs[key]} onChange={() => toggle(key)} size="sm" />} />
        ))}
      </SettingsSection>

      <SettingsSection title="Other" description="Promotions and marketing communications" icon={<Bell className="h-5 w-5" />}>
        {marketRows.map(({ key, title, description }) => (
          <SettingRow key={key} title={title} description={description} action={<Switch checked={prefs[key]} onChange={() => toggle(key)} size="sm" />} />
        ))}
      </SettingsSection>
    </div>
  );
}
