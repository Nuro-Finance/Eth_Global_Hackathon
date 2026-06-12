import { DEMO_USER_FULL_NAME } from "@/config/demo-user";
import type { Transaction } from "../shared/types";

const EXPORT_BRAND = "Nuro Finance";

export function resolveTransactionsExportUserName(
  sessionName: string | undefined | null,
): string {
  const trimmed = sessionName?.trim();
  if (!trimmed || trimmed.toLowerCase() === "demo") {
    return DEMO_USER_FULL_NAME;
  }
  return trimmed;
}

function sanitizeFilenameSegment(value: string): string {
  return value.replace(/[/\\?%*:|"<>]/g, "").trim() || "User";
}

function escapeCsvField(value: string): string {
  const normalized = value.replace(/"/g, '""');
  return /[",\n\r]/.test(normalized) ? `"${normalized}"` : normalized;
}

function formatExportDate(at: Date): string {
  return at.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/** e.g. `Nuro Finance - Chris Brignola Transactions - 2026-06-03.csv` */
export function buildTransactionsExportFilename(
  userName: string,
  at: Date = new Date(),
): string {
  const safeName = sanitizeFilenameSegment(userName);
  const datePart = at.toISOString().split("T")[0];
  return `${EXPORT_BRAND} - ${safeName} Transactions - ${datePart}.csv`;
}

export interface TransactionsCsvExportMeta {
  userName: string;
  exportedAt?: Date;
}

function buildCsvHeaderSection(meta: TransactionsCsvExportMeta): string[] {
  const accountName = meta.userName.trim() || "User";
  const exportedAt = meta.exportedAt ?? new Date();

  return [
    escapeCsvField(EXPORT_BRAND),
    `Account,${escapeCsvField(accountName)}`,
    `Export Date,${escapeCsvField(formatExportDate(exportedAt))}`,
    "",
  ];
}

export function transactionsToCsv(
  transactions: Transaction[],
  meta: TransactionsCsvExportMeta,
): string {
  const tableHeaders = ["Date", "Description", "Type", "Category", "Amount", "Status"];
  const rows = transactions.map((transaction) =>
    [
      new Date(transaction.date).toLocaleDateString(),
      escapeCsvField(transaction.name),
      escapeCsvField(transaction.type),
      escapeCsvField(transaction.category),
      `${transaction.isIncoming ? "+" : "-"}${transaction.amount}`,
      escapeCsvField(transaction.status),
    ].join(","),
  );

  return [
    ...buildCsvHeaderSection(meta),
    tableHeaders.join(","),
    ...rows,
  ].join("\n");
}

export type TransactionsCsvExportResult = "success" | "empty";

export function downloadTransactionsCsv(
  transactions: Transaction[],
  userName: string,
): TransactionsCsvExportResult {
  if (transactions.length === 0) {
    return "empty";
  }

  const csvContent = transactionsToCsv(transactions, {
    userName,
    exportedAt: new Date(),
  });
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);

  link.setAttribute("href", url);
  link.setAttribute("download", buildTransactionsExportFilename(userName));
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  return "success";
}
