"use client";

import { SmoothTabs, type SmoothTabItem } from "@/components";

interface TabConfig {
  id: string;
  label: string;
}

interface CategoryTabsProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  tabs: TabConfig[];
}

/**
 * Category tabs for filtering stocks with smooth animations
 */
export function CategoryTabs({
  activeTab,
  onTabChange,
  tabs,
}: CategoryTabsProps) {
  // Convert tab config to SmoothTabItem format
  const tabItems: SmoothTabItem[] = tabs.map((tab) => ({
    id: tab.id,
    title: tab.label,
  }));

  return (
    <SmoothTabs
      items={tabItems}
      value={activeTab}
      onValueChange={onTabChange}
      showCardContent={false}
      tabsPosition="top"
      className="w-full"
      noWrap
    />
  );
}
