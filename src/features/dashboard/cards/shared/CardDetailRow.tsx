"use client";

export interface CardDetailRowProps {
  label: string;
  value: string;
}

/**
 * Shared component for displaying a card detail row
 */
export function CardDetailRow({ label, value }: CardDetailRowProps) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-[var(--color-border-primary)]/30">
      <span className="text-[var(--color-text-muted)] text-[12px] sm:text-[13px]">
        {label}
      </span>
      <span className="text-[var(--color-text-secondary)] text-[13px] sm:text-[14px] font-normal truncate ml-2">
        {value}
      </span>
    </div>
  );
}
