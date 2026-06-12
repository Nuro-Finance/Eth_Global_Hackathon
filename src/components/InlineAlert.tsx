"use client";

import { cn } from "@/lib/utils";
import { AlertTriangle, WifiOff, XCircle } from "lucide-react";

type Tone = "default" | "warning" | "error" | "offline";

export function InlineAlert({
  tone = "default",
  title,
  description,
  action,
  className,
}: {
  tone?: Tone;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  const icon =
    tone === "error" ? (
      <XCircle className="h-4 w-4" />
    ) : tone === "offline" ? (
      <WifiOff className="h-4 w-4" />
    ) : tone === "warning" ? (
      <AlertTriangle className="h-4 w-4" />
    ) : (
      <AlertTriangle className="h-4 w-4 opacity-70" />
    );

  const toneClasses =
    tone === "error"
      ? "border-[var(--color-error)]/25 bg-[var(--color-error)]/8 text-[var(--color-text-primary)]"
      : tone === "offline"
        ? "border-[var(--color-border-input)] bg-[var(--color-bg-input)] text-[var(--color-text-primary)]"
        : tone === "warning"
          ? "border-[var(--color-warning)]/25 bg-[var(--color-warning)]/8 text-[var(--color-text-primary)]"
          : "border-[var(--color-border-input)] bg-[var(--color-bg-input)] text-[var(--color-text-primary)]";

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-[var(--radius-card)] border p-3",
        toneClasses,
        className
      )}
      role={tone === "error" ? "alert" : "status"}
    >
      <div className="mt-0.5 shrink-0 text-[var(--color-text-muted)]">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold leading-snug">{title}</div>
        {description && (
          <div className="mt-0.5 text-[12px] leading-relaxed text-[var(--color-text-muted)]">
            {description}
          </div>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export default InlineAlert;

