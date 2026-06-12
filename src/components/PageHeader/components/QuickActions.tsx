"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { DateRange } from "react-day-picker";
import { DateRangePicker } from "@/components/dateRangePicker";
import { useDashboardDateRange } from "@/features/dashboard/overview/layouts/DashboardGrid/context/DashboardDateRangeContext";

export function QuickActions() {
  const t = useTranslations();
  const { dateRange, setDateRange } = useDashboardDateRange();

  const handleDateRangeChange = (range: DateRange | undefined) => {
    setDateRange(range);
  };

  return (
    <>
      {/* Date Range Picker - Hidden on mobile */}
      <div className="hidden md:block">
        <DateRangePicker
          date={dateRange}
          onDateChange={handleDateRangeChange}
          placeholder={t("Dashboard.selectTimeRange") || "Select time range"}
          className="min-w-[100px]"
          translations={{
            custom: t("DateRange.custom") || "Custom",
            today: t("DateRange.today") || "Today",
            yesterday: t("DateRange.yesterday") || "Yesterday",
            last7Days: t("DateRange.last7Days") || "Last 7 days",
            last28Days: t("DateRange.last28Days") || "Last 28 days",
            last30Days: t("DateRange.last30Days") || "Last 30 days",
            thisMonth: t("DateRange.thisMonth") || "This Month",
            lastMonth: t("DateRange.lastMonth") || "Last Month",
            quickSelect: t("DateRange.quickSelect") || "Quick Select",
            from: t("DateRange.from") || "From",
            to: t("DateRange.to") || "To",
            selectDate: t("DateRange.selectDate") || "Select date",
            daysSelected: t("DateRange.daysSelected") || "days selected",
            cancel: t("DateRange.cancel") || "Cancel",
            apply: t("DateRange.apply") || "Apply",
          }}
        />
      </div>
    </>
  );
}

export default QuickActions;
