"use client";

import { useTranslations } from "next-intl";
import {
  IconShoppingCart,
  IconCash,
  IconDeviceTv,
  IconCar,
  IconToolsKitchen2,
  IconArrowsExchange,
  IconReceipt,
  IconBolt,
} from "@tabler/icons-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  recentTransactionsData,
  getStatusColor,
  type TransactionRow,
  type IconType,
} from "../config/transactions.config";

// Icon mapping for transaction types
const TRANSACTION_ICONS: Record<
  IconType,
  React.ComponentType<{ className?: string }>
> = {
  shopping: IconShoppingCart,
  income: IconCash,
  entertainment: IconDeviceTv,
  transport: IconCar,
  food: IconToolsKitchen2,
  transfer: IconArrowsExchange,
  subscription: IconReceipt,
  utilities: IconBolt,
};

interface TransactionsTableProps {
  data?: TransactionRow[];
}

/**
 * Recent transactions table
 */
export function TransactionsTable({
  data = recentTransactionsData,
}: TransactionsTableProps) {
  const t = useTranslations("Analytics");

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const formatAmount = (amount: number) => {
    const formatted = Math.abs(amount).toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
    });
    return amount >= 0 ? `+${formatted}` : `-${formatted}`;
  };

  return (
    <Table rounded>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="w-[200px]">{t("merchant")}</TableHead>
          <TableHead className="hidden sm:table-cell">
            {t("category")}
          </TableHead>
          <TableHead className="hidden md:table-cell">{t("date")}</TableHead>
          <TableHead className="text-right">{t("amount")}</TableHead>
          <TableHead className="text-right hidden sm:table-cell">
            {t("status")}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((transaction) => {
          const Icon = TRANSACTION_ICONS[transaction.iconType];
          return (
            <TableRow key={transaction.id} className="group cursor-pointer">
              {/* Merchant */}
              <TableCell>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[var(--color-bg-tertiary)] flex items-center justify-center">
                    <Icon className="w-5 h-5 text-[var(--color-text-secondary)]" />
                  </div>
                  <span className="font-medium truncate max-w-[120px]">
                    {transaction.merchant}
                  </span>
                </div>
              </TableCell>

              {/* Category */}
              <TableCell className="hidden sm:table-cell">
                <span className="px-2 py-1 rounded-md text-xs bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] capitalize">
                  {t(
                    transaction.category as
                      | "shopping"
                      | "income"
                      | "entertainment"
                      | "transport"
                      | "food"
                      | "transfer"
                  )}
                </span>
              </TableCell>

              {/* Date */}
              <TableCell className="hidden md:table-cell text-[var(--color-text-muted)]">
                {formatDate(transaction.date)}
              </TableCell>

              {/* Amount */}
              <TableCell className="text-right">
                <span
                  className={`font-semibold ${
                    transaction.amount >= 0
                      ? "text-[var(--color-success)]"
                      : "text-[var(--color-text-primary)]"
                  }`}
                >
                  {formatAmount(transaction.amount)}
                </span>
              </TableCell>

              {/* Status */}
              <TableCell className="text-right hidden sm:table-cell">
                <div className="flex items-center justify-end gap-2">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{
                      backgroundColor: getStatusColor(transaction.status),
                    }}
                  />
                  <span className="text-xs text-[var(--color-text-muted)] capitalize">
                    {t(
                      transaction.status as "completed" | "pending" | "failed"
                    )}
                  </span>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
