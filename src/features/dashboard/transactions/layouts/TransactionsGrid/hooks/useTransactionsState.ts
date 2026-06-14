"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { useSession } from "next-auth/react";
import { DateRange } from "react-day-picker";
import type { Transaction, TransactionFormData, FilterData } from "../../../shared";
import type { DataState } from "@/lib/dataState";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useTransactionDetailModal } from "./useTransactionDetailModal";
import { MOCK_TRANSACTIONS } from "@/config/mock-data";
import {
    DEMO_SAMPLE_CLEARED_EVENT,
    DEMO_SAMPLE_RESTORED_EVENT,
    ONBOARDING_DEPOSIT_COMPLETE_EVENT,
    useDesignSampleDataActive,
} from "@/features/dashboard/overview/hooks/designSampleData";
import {
    isDevPreviewAvailable,
    NURO_DEV_PREVIEW_CHANGED_EVENT,
} from "@/lib/devPreviewMode";
import { FIRST_DEPOSIT_SUCCESS_EVENT } from "@/lib/dashboardInFlightOperation";
import { NURO_DASHBOARD_REFRESH_EVENT } from "@/features/dashboard/overview/layouts/DashboardGrid/context/DashboardRefreshContext";

interface UseTransactionsStateOptions {
    t: (key: string) => string;
    externalDateRange?: import('react-day-picker').DateRange;
}

interface BackendTransaction {
    id: string;
    card_id?: string;
    cardId?: string;
    name?: string;
    amount: number;
    description?: string;
    type?: string;
    status?: string;
    created_at?: string;
    date?: string;
    merchant_name?: string;
    category?: string;
}

function mapBackendTransaction(tx: BackendTransaction): Transaction {
    const typeLower = (tx.type ?? "").toLowerCase();
    const isIncoming = (tx as any).isIncoming != null
        ? Boolean((tx as any).isIncoming)
        : tx.amount >= 0
            ? !typeLower.includes("purchase") && !typeLower.includes("subscription") && !typeLower.includes("withdrawal")
            : false;

    return {
        id: String(tx.id),
        name: tx.name ?? tx.merchant_name ?? tx.description ?? (isIncoming ? "Deposit" : "Payment"),
        type: tx.type ?? "bankTransfer",
        amount: Math.abs(tx.amount),
        isIncoming,
        date: tx.created_at ?? tx.date ?? new Date().toISOString(),
        category: tx.category ?? (isIncoming ? "income" : "shopping"),
        status: tx.status ?? "completed",
        cardId: tx.card_id ?? tx.cardId,
    };
}

/**
 * Hook for managing transactions state - fetches real data from backend, falls back to mock.
 */
export function useTransactionsState({ t, externalDateRange }: UseTransactionsStateOptions) {
    const { online } = useOnlineStatus();
    const { data: session } = useSession();
    const designSampleActive = useDesignSampleDataActive();

 // Initialize empty; dev sample data loads only for demo dev sessions.
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [isLoading, setIsLoading] = useState(!isDevPreviewAvailable());

    const [lastUpdatedAt, setLastUpdatedAt] = useState<number>(() => Date.now());
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [usedMock, setUsedMock] = useState(false);
    const [selectedDateRange, setSelectedDateRange] = useState<DateRange | undefined>();
    const [activeFilters, setActiveFilters] = useState<FilterData>({ category: "", status: "", type: "" });

    const effectiveDateRange = externalDateRange ?? selectedDateRange;

    const buildFilterQuery = useCallback(() => {
        const params = new URLSearchParams();
        if (activeFilters.status) params.set("status", activeFilters.status);
        if (activeFilters.type) params.set("type", activeFilters.type);
        if (effectiveDateRange?.from) params.set("dateFrom", effectiveDateRange.from.toISOString());
        if (effectiveDateRange?.to) params.set("dateTo", effectiveDateRange.to.toISOString());
        const qs = params.toString();
        return qs ? `?${qs}` : "";
    }, [activeFilters, effectiveDateRange]);

    const fetchTransactions = useCallback(async (options?: { refresh?: boolean }) => {
        const isRefresh = options?.refresh ?? false;

        try {
            if (isDevPreviewAvailable()) {
                if (designSampleActive) {
                    setTransactions(MOCK_TRANSACTIONS.map(mapBackendTransaction));
                    setUsedMock(true);
                } else {
                    setTransactions([]);
                    setUsedMock(false);
                }
                if (!isRefresh) setIsLoading(false);
                setLastUpdatedAt(Date.now());
                return;
            }

            if (!session?.accessToken) {
                if (!isRefresh) setTransactions([]);
                return;
            }

            if (!isRefresh) setIsLoading(true);

            const res = await fetch(`/api/card-transactions${buildFilterQuery()}`, {
                headers: { Authorization: `Bearer ${session.accessToken}` },
            });
            if (res.ok) {
                const data = await res.json();
                const rows: BackendTransaction[] = Array.isArray(data) ? data : (data.transactions ?? []);
                setTransactions(rows.map(mapBackendTransaction));
                setUsedMock(false);
            } else {
                console.warn("[useTransactionsState] fetch failed:", res.status);
                setTransactions([]);
            }
        } catch (err) {
            console.warn("[useTransactionsState] fetch error:", err);
            setTransactions([]);
        } finally {
            if (!isRefresh) setIsLoading(false);
            setLastUpdatedAt(Date.now());
        }
    }, [session?.accessToken, buildFilterQuery, designSampleActive]);

    useEffect(() => {
        fetchTransactions();
    }, [fetchTransactions]);

    useEffect(() => {
        const onPreviewChange = () => {
            if (!isDevPreviewAvailable()) return;
            void fetchTransactions();
        };
        window.addEventListener(DEMO_SAMPLE_CLEARED_EVENT, onPreviewChange);
        window.addEventListener(DEMO_SAMPLE_RESTORED_EVENT, onPreviewChange);
        window.addEventListener(NURO_DEV_PREVIEW_CHANGED_EVENT, onPreviewChange);
        window.addEventListener(ONBOARDING_DEPOSIT_COMPLETE_EVENT, onPreviewChange);
        window.addEventListener(FIRST_DEPOSIT_SUCCESS_EVENT, onPreviewChange);
        return () => {
            window.removeEventListener(DEMO_SAMPLE_CLEARED_EVENT, onPreviewChange);
            window.removeEventListener(DEMO_SAMPLE_RESTORED_EVENT, onPreviewChange);
            window.removeEventListener(NURO_DEV_PREVIEW_CHANGED_EVENT, onPreviewChange);
            window.removeEventListener(ONBOARDING_DEPOSIT_COMPLETE_EVENT, onPreviewChange);
            window.removeEventListener(FIRST_DEPOSIT_SUCCESS_EVENT, onPreviewChange);
        };
    }, [fetchTransactions]);

    const {
        selectedTransaction,
        handleTransactionSelect,
        closeTransactionDetail,
        isTransactionDetailOpen,
    } = useTransactionDetailModal();

    const handleDateRangeSelect = useCallback((dateRange: DateRange | undefined) => {
        setSelectedDateRange(dateRange);
    }, []);

    const handleFiltersApply = useCallback((filters: FilterData) => {
        setActiveFilters(filters);
        
    }, []);

    const handleExportComplete = useCallback(() => {
        console.log("Export completed");
    }, []);

    const refresh = useCallback(async () => {
        if (isRefreshing) return;
        setIsRefreshing(true);
        const started = Date.now();
        try {
            await fetchTransactions({ refresh: true });
        } finally {
            const remaining = Math.max(0, 400 - (Date.now() - started));
            if (remaining > 0) {
                await new Promise((resolve) => setTimeout(resolve, remaining));
            }
            setIsRefreshing(false);
        }
    }, [isRefreshing, fetchTransactions]);

    useEffect(() => {
        const onDashboardRefresh = () => {
            void refresh();
        };
        window.addEventListener(NURO_DASHBOARD_REFRESH_EVENT, onDashboardRefresh);
        return () => window.removeEventListener(NURO_DASHBOARD_REFRESH_EVENT, onDashboardRefresh);
    }, [refresh]);

    const dataState = useMemo<DataState>(() => {
        const source = usedMock ? "mock" : "live";
        if (!online) return { status: "offline", meta: { lastUpdatedAt, source } };
        if (isRefreshing) return { status: "refreshing", meta: { lastUpdatedAt, source } };
        if (isLoading) return { status: "loading", meta: { source } };
        return { status: "success", meta: { lastUpdatedAt, source } };
    }, [isLoading, isRefreshing, lastUpdatedAt, online, usedMock]);
    const handleAddTransaction = useCallback(async (transactionData: TransactionFormData) => {
        try {
            const res = await fetch("/api/card-transactions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${session?.accessToken || ""}`,
                },
                body: JSON.stringify({
                    name: transactionData.name,
                    amount: parseFloat(transactionData.amount),
                    type: transactionData.type,
                    category: transactionData.category,
                    isIncoming: transactionData.isIncoming,
                }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || "Failed to add transaction");
            }
            const created = await res.json();
            refresh();
            return created;
        } catch (err) {
            console.error("[handleAddTransaction] failed:", err);
            throw err;
        }
    }, [refresh, session?.accessToken]);

    return {
        transactions,
        isLoading,
        isRefreshing,
        dataState,
        refresh,
        selectedDateRange,
        handleTransactionSelect,
        selectedTransaction,
        closeTransactionDetail,
        isTransactionDetailOpen,
        handleDateRangeSelect,
        handleFiltersApply,
        handleExportComplete,
        handleAddTransaction,
    };
}
