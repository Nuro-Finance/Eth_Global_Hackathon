import React, { useState } from "react";
import { Check, ShieldAlert } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/button";
import { SkeletonBlock } from "@/components";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { useCardControls } from "../hooks/useCardControls";

interface LimitInputProps {
  label: string;
  description: string;
  value: string;
  used?: number;
  total?: number;
  prefix?: string;
  suffix?: string;
  onSave: (val: string) => void;
  isSaving?: boolean;
  isLoading?: boolean;
}

function LimitInputCard({
  label,
  description,
  value: initialValue,
  used,
  total,
  prefix,
  suffix,
  onSave,
  isSaving,
  isLoading,
}: LimitInputProps) {
  const [value, setValue] = useState(initialValue);
  const [isSaved, setIsSaved] = useState(false);

 // Sync when prop changes (e.g. after fetch)
  React.useEffect(() => { setValue(initialValue); }, [initialValue]);

  const handleSave = () => {
    onSave(value);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const hasUsage = used !== undefined && total !== undefined;
  const percentage = hasUsage ? Math.min(100, Math.max(0, (used / total) * 100)) : 0;
  const isNearLimit = percentage > 85;

  return (
    <div className="flex flex-col gap-3 p-0 pb-1 bg-transparent transition-all">
      <div className="flex flex-col gap-1.5 px-1">
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-semibold uppercase tracking-wider text-white">{label}</span>
          {isLoading ? (
            <SkeletonBlock className="h-3 w-28 shrink-0 rounded-[6px]" />
          ) : (
            hasUsage && (
              <span className="text-[11px] font-medium text-[var(--color-text-muted)]">
                {prefix}{used.toLocaleString()} / {prefix}{total.toLocaleString()}
              </span>
            )
          )}
        </div>
        <span className="text-[12px] text-[var(--color-text-muted)] leading-tight opacity-70">{description}</span>
      </div>
      {hasUsage && !isLoading && (
        <div className="px-1 mt-0.5">
          <div className="h-1.5 w-full bg-[var(--color-bg-tertiary)] dark:bg-white/5 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${percentage}%` }}
              transition={{ duration: 1, ease: "easeOut" }}
              className={cn(
                "h-full rounded-full",
                isNearLimit ? "bg-amber-400" : "bg-[var(--color-primary)]"
              )}
            />
          </div>
        </div>
      )}
      {isLoading && (
        <div className="px-1 mt-0.5">
          <SkeletonBlock className="h-1.5 w-full rounded-full" />
        </div>
      )}
      <div className="flex items-center gap-2 px-1">
        <div className="relative flex-1 group">
          {prefix && !isLoading && (
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] text-[14px] font-medium z-10">
              {prefix}
            </span>
          )}
          {isLoading ? (
            <SkeletonBlock className="h-10.5 w-full rounded-[12px]" />
          ) : (
            <Input
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setIsSaved(false);
              }}
              className={cn(
                "h-10.5 bg-white/[0.04] border border-white/10 rounded-[12px] text-[14px] font-medium text-[var(--color-text-primary)] outline-none focus:border-[var(--color-success)]/40 focus:bg-white/[0.05] transition-all",
                prefix && "pl-7.5",
                suffix && "pr-13"
              )}
            />
          )}
          {suffix && !isLoading && (
            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] text-[11px] font-bold uppercase tracking-wider z-10">
              {suffix}
            </span>
          )}
        </div>
        <Button
          size="icon"
          onClick={handleSave}
          disabled={isSaving}
          className={cn(
            "h-10.5 w-10.5 shrink-0 rounded-[12px] transition-all duration-300 bg-white/[0.04] border-none",
            isSaved
              ? "bg-[var(--color-success)] text-white"
              : "text-[var(--color-text-muted)] hover:bg-white/10"
          )}
        >
          <Check className={cn("w-4 h-4", isSaved ? "text-white" : "")} strokeWidth={3} />
        </Button>
      </div>
    </div>
  );
}

export function CardLimits({ cardId }: { cardId?: string }) {
  const { controls, isLoading, isSaving, saveControls } = useCardControls(cardId);

  const parseNum = (v: string) => Number(v.replace(/,/g, "")) || 0;

  return (
    <div className="flex flex-col gap-3 w-full pb-2 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-2 mb-1 px-1">
        <ShieldAlert className="w-4 h-4 text-[var(--color-primary)]" />
        <h4 className="text-[12px] font-semibold uppercase tracking-wider text-[var(--color-primary)]">
          Spend Controls
        </h4>
      </div>
      <LimitInputCard
        label="Daily Spend Limit"
        description="Set maximum spend per 24 hours."
        value={controls.daily_limit.toLocaleString()}
        used={controls.daily_used}
        total={controls.daily_limit}
        prefix="$"
        suffix="USD"
        isSaving={isSaving}
        isLoading={isLoading}
        onSave={(v) => saveControls({ daily_limit: parseNum(v) })}
      />
      <LimitInputCard
        label="Monthly Spend Limit"
        description="Set maximum total spend per billing cycle."
        value={controls.monthly_limit.toLocaleString()}
        used={controls.monthly_used}
        total={controls.monthly_limit}
        prefix="$"
        suffix="USD"
        isSaving={isSaving}
        isLoading={isLoading}
        onSave={(v) => saveControls({ monthly_limit: parseNum(v) })}
      />
      <div className="flex items-center gap-2 mt-4 mb-1 px-1">
        <ShieldAlert className="w-4 h-4 text-[var(--color-primary)]" />
        <h4 className="text-[12px] font-semibold uppercase tracking-wider text-[var(--color-primary)]">
          Agentic Security Limits
        </h4>
      </div>
      <LimitInputCard
        label="Per-Transaction Limit"
        description="Block any single abnormally large purchase."
        value={controls.per_tx_limit.toLocaleString()}
        prefix="$"
        suffix="USD"
        isSaving={isSaving}
        isLoading={isLoading}
        onSave={(v) => saveControls({ per_tx_limit: parseNum(v) })}
      />
      <LimitInputCard
        label="Transaction Velocity Limit"
        description="Max transactions allowed per hour."
        value={String(controls.velocity_per_hr)}
        suffix="Tx/Hr"
        isSaving={isSaving}
        isLoading={isLoading}
        onSave={(v) => saveControls({ velocity_per_hr: parseNum(v) })}
      />
    </div>
  );
}
