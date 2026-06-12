"use client";

import DashboardHeader from "./components/DashboardHeader";
import WelcomeBanner from "./components/WelcomeBanner";
import WidgetGrid from "./components/WidgetGrid";
import { DashboardDateRangeProvider } from "./context/DashboardDateRangeContext";

export default function DashboardGrid() {
  return (
    <DashboardDateRangeProvider>
      <div className="relative">
        <DashboardHeader />
        {/* S35 M11 Day-3: bridges the public marketing CTA ("Open your
            dashboard, watch the autonomous action happen") to the actual
            dashboard. Dismissible, persists via localStorage. */}
        <WelcomeBanner />
        <WidgetGrid />
      </div>
    </DashboardDateRangeProvider>
  );
}
