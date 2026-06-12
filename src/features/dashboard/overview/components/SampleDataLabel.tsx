"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useSampleDataLabelVisible } from "../hooks/designSampleData";

export const SAMPLE_DATA_LABEL_CLASS =
  "shrink-0 text-[10px] font-medium leading-none text-[var(--color-text-muted)] sm:text-[11px]";

/** Shown beside widget titles while design sample data is active. */
export function SampleDataLabel({ className }: { className?: string }) {
  const t = useTranslations("Dashboard");
  if (!useSampleDataLabelVisible()) return null;
  return (
    <span className={cn(SAMPLE_DATA_LABEL_CLASS, className)}>
      {t("sampleDataLabel")}
    </span>
  );
}

export function SampleDataAside({
  children,
  className: _className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <>{children}</>;
}
