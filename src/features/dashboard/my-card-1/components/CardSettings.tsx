import React, { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Bell, CreditCard, Palette, Hand, Check } from "lucide-react";
import { MY_CARD_INNER_TILE_CLASS } from "./myCardInnerFieldStyles";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  MY_CARD_THEME_SWATCHES,
  MY_CARD_WHITE_SKIN_GRADIENT,
  resolveMyCardThemeSwatch,
} from "@/lib/cardSkins";

interface SettingSectionProps {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  className?: string;
  iconColor?: string;
}

function SettingSection({ icon, title, children, className, iconColor = "text-[var(--color-text-muted)]" }: SettingSectionProps) {
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-center gap-2 px-1">
        <div className={iconColor}>{icon}</div>
        <h4 className="text-[12px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
          {title}
        </h4>
      </div>
      {children}
    </div>
  );
}

function ColorSwatch({
  color,
  isSelected,
  onClick,
  checkTone = "light",
}: {
  color: string;
  isSelected: boolean;
  onClick: () => void;
 /** `light` = white check (dark/colored swatches); `dark` = black check (white swatch) */
  checkTone?: "light" | "dark";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative h-7 w-[90%] mx-auto rounded-lg transition-transform duration-300 hover:-translate-y-0.5",
        isSelected && "shadow-md shadow-[var(--color-primary)]/20"
      )}
      style={{ background: color, border: "none" }}
    >
      {isSelected && (
        <div className="absolute inset-0 flex items-center justify-center rounded-lg">
          <Check
            className={cn(
              "w-3.5 h-3.5 drop-shadow-md",
              checkTone === "dark" ? "text-black" : "text-white",
            )}
            strokeWidth={3}
          />
        </div>
      )}
    </button>
  );
}

export function CardSettings({
  cardColor,
  setCardColor,
  cardId: externalCardId,
}: {
  cardColor: string;
  setCardColor: (color: string) => void;
  cardId?: string;
}) {
  const { data: session } = useSession();
  const [cardId, setCardId] = useState<string | null>(externalCardId ?? null);
  const [abnormalityAlerts, setAbnormalityAlerts] = useState(true);
  const [threshold, setThreshold] = useState("500");
  const [isThresholdSaved, setIsThresholdSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const token = (session as any)?.accessToken;

 // Sync cardId from prop when it changes
  useEffect(() => {
    if (externalCardId) setCardId(externalCardId);
  }, [externalCardId]);

 // Fetch card settings (alert, threshold) for the current card
  useEffect(() => {
    if (!token || !cardId) return;
    fetch(`/api/cards/${cardId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((card: any) => {
        if (!card) return;
        if (card.alertEnabled !== undefined) setAbnormalityAlerts(card.alertEnabled);
        if (card.alert_enabled !== undefined) setAbnormalityAlerts(card.alert_enabled);
        if (card.spendThreshold !== undefined) setThreshold(String(card.spendThreshold));
        if (card.spend_threshold !== undefined) setThreshold(String(card.spend_threshold));
      })
      .catch(() => {});
  }, [token, cardId]);

  const patchCard = useCallback(
    async (body: Record<string, any>) => {
      if (!cardId || !token) return;
      setIsSaving(true);
      try {
        await fetch(`/api/cards/${cardId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
        });
      } catch (err) {
        console.error("[CardSettings] patch failed:", err);
      } finally {
        setIsSaving(false);
      }
    },
    [cardId, token]
  );

  const handleToggleAlerts = () => {
    const next = !abnormalityAlerts;
    setAbnormalityAlerts(next);
    patchCard({ alert_enabled: next });
  };

  const handleSaveThreshold = () => {
    const num = parseFloat(threshold);
    if (isNaN(num) || num < 0) return;
    patchCard({ spend_threshold: num });
    setIsThresholdSaved(true);
    setTimeout(() => setIsThresholdSaved(false), 2000);
  };

  const handleSetCardColor = (color: string) => {
    setCardColor(color);
    patchCard({ gradient: color });
  };

  const cardSkins: { value: string; checkTone: "light" | "dark" }[] = [
    { value: MY_CARD_THEME_SWATCHES[0], checkTone: "light" },
    { value: MY_CARD_WHITE_SKIN_GRADIENT, checkTone: "dark" },
    { value: MY_CARD_THEME_SWATCHES[2], checkTone: "light" },
    { value: MY_CARD_THEME_SWATCHES[3], checkTone: "light" },
    { value: MY_CARD_THEME_SWATCHES[4], checkTone: "light" },
  ];

  const selectedSwatch = resolveMyCardThemeSwatch(cardColor);

  return (
    <div className="flex flex-col gap-4 w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
      <SettingSection icon={<Bell className="w-4 h-4" />} title="Notifications">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between p-4 rounded-[16px] bg-[var(--color-bg-primary)] dark:bg-white/[0.02] border border-[var(--color-border-primary)] dark:border-white/5 transition-all">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold text-[var(--color-text-primary)]">Abnormality Alerts</span>
              <span className="text-[12px] text-[var(--color-text-muted)] leading-tight">Security alerts for unusual patterns.</span>
            </div>
            <Switch
              checked={abnormalityAlerts}
              onChange={handleToggleAlerts}
              className="data-[state=checked]:bg-[var(--color-success)]"
            />
          </div>
          <div className="flex flex-col gap-3 p-0 pb-1 bg-transparent transition-all">
            <div className="flex flex-col gap-1.5 px-1 pt-2">
              <span className="text-[12px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Spend Threshold Alert</span>
              <span className="text-[12px] text-[var(--color-text-muted)] leading-tight opacity-70">Notify me for transactions exceeding this amount.</span>
            </div>
            <div className="flex items-center gap-2 px-1">
              <div className="relative flex-1 group">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] text-[14px] font-medium z-10">$</span>
                <Input
                  value={threshold}
                  onChange={(e) => {
                    setThreshold(e.target.value);
                    setIsThresholdSaved(false);
                  }}
                  className="h-10.5 pl-7.5 bg-[var(--color-bg-input)] border border-[var(--color-border-input)] rounded-[12px] text-[14px] font-medium text-[var(--color-text-primary)] outline-none focus:border-[var(--color-border-input-hover)] focus:bg-[var(--color-bg-input-hover)] transition-all"
                  placeholder="0.00"
                />
              </div>
              <Button
                size="icon"
                onClick={handleSaveThreshold}
                disabled={isSaving}
                className={cn(
                  "h-10.5 w-10.5 shrink-0 rounded-[12px] transition-all duration-300 bg-[var(--color-bg-input)] border-none",
                  isThresholdSaved
                    ? "bg-[var(--color-success)] text-[var(--color-text-primary)]"
                    : "text-[var(--color-text-muted)] hover:bg-[var(--color-bg-input-hover)]"
                )}
              >
                <Check className={cn("w-4 h-4", isThresholdSaved ? "text-[var(--color-text-primary)]" : "")} strokeWidth={3} />
              </Button>
            </div>
          </div>
        </div>
      </SettingSection>

      <SettingSection icon={<CreditCard className="w-4 h-4" />} title="Physical Card">
        <div className="grid grid-cols-2 gap-3">
          {[
            { id: "order", label: "Order Physical", sub: "Premium Metal Card", icon: <CreditCard className="w-5 h-5 text-[var(--color-primary)]" />, color: "bg-[var(--color-primary)]/10" },
            {
              id: "replace",
              label: "Replace Card",
              sub: "Lost or Damaged",
              icon: <Hand className="w-5 h-5 text-[var(--color-primary)]" strokeWidth={1.5} />,
              color: "bg-[var(--color-primary)]/10",
            },
          ].map((item) => (
            <div
              key={item.id}
              className={cn(
                "relative h-auto py-5 flex flex-col items-center gap-2 bg-[var(--color-bg-primary)] dark:bg-white/[0.02] rounded-[16px] group cursor-default",
                MY_CARD_INNER_TILE_CLASS,
              )}
            >
              <div className={cn("h-10 w-10 rounded-full flex items-center justify-center", item.color)}>
                {item.icon}
              </div>
              <div className="relative w-full flex items-center justify-center px-4 py-1">
                <span className="flex flex-col items-center text-center transition-all duration-300 group-hover:blur-[4px] group-hover:opacity-40">
                  <span className="text-sm font-semibold text-[var(--color-text-primary)] leading-tight">{item.label}</span>
                  <span className="text-[10px] text-[var(--color-text-muted)]">{item.sub}</span>
                </span>
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none bg-[var(--color-bg-input)] dark:bg-[var(--color-bg-input)] backdrop-blur-xl shadow-xl rounded-full px-4 py-1.5 whitespace-nowrap">
                  <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--color-text-primary)]">Coming Soon</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </SettingSection>

      <SettingSection icon={<Palette className="w-4 h-4" />} title="Card Theme">
        <div className="p-4 rounded-[20px] bg-[var(--color-bg-primary)] dark:bg-white/[0.02] border border-[var(--color-border-primary)] dark:border-white/5">
          <div className="flex flex-col gap-3">
            <span className="text-sm font-semibold text-[var(--color-text-primary)]">Color</span>
            <div className="grid grid-cols-5 gap-1.5">
              {cardSkins.map(({ value, checkTone }, idx) => (
                <ColorSwatch
                  key={idx}
                  color={value}
                  checkTone={checkTone}
                  isSelected={selectedSwatch === value}
                  onClick={() => handleSetCardColor(value)}
                />
              ))}
            </div>
          </div>
        </div>
      </SettingSection>
    </div>
  );
}
