// Re-export from the modular TransactionsTable structure
export { TransactionsTable as default } from "./components/TransactionsTable";

// Re-export types for backwards compatibility
export type {
  Transaction,
  TransactionsTableProps,
} from "./components/TransactionsTable/types";
