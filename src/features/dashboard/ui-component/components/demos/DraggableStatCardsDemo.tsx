"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { DraggableStatsGrid } from "@/components";
import {
  ANALYTICS_STATS_DATA,
  ANALYTICS_ICONS,
} from "@/features/dashboard/analytics/layouts/AnalyticsGrid/config";
import DemoCard from "../DemoCard";

export default function DraggableStatCardsDemo() {
  const t = useTranslations("Analytics");
  const tUI = useTranslations("UIComponent");

  // Translate titles and add icons
  const demoStats = ANALYTICS_STATS_DATA.map((stat) => {
    const IconComponent =
      ANALYTICS_ICONS[stat.iconName as keyof typeof ANALYTICS_ICONS];
    return {
      ...stat,
      title: t(stat.title),
      icon: IconComponent ? <IconComponent className="w-5 h-5" /> : undefined,
    };
  });

  return (
    <DemoCard
      title={tUI("draggableCards.title")}
      description={tUI("draggableCards.description")}
      className="bg-transparent   dark:bg-[var(--color-bg-secondary)]"
    >
      {/* Draggable Stats Grid */}
      <div>
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {tUI("draggableCards.draggableGrid")}
        </h4>
        <DraggableStatsGrid
          storageKey="demo-stats"
          stats={demoStats}
          isDraggable={true}
          gridClassName="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
        />
      </div>

      {/* Non-Draggable Stats Grid */}
      <div>
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {tUI("draggableCards.staticGrid")}
        </h4>
        <DraggableStatsGrid
          storageKey="demo-stats-static"
          stats={demoStats}
          isDraggable={false}
          gridClassName="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
        />
      </div>
    </DemoCard>
  );
}
