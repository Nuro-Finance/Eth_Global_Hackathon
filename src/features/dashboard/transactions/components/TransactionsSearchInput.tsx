"use client";

import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

export function TransactionsSearchInput({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const t = useTranslations("Transactions");

  return (
    <div className={cn("relative h-8 w-full min-w-[9.5rem] sm:min-w-[11rem]", className)}>
      <Search
        className="pointer-events-none absolute left-2.5 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-text-muted)]"
        aria-hidden
      />
      <input
        type="search"
        placeholder={t("search") || "Search..."}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-full rounded-[var(--radius-sm)] border border-transparent bg-[var(--color-bg-input)] pl-8 pr-3 text-sm text-[var(--color-text-primary)] backdrop-blur-none placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-border-input-focus)] focus:outline-none"
      />
    </div>
  );
}
