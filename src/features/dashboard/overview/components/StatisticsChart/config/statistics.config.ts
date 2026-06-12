export interface StatisticsDataPoint {
    date: string;
    value: number;
}

// Statistics chart data
export const statisticsData: StatisticsDataPoint[] = [
    { date: "6 Mar", value: 20000 },
    { date: "7 Mar", value: 35000 },
    { date: "8 Mar", value: 30000 },
    { date: "9 Mar", value: 45000 },
    { date: "10 Mar", value: 55000 },
];

// Chart configuration
export const statisticsChartConfig = {
    // Gradient colors - uses primary brand color
    gradient: {
        start: { color: "var(--color-primary)", opacity: 0.4 },
        middle: { color: "var(--color-primary)", opacity: 0.2 },
        end: { color: "var(--color-primary)", opacity: 0.02 },
    },

    // Stroke settings
    stroke: {
        color: "var(--color-primary)",
        width: 3,
    },

    // Y-axis configuration
    yAxis: {
        domain: [0, 65000] as [number, number],
        ticks: [0, 15000, 25000, 35000, 45000, 55000, 65000],
    },

    // Dot settings
    dot: {
        fill: "var(--color-primary)",
        strokeWidth: 0,
        r: 6,
    },

    // Active dot settings
    activeDot: {
        r: 8,
        fill: "var(--color-primary)",
        stroke: "var(--color-primary)",
        strokeWidth: 0,
        style: {
            filter: "drop-shadow(0 0 6px var(--color-brand-glow))",
        },
    },
};
