"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SmoothTabs, type SmoothTabItem } from "@/components/SmoothTabs";
import { Home, Settings, User, Bell, FileText } from "lucide-react";
import DemoCard from "../DemoCard";

export default function TabsDemo() {
  const t = useTranslations("UIComponent");

  // SmoothTabs items with icons
  const smoothTabItems: SmoothTabItem[] = [
    {
      id: "home",
      title: t("tabs.home"),
      icon: Home,
      content: (
        <div className="p-4 rounded-lg bg-[var(--color-bg-secondary)]">
          <p className="text-sm text-[var(--color-text-primary)]">
            {t("tabs.homeContent")}
          </p>
        </div>
      ),
    },
    {
      id: "profile",
      title: t("tabs.profile"),
      icon: User,
      content: (
        <div className="p-4 rounded-lg bg-[var(--color-bg-secondary)]">
          <p className="text-sm text-[var(--color-text-primary)]">
            {t("tabs.profileContent")}
          </p>
        </div>
      ),
    },
    {
      id: "notifications",
      title: t("tabs.notifications"),
      icon: Bell,
      content: (
        <div className="p-4 rounded-lg bg-[var(--color-bg-secondary)]">
          <p className="text-sm text-[var(--color-text-primary)]">
            {t("tabs.notificationsContent")}
          </p>
        </div>
      ),
    },
    {
      id: "settings",
      title: t("tabs.settings"),
      icon: Settings,
      content: (
        <div className="p-4 rounded-lg bg-[var(--color-bg-secondary)]">
          <p className="text-sm text-[var(--color-text-primary)]">
            {t("tabs.settingsContent")}
          </p>
        </div>
      ),
    },
  ];

  return (
    <DemoCard title={t("tabs.title")} description={t("tabs.description")}>
      <div className="max-w-xl space-y-8">
        {/* Smooth Animated Tabs */}
        <div>
          <h4 className="text-sm font-medium text-[var(--color-text-primary)]  ">
            {t("tabs.smoothAnimatedTabs")}
          </h4>
          <SmoothTabs
            items={smoothTabItems}
            defaultTabId="home"
            showCardContent={false}
            tabsPosition="top"
          />
        </div>

        {/* Basic Tabs */}
        <div>
          <h4 className="text-sm font-medium text-[var(--color-text-primary)]  ">
            {t("tabs.basicTabs")}
          </h4>
          <Tabs defaultValue="account">
            <TabsList>
              <TabsTrigger value="account">{t("tabs.account")}</TabsTrigger>
              <TabsTrigger value="password">{t("tabs.password")}</TabsTrigger>
              <TabsTrigger value="settings">{t("tabs.settings")}</TabsTrigger>
            </TabsList>
            <TabsContent
              value="account"
              className="p-4 mt-2 rounded-lg bg-[var(--color-bg-secondary)]"
            >
              <p className="text-sm text-[var(--color-text-primary)]">
                {t("tabs.accountContent")}
              </p>
            </TabsContent>
            <TabsContent
              value="password"
              className="p-4 mt-2 rounded-lg bg-[var(--color-bg-secondary)]"
            >
              <p className="text-sm text-[var(--color-text-primary)]">
                {t("tabs.passwordContent")}
              </p>
            </TabsContent>
            <TabsContent
              value="settings"
              className="p-4 mt-2 rounded-lg bg-[var(--color-bg-secondary)]"
            >
              <p className="text-sm text-[var(--color-text-primary)]">
                {t("tabs.settingsTabContent")}
              </p>
            </TabsContent>
          </Tabs>
        </div>

        {/* Disabled Tab */}
        <div>
          <h4 className="text-sm font-medium text-[var(--color-text-primary)]  ">
            {t("tabs.withDisabledTab")}
          </h4>
          <Tabs defaultValue="overview">
            <TabsList>
              <TabsTrigger value="overview">{t("tabs.overview")}</TabsTrigger>
              <TabsTrigger value="analytics">{t("tabs.analytics")}</TabsTrigger>
              <TabsTrigger value="reports" disabled>
                {t("tabs.reports")}
              </TabsTrigger>
            </TabsList>
            <TabsContent
              value="overview"
              className="p-4 mt-2 rounded-lg bg-[var(--color-bg-secondary)]"
            >
              <p className="text-sm text-[var(--color-text-primary)]">
                {t("tabs.overviewContent")}
              </p>
            </TabsContent>
            <TabsContent
              value="analytics"
              className="p-4 mt-2 rounded-lg bg-[var(--color-bg-secondary)]"
            >
              <p className="text-sm text-[var(--color-text-primary)]">
                {t("tabs.analyticsContent")}
              </p>
            </TabsContent>
          </Tabs>
        </div>

        {/* Full Width Tabs */}
        <div>
          <h4 className="text-sm font-medium text-[var(--color-text-primary)]  ">
            {t("tabs.fullWidthTabs")}
          </h4>
          <Tabs defaultValue="monthly">
            <TabsList className="w-full">
              <TabsTrigger value="monthly" className="flex-1">
                {t("tabs.monthly")}
              </TabsTrigger>
              <TabsTrigger value="yearly" className="flex-1">
                {t("tabs.yearly")}
              </TabsTrigger>
            </TabsList>
            <TabsContent
              value="monthly"
              className="p-4 mt-2 rounded-lg bg-[var(--color-bg-secondary)]"
            >
              <p className="text-sm text-[var(--color-text-primary)]">
                {t("tabs.monthlyContent")}
              </p>
            </TabsContent>
            <TabsContent
              value="yearly"
              className="p-4 mt-2 rounded-lg bg-[var(--color-bg-secondary)]"
            >
              <p className="text-sm text-[var(--color-text-primary)]">
                {t("tabs.yearlyContent")}
              </p>
            </TabsContent>
          </Tabs>
        </div>

        {/* Multiple Tabs */}
        <div>
          <h4 className="text-sm font-medium text-[var(--color-text-primary)]  ">
            {t("tabs.multipleTabs")}
          </h4>
          <Tabs defaultValue="tab1" className="w-full">
            <TabsList className="flex-wrap h-auto">
              <TabsTrigger value="tab1">{t("tabs.dashboard")}</TabsTrigger>
              <TabsTrigger value="tab2">{t("tabs.projects")}</TabsTrigger>
              <TabsTrigger value="tab3">{t("tabs.team")}</TabsTrigger>
              <TabsTrigger value="tab4">{t("tabs.calendar")}</TabsTrigger>
              <TabsTrigger value="tab5">{t("tabs.documents")}</TabsTrigger>
            </TabsList>
            <TabsContent
              value="tab1"
              className="p-4 mt-2 rounded-lg bg-[var(--color-bg-secondary)]"
            >
              <p className="text-sm text-[var(--color-text-primary)]">
                {t("tabs.dashboardContent")}
              </p>
            </TabsContent>
            <TabsContent
              value="tab2"
              className="p-4 mt-2 rounded-lg bg-[var(--color-bg-secondary)]"
            >
              <p className="text-sm text-[var(--color-text-primary)]">
                {t("tabs.projectsContent")}
              </p>
            </TabsContent>
            <TabsContent
              value="tab3"
              className="p-4 mt-2 rounded-lg bg-[var(--color-bg-secondary)]"
            >
              <p className="text-sm text-[var(--color-text-primary)]">
                {t("tabs.teamContent")}
              </p>
            </TabsContent>
            <TabsContent
              value="tab4"
              className="p-4 mt-2 rounded-lg bg-[var(--color-bg-secondary)]"
            >
              <p className="text-sm text-[var(--color-text-primary)]">
                {t("tabs.calendarContent")}
              </p>
            </TabsContent>
            <TabsContent
              value="tab5"
              className="p-4 mt-2 rounded-lg bg-[var(--color-bg-secondary)]"
            >
              <p className="text-sm text-[var(--color-text-primary)]">
                {t("tabs.documentsContent")}
              </p>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </DemoCard>
  );
}
