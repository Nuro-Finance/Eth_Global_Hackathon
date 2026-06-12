// Weekly activity heatmap configuration

export interface DayActivity {
    day: string;
    dayShort: string;
    transactions: number;
    amount: number;
}

export const weeklyActivityConfig = {
    translationNamespace: "Analytics",
    maxIntensity: 5, // Maximum color intensity levels
} as const;

// Weekly activity data (current week)
export const weeklyActivityData: DayActivity[] = [
    { day: "monday", dayShort: "mon", transactions: 12, amount: 2340 },
    { day: "tuesday", dayShort: "tue", transactions: 8, amount: 1560 },
    { day: "wednesday", dayShort: "wed", transactions: 23, amount: 4780 },
    { day: "thursday", dayShort: "thu", transactions: 15, amount: 2890 },
    { day: "friday", dayShort: "fri", transactions: 31, amount: 6420 },
    { day: "saturday", dayShort: "sat", transactions: 19, amount: 3150 },
    { day: "sunday", dayShort: "sun", transactions: 5, amount: 890 },
];

// Get intensity level (1-5) based on transaction count
export function getIntensityLevel(transactions: number, data: DayActivity[]): number {
    const max = Math.max(...data.map(d => d.transactions));
    const min = Math.min(...data.map(d => d.transactions));
    const range = max - min || 1;
    const normalized = (transactions - min) / range;
    return Math.ceil(normalized * 5) || 1;
}
