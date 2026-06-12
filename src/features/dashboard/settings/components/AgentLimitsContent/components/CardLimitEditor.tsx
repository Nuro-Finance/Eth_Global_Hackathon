"use client";

import React from "react";
import { CalendarRange, Gauge, ShieldAlert, Zap } from "lucide-react";
import { useCardControls } from "@/features/dashboard/my-card-1/hooks/useCardControls";
import { AgentLimitWidget } from "./AgentLimitWidget";
import { SETTINGS_ROW_STACK_CLASS } from "@/features/dashboard/settings/settingsStyles";

export const parseLimitNum = (value: string) => Number(value.replace(/,/g, "")) || 0;

export function CardLimitEditor({
  cardId,
  surface = "glass",
}: {
  cardId: string;
  surface?: "glass" | "solid";
}) {
  const { controls, isSaving, saveControls } = useCardControls(cardId);

  return (
    <div className={SETTINGS_ROW_STACK_CLASS}>
      <AgentLimitWidget
        surface={surface}
        icon={<Gauge />}
        label="Daily spend limit"
        description="Max agent spend per 24 hours on this card."
        value={controls.daily_limit.toLocaleString()}
        prefix="$"
        suffix="USD"
        isSaving={isSaving}
        onSave={(value) => saveControls({ daily_limit: parseLimitNum(value) })}
      />
      <AgentLimitWidget
        surface={surface}
        icon={<CalendarRange />}
        label="Monthly spend limit"
        description="Max agent spend per billing cycle on this card."
        value={controls.monthly_limit.toLocaleString()}
        prefix="$"
        suffix="USD"
        isSaving={isSaving}
        onSave={(value) => saveControls({ monthly_limit: parseLimitNum(value) })}
      />
      <AgentLimitWidget
        surface={surface}
        icon={<ShieldAlert />}
        label="Per-transaction limit"
        description="Block abnormally large agent purchases on this card."
        value={controls.per_tx_limit.toLocaleString()}
        prefix="$"
        suffix="USD"
        isSaving={isSaving}
        onSave={(value) => saveControls({ per_tx_limit: parseLimitNum(value) })}
      />
      <AgentLimitWidget
        surface={surface}
        icon={<Zap />}
        label="Transaction velocity limit"
        description="Max agent transactions per hour on this card."
        value={String(controls.velocity_per_hr)}
        prefix="#"
        suffix="Tx/Hr"
        isSaving={isSaving}
        onSave={(value) => saveControls({ velocity_per_hr: parseLimitNum(value) })}
      />
    </div>
  );
}
