"use client";

import { Table, TableBody, TableRow, TableCell } from "@/components/ui/table";

interface WalletData {
  id: string;
  name: string;
  address: string;
  symbol: string;
}

interface CardData {
  id: string;
  card_name?: string;
  last_four?: string;
  balance?: number;
}

interface TransferDetailsProps {
  t: (key: string) => string;
  card: CardData | null;
  selectedWallet: WalletData | null;
  amount: string;
  onAmountChange: (val: string) => void;
}

export function TransferDetails({ t, card, selectedWallet, amount, onAmountChange }: TransferDetailsProps) {
  const cardLabel = card ? `${card.card_name || "Card"} **** ${card.last_four || "----"}` : "No card";
  const balanceLabel = card?.balance != null ? `$${Number(card.balance).toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "$0.00";
  const toLabel = selectedWallet ? `${selectedWallet.name} (${selectedWallet.symbol})` : "Select a wallet above";

  return (
    <div className="mb-4 sm:mb-6">
      <Table>
        <TableBody>
          <TableRow className="px-3">
            <TableCell className="text-[var(--color-text-muted)] text-[11px] sm:text-[12px] font-normal py-2 ps-3">
              {t("Dashboard.from") || "From"}
            </TableCell>
            <TableCell className="text-[var(--color-text-primary)] text-[12px] sm:text-[13px] font-normal py-2 text-center">
              {cardLabel}
            </TableCell>
            <TableCell className="text-[var(--color-text-primary)] text-[13px] sm:text-[14px] font-medium py-2 pe-3 text-end">
              {balanceLabel}
            </TableCell>
          </TableRow>

          <TableRow>
            <TableCell className="text-[var(--color-text-muted)] text-[11px] sm:text-[12px] font-normal py-2 ps-3">
              {t("Dashboard.to") || "To"}
            </TableCell>
            <TableCell
              className={`text-[12px] sm:text-[13px] font-normal py-2 pe-3 text-end ${selectedWallet ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-muted)] italic"}`}
              colSpan={2}
            >
              {toLabel}
            </TableCell>
          </TableRow>

          <TableRow className="border-0">
            <TableCell className="text-[var(--color-text-muted)] text-[11px] sm:text-[12px] font-normal py-2 ps-3 border-b border-[var(--color-border-primary)]">
              {t("Dashboard.amount") || "Amount"}
            </TableCell>
            <TableCell className="py-2 text-center border-b border-[var(--color-border-primary)]" colSpan={2}>
              <div className="flex items-center justify-end pe-3">
                <span className="text-[var(--color-text-muted)] text-[13px] mr-1">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => onAmountChange(e.target.value)}
                  className="w-[100px] bg-transparent border-none outline-none text-[var(--color-text-primary)] text-[13px] sm:text-[14px] font-medium text-end placeholder:text-[var(--color-text-muted)]/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
