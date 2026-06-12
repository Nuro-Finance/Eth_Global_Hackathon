// Recent transactions table configuration

export type IconType = "shopping" | "income" | "entertainment" | "transport" | "food" | "transfer" | "subscription" | "utilities";

export interface TransactionRow {
    id: string;
    merchant: string;
    category: string;
    date: string;
    amount: number;
    status: "completed" | "pending" | "failed";
    iconType: IconType;
}

export const recentTransactionsConfig = {
    translationNamespace: "Analytics",
    maxRows: 6,
} as const;

// Recent transactions data with fake company names
export const recentTransactionsData: TransactionRow[] = [
    {
        id: "txn-001",
        merchant: "ShopMart Plus",
        category: "shopping",
        date: "2024-12-17",
        amount: -284.50,
        status: "completed",
        iconType: "shopping",
    },
    {
        id: "txn-002",
        merchant: "Payroll Direct",
        category: "income",
        date: "2024-12-15",
        amount: 5200.00,
        status: "completed",
        iconType: "income",
    },
    {
        id: "txn-003",
        merchant: "StreamVibe",
        category: "entertainment",
        date: "2024-12-14",
        amount: -14.99,
        status: "completed",
        iconType: "entertainment",
    },
    {
        id: "txn-004",
        merchant: "QuickRide",
        category: "transport",
        date: "2024-12-13",
        amount: -32.40,
        status: "completed",
        iconType: "transport",
    },
    {
        id: "txn-005",
        merchant: "FreshMart",
        category: "food",
        date: "2024-12-12",
        amount: -156.80,
        status: "completed",
        iconType: "food",
    },
    {
        id: "txn-006",
        merchant: "Savings Account",
        category: "transfer",
        date: "2024-12-11",
        amount: -500.00,
        status: "pending",
        iconType: "transfer",
    },
];

// Get status color
export function getStatusColor(status: TransactionRow["status"]): string {
    const colors = {
        completed: "var(--color-success)",
        pending: "var(--color-warning)",
        failed: "var(--color-error)",
    };
    return colors[status];
}
