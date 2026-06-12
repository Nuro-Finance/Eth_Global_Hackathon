import { DollarSign, TrendingDown, TrendingUp, Percent } from "lucide-react";
import type { StatData } from "@/components";

/**
 * Mock analytics stats data (API structure)
 * Note: Icons are added as React elements for the StatCard component
 */
export const ANALYTICS_STATS_DATA: (Omit<StatData, "icon"> & { iconName: string })[] = [
    {
        id: "revenue",
        title: "totalRevenue",
        value: "$284,382",
        change: 12.5,
        isPositive: true,
        iconName: "DollarSign",
    },
    {
        id: "expenses",
        title: "totalExpenses",
        value: "$142,847",
        change: -8.2,
        isPositive: false,
        iconName: "TrendingDown",
    },
    {
        id: "profit",
        title: "netProfit",
        value: "$141,535",
        change: 23.1,
        isPositive: true,
        iconName: "TrendingUp",
    },
    {
        id: "savings",
        title: "savingsRate",
        value: "49.7%",
        change: 5.3,
        isPositive: true,
        iconName: "Percent",
    },
];

/**
 * Icon mapping for analytics stats
 */
export const ANALYTICS_ICONS = {
    DollarSign,
    TrendingDown,
    TrendingUp,
    Percent,
} as const;

/**
 * Translation keys for stats titles
 */
export type StatsTranslationKey =
    | "totalRevenue"
    | "totalExpenses"
    | "netProfit"
    | "savingsRate";
