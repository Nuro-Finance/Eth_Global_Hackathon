/**
 * BarChartWidget Configuration
 * Contains performance data and chart settings
 */

export interface PerformanceItem {
    category: string;
    value: number;
    growth: number;
    color: string;
}

export const PERFORMANCE_DATA: PerformanceItem[] = [
    { category: "Stocks", value: 15420, growth: 12.4, color: "#22C55E" },
    { category: "Bonds", value: 8930, growth: 4.2, color: "#3B82F6" },
    { category: "Real Estate", value: 12680, growth: 8.7, color: "#F59E0B" },
    { category: "Crypto", value: 5240, growth: -3.1, color: "#EF4444" },
    { category: "Commodities", value: 7850, growth: 6.8, color: "#8B5CF6" },
    { category: "Cash", value: 3420, growth: 1.2, color: "#6B7280" },
];

export const BAR_CHART_COLOR = "var(--color-card-accent)";

// Summary calculations
export function calculateTotalValue(data: PerformanceItem[]): number {
    return data.reduce((sum, item) => sum + item.value, 0);
}

export function calculateAvgGrowth(data: PerformanceItem[]): number {
    const weightedGrowth = data.reduce(
        (sum, item) => sum + (item.value * item.growth) / 100,
        0
    );
    const totalValue = calculateTotalValue(data);
    return (weightedGrowth / totalValue) * 100;
}

export function countPositive(data: PerformanceItem[]): number {
    return data.filter((item) => item.growth > 0).length;
}
