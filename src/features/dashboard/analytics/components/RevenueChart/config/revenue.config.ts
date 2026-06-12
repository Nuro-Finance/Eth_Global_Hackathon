// Revenue chart configuration and data generators

export interface RevenueDataPoint {
    period: string;
    revenue: number;
    expenses: number;
    [key: string]: string | number; // Index signature for chart compatibility
}

export type TimeFrame = "daily" | "weekly" | "monthly" | "yearly";

// Available tabs for time frame selection
export const timeFrameTabs: TimeFrame[] = ["daily", "weekly", "monthly", "yearly"];

// Static monthly data
export const monthlyData: RevenueDataPoint[] = [
    { period: "Jan", revenue: 45, expenses: 30 },
    { period: "Feb", revenue: 52, expenses: 35 },
    { period: "Mar", revenue: 48, expenses: 32 },
    { period: "Apr", revenue: 61, expenses: 40 },
    { period: "May", revenue: 58, expenses: 38 },
    { period: "Jun", revenue: 67, expenses: 42 },
    { period: "Jul", revenue: 72, expenses: 45 },
    { period: "Aug", revenue: 69, expenses: 43 },
    { period: "Sep", revenue: 75, expenses: 48 },
    { period: "Oct", revenue: 78, expenses: 50 },
    { period: "Nov", revenue: 82, expenses: 52 },
    { period: "Dec", revenue: 85, expenses: 55 },
];

/**
 * Generates chart data based on the selected time frame
 */
export function generateChartData(timeFrame: TimeFrame): RevenueDataPoint[] {
    switch (timeFrame) {
        case "daily":
            return Array.from({ length: 24 }, (_, i) => {
                const hour = i;
                const baseRevenue = 15 + Math.sin(i * 0.3) * 8 + Math.random() * 5;
                const baseExpenses = 8 + Math.sin(i * 0.2) * 4 + Math.random() * 3;
                return {
                    period: `${hour}:00`,
                    revenue: Math.round(baseRevenue * 10) / 10,
                    expenses: Math.round(baseExpenses * 10) / 10,
                };
            });

        case "weekly":
            const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
            return days.map((day, i) => {
                const baseRevenue = 180 + Math.sin(i * 0.8) * 30 + Math.random() * 25;
                const baseExpenses = 120 + Math.sin(i * 0.6) * 20 + Math.random() * 15;
                return {
                    period: day,
                    revenue: Math.round(baseRevenue),
                    expenses: Math.round(baseExpenses),
                };
            });

        case "monthly":
            return monthlyData;

        case "yearly":
            return Array.from({ length: 5 }, (_, i) => {
                const year = new Date().getFullYear() - 4 + i;
                const baseRevenue = 650 + i * 85 + Math.random() * 50;
                const baseExpenses = 420 + i * 45 + Math.random() * 30;
                return {
                    period: year.toString(),
                    revenue: Math.round(baseRevenue),
                    expenses: Math.round(baseExpenses),
                };
            });

        default:
            return [];
    }
}

/**
 * Generates X-axis labels based on time frame
 */
export function getXAxisLabels(timeFrame: TimeFrame, t: (key: string) => string, chartData: RevenueDataPoint[]): string[] {
    switch (timeFrame) {
        case "daily":
            return ["00:00", "04:00", "08:00", "12:00", "16:00", "20:00", "24:00"];
        case "weekly":
            return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
        case "monthly":
            return [
                t("jan"), t("feb"), t("mar"), t("apr"), t("may"), t("jun"),
                t("jul"), t("aug"), t("sep"), t("oct"), t("nov"), t("dec"),
            ];
        case "yearly":
            return chartData.map((item) => item.period);
        default:
            return [];
    }
}

/**
 * Calculate Y-axis domain based on data
 */
export function calculateYDomain(chartData: RevenueDataPoint[]): [number, number] {
    if (!chartData.length) return [0, 100];

    const maxRevenue = Math.max(...chartData.map((item) => item.revenue));
    const maxExpenses = Math.max(...chartData.map((item) => item.expenses));
    const maxValue = Math.max(maxRevenue, maxExpenses);

    return [0, Math.ceil(maxValue * 1.1)];
}
