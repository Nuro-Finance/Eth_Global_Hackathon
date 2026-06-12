// Category chart data configuration
export interface CategoryData {
    name: string;
    value: number;
    color: string;
}

export const categoryChartConfig = {
 // Chart display settings
    chart: {
        height: 280,
        innerRadius: 55,
        outerRadius: 75,
        paddingAngle: -10,
        showLegend: true,
    },

 // Total value displayed in center
    totalValue: 7700,

 // Translation namespace for labels
    translationNamespace: "Analytics",
} as const;

// Category spending data
export const categoryData: CategoryData[] = [
    { name: "shopping", value: 35, color: "var(--color-primary)" },
    { name: "transport", value: 25, color: "var(--color-primary-light)" },
    { name: "food", value: 20, color: "#066274" },
    { name: "entertainment", value: 15, color: "#0077b6" },
    { name: "others", value: 5, color: "#082830" },
];
