"use client";

import React from "react";
import { Bot, CalendarRange, Gauge, ShieldAlert, Zap } from "lucide-react";
import { SettingsSection } from "@/components/settings-section";
import { SettingsGlassPicker } from "../SettingsGlassPicker";
import { AgentLimitWidget } from "./components/AgentLimitWidget";
import { CardLimitEditor, parseLimitNum } from "./components/CardLimitEditor";
import { useGlobalAgentLimits } from "./hooks/useGlobalAgentLimits";
import { SETTINGS_ROW_STACK_CLASS } from "@/features/dashboard/settings/settingsStyles";

interface CardOption {
  id: string;
  name: string;
  number: string;
}

const SETTINGS_CARDS: CardOption[] = [
  { id: "1", name: "My card", number: "•••• 4242" },
  { id: "2", name: "Expense Card", number: "•••• 9999" },
  { id: "3", name: "Subscription Setup", number: "•••• 1234" },
  { id: "4", name: "Travel Card", number: "•••• 5555" },
];

const CARD_PICKER_OPTIONS = SETTINGS_CARDS.map((card) => ({
  value: card.id,
  label: `${card.name} ${card.number}`,
}));

export default function AgentLimitsContent() {
  const { limits, isSaving, saveLimit } = useGlobalAgentLimits();
  const [selectedCardId, setSelectedCardId] = React.useState<string>(
    SETTINGS_CARDS[0]?.id ?? ""
  );

  return (
    <SettingsSection
      title="Agent Limits"
      description="Global agent spending limits and per-card overrides"
      icon={<Bot className="h-5 w-5" />}
    >
      <div className="space-y-8">
        <SettingsSection title="Global limits">
          <div className={SETTINGS_ROW_STACK_CLASS}>
            <AgentLimitWidget
              icon={<Gauge />}
              label="Daily spend limit"
              description="Max total agent spend per 24 hours."
              value={limits.daily_limit.toLocaleString()}
              prefix="$"
              suffix="USD"
              isSaving={isSaving}
              onSave={(value) => saveLimit("daily_limit", parseLimitNum(value))}
            />
            <AgentLimitWidget
              icon={<CalendarRange />}
              label="Monthly spend limit"
              description="Max total agent spend per billing cycle."
              value={limits.monthly_limit.toLocaleString()}
              prefix="$"
              suffix="USD"
              isSaving={isSaving}
              onSave={(value) => saveLimit("monthly_limit", parseLimitNum(value))}
            />
            <AgentLimitWidget
              icon={<ShieldAlert />}
              label="Per-transaction limit"
              description="Block abnormally large agent purchases."
              value={limits.per_tx_limit.toLocaleString()}
              prefix="$"
              suffix="USD"
              isSaving={isSaving}
              onSave={(value) => saveLimit("per_tx_limit", parseLimitNum(value))}
            />
            <AgentLimitWidget
              icon={<Zap />}
              label="Transaction velocity limit"
              description="Max agent transactions allowed per hour."
              value={String(limits.velocity_per_hr)}
              prefix="#"
              suffix="Tx/Hr"
              isSaving={isSaving}
              onSave={(value) => saveLimit("velocity_per_hr", parseLimitNum(value))}
            />
          </div>
        </SettingsSection>

        <SettingsSection
          title="Per-card limits"
          actions={
            <SettingsGlassPicker
              value={selectedCardId}
              onValueChange={setSelectedCardId}
              options={CARD_PICKER_OPTIONS}
              triggerClassName="w-full sm:w-56"
              ariaLabel="Select card"
            />
          }
        >
          {selectedCardId ? <CardLimitEditor cardId={selectedCardId} /> : null}
        </SettingsSection>
      </div>
    </SettingsSection>
  );
}
