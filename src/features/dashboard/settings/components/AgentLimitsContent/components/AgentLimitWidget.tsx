"use client";

import React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";

const LIMIT_LIST_ICON_CLASS =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-white/[0.04] text-white [&_svg]:h-5 [&_svg]:w-5";

const LIMIT_INPUT_CLASS =
  "h-10 w-[168px] shrink-0 rounded-[12px] border border-transparent bg-white/[0.04] px-3 text-left text-[14px] font-medium text-[var(--color-text-primary)] outline-none transition-all focus:border-white/20 focus:bg-white/[0.05]";

const SOLID_ROW_CLASS = "rounded-[20px] bg-[#2a2a2a] p-4";

const SOLID_ICON_CLASS = "bg-[#262626] text-[var(--color-text-primary)]";

const SOLID_INPUT_CLASS =
  "border border-transparent bg-[#363636] focus:border-white/20 focus:bg-[#3d3d3d]";

const SOLID_SAVE_BUTTON_CLASS =
  "border border-transparent bg-[#363636] text-[var(--color-text-muted)] hover:bg-white/10 focus:border-white/20";

interface AgentLimitWidgetProps {
  icon: React.ReactNode;
  label: string;
  description: string;
  value: string;
  prefix?: string;
  suffix?: string;
  isSaving?: boolean;
  onSave: (value: string) => void;
 /** Opaque gray rows for modals; default glass for settings pages. */
  surface?: "glass" | "solid";
}

export function AgentLimitWidget({
  icon,
  label,
  description,
  value: initialValue,
  prefix,
  suffix,
  isSaving,
  onSave,
  surface = "glass",
}: AgentLimitWidgetProps) {
  const isSolid = surface === "solid";
  const [value, setValue] = React.useState(initialValue);
  const [isSaved, setIsSaved] = React.useState(false);

  React.useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  const handleSave = () => {
    onSave(value);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  return (
    <div
      className={cn(
        isSolid
          ? SOLID_ROW_CLASS
          : "rounded-[20px] bg-white/[0.04] p-4 transition-all duration-300 hover:bg-white/5",
      )}
    >
      <div className="flex items-center gap-4">
        <div className={cn(LIMIT_LIST_ICON_CLASS, isSolid && SOLID_ICON_CLASS)}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <h4
            className={cn(
              "text-[14px] font-medium text-[var(--color-text-primary)]",
              !isSolid && "truncate",
            )}
          >
            {label}
          </h4>
          <p
            className={cn(
              "text-[11px] text-[var(--color-text-muted)]",
              isSolid ? "leading-snug text-[var(--color-text-secondary)]" : "truncate leading-none",
            )}
          >
            {description}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div className="relative">
            {prefix ? (
              <span className="absolute left-3 top-1/2 z-10 -translate-y-1/2 text-[12px] font-medium text-[var(--color-text-muted)]">
                {prefix}
              </span>
            ) : null}
            <input
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setIsSaved(false);
              }}
              className={cn(
                LIMIT_INPUT_CLASS,
                isSolid && SOLID_INPUT_CLASS,
                prefix && "pl-7",
                suffix && "pr-14",
              )}
            />
            {suffix ? (
              <span className="absolute right-3 top-1/2 z-10 -translate-y-1/2 text-[9px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
                {suffix}
              </span>
            ) : null}
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] transition-all duration-300",
              isSaved
                ? "bg-[var(--color-cta-button-bg)] text-white"
                : isSolid
                  ? SOLID_SAVE_BUTTON_CLASS
                  : "bg-white/[0.04] text-[var(--color-text-muted)] hover:bg-white/10",
            )}
            title="Save limit"
          >
            <AnimatePresence mode="wait">
              <motion.span
                key={isSaved ? "saved" : "idle"}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
              >
                <Check className="h-4 w-4" strokeWidth={3} />
              </motion.span>
            </AnimatePresence>
          </button>
        </div>
      </div>
    </div>
  );
}
