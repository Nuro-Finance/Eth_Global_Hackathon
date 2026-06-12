"use client";

import { RevenueChart } from "../../../components/RevenueChart";
import { CategoryChart } from "../../../components/CategoryChart";
import { WeeklyActivity } from "../../../components/WeeklyActivity";
import { RecentTransactions } from "../../../components/RecentTransactions";

/**
 * AnalyticsCharts - Main charts section for analytics
 */
export function AnalyticsCharts() {
  return (
    <div className="space-y-5">
      {/* Row 1: Revenue Chart (wide) + Category Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <RevenueChart />
        <CategoryChart />
      </div>

      {/* Row 2: Weekly Activity + Recent Transactions Table */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <WeeklyActivity />
        <RecentTransactions />
      </div>
    </div>
  );
}
