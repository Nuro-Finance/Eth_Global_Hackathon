// Transaction related types

export interface Transaction {
    id: string;
    name: string;
    type: string;
    amount: number;
    isIncoming: boolean;
    date: string;
    category: string;
    status: string;
    cardId?: string;
}

export interface TransactionFormData {
    name: string;
    amount: string;
    type: string;
    category: string;
    isIncoming: boolean;
}

export interface FilterData {
    category: string;
    status: string;
    type: string;
}

// Additional utility types
export type TransactionStatus = "completed" | "pending" | "failed";
export type TransactionType =
    | "bankTransfer"
    | "cardPayment"
    | "recurringPayment"
    | "directDeposit";
export type TransactionCategory =
    | "income"
    | "transfer"
    | "entertainment"
    | "shopping"
    | "food";

export interface ExportOptions {
    format: "csv" | "xlsx" | "pdf";
    filename?: string;
    includeHeaders?: boolean;
}
