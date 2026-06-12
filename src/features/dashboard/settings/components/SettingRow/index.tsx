import React from "react";

interface SettingRowProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export default function SettingRow({
  title,
  description,
  action,
}: SettingRowProps) {
  return (
    <div className="flex flex-col items-start justify-between gap-4 border-b border-[var(--color-border-primary)]/30 py-4 last:border-0 sm:flex-row sm:items-center">
      <div className="min-w-0 flex flex-col gap-0.5">
        <h4 className="text-[14px] font-normal text-[var(--color-text-secondary)]">
          {title}
        </h4>
        <p className="text-[12px] text-[var(--color-text-muted)]">{description}</p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export type { SettingRowProps };
