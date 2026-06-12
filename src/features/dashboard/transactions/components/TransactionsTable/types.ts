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

export interface TransactionsTableProps {
  transactions: Transaction[];
  onTransactionSelect?: (transaction: Transaction) => void;
  isLoading?: boolean;
 /**
 * `default`: search, filters, table, pagination (full page).
 * `modal`: table tuned for dialogs.
 * `embedded`: table and pagination for overview widgets; default page size from `embeddedMaxRows`.
 */
  variant?: "default" | "modal" | "embedded";
 /** Default page size when `variant` is `embedded`. Default `5`. */
  embeddedMaxRows?: number;
 /** Column IDs to hide (merged with the defaults like `type`). */
  hiddenColumns?: string[];
 /** Controlled global search (optional; embedded toolbar manages search by default). */
  globalFilter?: string;
  onGlobalFilterChange?: (value: string) => void;
 /** md2 page slot: status pills without dot, 10px text */
  statusCompact?: boolean;
 /** Hide "Showing X to Y of Z …" under the table (sm embedded) */
  showPaginationItemsInfo?: boolean;
}

export interface QuickFilter {
  label: string;
  key: string;
  category?: string;
  status?: string;
 /** Matches `Transaction.type` (translated), e.g. withdraw-to-wallet */
  transactionType?: string;
}
