"use client";

import React from "react";
import { useTranslations, useLocale } from "next-intl";
import PageHeader from "@/components/PageHeader";
import { ShineBadge } from "@/components/ShineBadge";

export default function UIComponentHeader() {
  const t = useTranslations("Dashboard");
  const tUI = useTranslations("UIComponent");
  const locale = useLocale();

  // Total component count (28 unique components across all demos)
  const componentCount = 28;

  return (
    <PageHeader
      leftSection={
        <div>
          <nav className="text-sm text-[var(--color-text-muted)] mb-2">
            <span className="hover:text-[var(--color-text-primary)] cursor-pointer">
              {t("breadcrumb.dashboard") || "Dashboard"}
            </span>
            <span className="mx-2">/</span>
            <span className="text-[var(--color-text-primary)]">
              {tUI("breadcrumb.uiComponent")}
            </span>
          </nav>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-semibold text-[var(--color-text-primary)]">
              {tUI("title")}
            </h1>
            <ShineBadge variant="default" size="md">
              {componentCount} {tUI("stats.components")}
            </ShineBadge>
          </div>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            {tUI("description")}
          </p>
        </div>
      }
    />
  );
}
