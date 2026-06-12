"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { ShineBadge } from "@/components/ShineBadge";
import DemoCard from "../DemoCard";

export default function BadgeDemo() {
  const t = useTranslations("UIComponent");

  return (
    <DemoCard title={t("badge.title")} description={t("badge.description")}>
      {/* Default Variants */}
      <div>
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("badge.variants")}
        </h4>
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="default">{t("badge.default")}</Badge>
          <Badge variant="secondary">{t("badge.secondary")}</Badge>
          <Badge variant="error">{t("badge.error")}</Badge>
          <Badge variant="outline">{t("badge.outline")}</Badge>
          <Badge variant="success">{t("badge.success")}</Badge>
          <Badge variant="warning">{t("badge.warning")}</Badge>
          <Badge variant="info">{t("badge.info")}</Badge>
          <Badge variant="primary">{t("badge.primary")}</Badge>
        </div>
      </div>

      {/* Use Cases */}
      <div>
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("badge.commonUseCases")}
        </h4>
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="primary">{t("badge.new")}</Badge>
          <Badge variant="secondary">{t("badge.beta")}</Badge>
          <Badge variant="error">{t("badge.error")}</Badge>
          <Badge variant="outline">v1.0.0</Badge>
        </div>
      </div>

      {/* Sizes */}
      <div>
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("badge.sizes")}
        </h4>
        <div className="flex flex-wrap items-center gap-3">
          <Badge size="sm">{t("badge.small")}</Badge>
          <Badge size="md">{t("badge.medium")}</Badge>
          <Badge size="lg">{t("badge.large")}</Badge>
        </div>
      </div>

      {/* Status Indicators */}
      <div>
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("common.statusIndicators")}
        </h4>
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="success" dot>
            {t("badge.active")}
          </Badge>
          <Badge variant="warning" dot>
            {t("badge.pending")}
          </Badge>
          <Badge variant="error" dot>
            {t("badge.offline")}
          </Badge>
        </div>
      </div>

      {/* Shine Badges */}
      <div>
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("badge.shineBadges") || "Shine Badges"}
        </h4>
        <div className="flex flex-wrap items-center gap-3">
          <ShineBadge variant="default">{t("badge.default")}</ShineBadge>
          <ShineBadge variant="secondary">{t("badge.secondary")}</ShineBadge>
          <ShineBadge variant="outline">{t("badge.outline")}</ShineBadge>
          <ShineBadge variant="success">{t("badge.success")}</ShineBadge>
          <ShineBadge variant="warning">{t("badge.warning")}</ShineBadge>
          <ShineBadge variant="error">{t("badge.error")}</ShineBadge>
        </div>
        <div className="flex flex-wrap items-center gap-3 mt-3">
          <ShineBadge variant="default" size="sm">
            Small
          </ShineBadge>
          <ShineBadge variant="default" size="md">
            Medium
          </ShineBadge>
          <ShineBadge variant="default" size="lg">
            Large
          </ShineBadge>
        </div>
      </div>

      {/* With Content */}
      <div>
        <h4 className="text-sm mt-5 font-medium text-[var(--color-text-primary)] mb-3">
          {t("common.notificationCount")}
        </h4>
        <div className="flex flex-wrap items-center gap-10 mt-5">
          <div className="relative inline-flex items-center">
            <span className="text-xs text-[var(--color-text-primary)]">
              {t("badge.messages")}
            </span>
            <Badge
              variant="primary"
              size="sm"
              className="absolute -top-2 -end-4 min-w-4 h-4 px-1 flex items-center justify-center rounded-full text-[9px] font-semibold"
            >
              3
            </Badge>
          </div>
          <div className="relative inline-flex items-center">
            <span className="text-xs text-[var(--color-text-primary)]">
              {t("badge.alerts")}
            </span>
            <Badge
              variant="error"
              size="sm"
              className="absolute -top-2 -end-5 min-w-4 h-4 px-1 flex items-center justify-center rounded-full text-[9px] font-semibold"
            >
              9+
            </Badge>
          </div>
          <div className="relative inline-flex items-center">
            <span className="text-xs text-[var(--color-text-primary)]">
              {t("badge.updates")}
            </span>
            <Badge
              variant="success"
              size="sm"
              className="absolute -top-2 -end-5 min-w-4 h-4 px-1 flex items-center justify-center rounded-full text-[9px] font-semibold"
            >
              12
            </Badge>
          </div>
        </div>
      </div>
    </DemoCard>
  );
}
