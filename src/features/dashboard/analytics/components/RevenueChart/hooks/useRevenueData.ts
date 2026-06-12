"use client";

import { useState, useEffect, useMemo } from "react";
import { useAppSession } from "@/hooks/useAppSession";
import {
    generateChartData,
    getXAxisLabels,
    calculateYDomain,
    type TimeFrame,
    type RevenueDataPoint
} from "../config/revenue.config";

interface UseRevenueDataOptions {
    activeTab: TimeFrame;
    translate: (key: string) => string;
}

interface UseRevenueDataReturn {
    chartData: RevenueDataPoint[];
    xAxisLabels: string[];
    yDomain: [number, number];
}

/**
 * Hook to manage revenue chart data — fetches from API, falls back to generated mock
 */
export function useRevenueData({ activeTab, translate }: UseRevenueDataOptions): UseRevenueDataReturn {
    const { data: session } = useAppSession();
    const [apiData, setApiData] = useState<RevenueDataPoint[] | null>(null);

    useEffect(() => {
        const token = (session as any)?.accessToken;
        if (!token) return;
        fetch(`/api/analytics/revenue?timeframe=${activeTab}`, {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then((r) => (r.ok ? r.json() : []))
            .then((data: any[]) => {
                if (Array.isArray(data) && data.length > 0) {
                    setApiData(data.map((d) => ({
                        period: d.period,
                        revenue: d.revenue,
                        expenses: d.expenses,
                    })));
                } else {
                    setApiData(null);
                }
            })
            .catch(() => setApiData(null));
    }, [activeTab, session]);

    // Use API data if available, otherwise fall back to generated mock
    const chartData = useMemo(() => {
        return apiData ?? generateChartData(activeTab);
    }, [apiData, activeTab]);

    const xAxisLabels = useMemo(() => {
        return getXAxisLabels(activeTab, translate, chartData);
    }, [activeTab, chartData, translate]);

    const yDomain = useMemo(() => {
        return calculateYDomain(chartData);
    }, [chartData]);

    return { chartData, xAxisLabels, yDomain };
}
