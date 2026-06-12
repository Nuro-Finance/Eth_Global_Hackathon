"use client";

import { Copy, Check } from "lucide-react";
import { TableRow, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { TABLE_CELL_STYLES } from "../config/cardDetailsList.config";

interface CardNumberRowProps {
  label: string;
  displayNumber: string;
  onCopy: () => void;
  isCopied?: boolean;
}

/**
 * CardNumberRow - Renders the card number row with copy functionality
 */
export function CardNumberRow({
  label,
  displayNumber,
  onCopy,
  isCopied = false,
}: CardNumberRowProps) {
  return (
    <TableRow>
      <TableCell className={TABLE_CELL_STYLES.label}>{label}</TableCell>
      <TableCell className={TABLE_CELL_STYLES.value}>
        <div className="flex items-center justify-end gap-2">
          <span>{displayNumber}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={onCopy}
            className="p-1 h-auto min-h-0"
          >
            {isCopied ? (
              <Check className="w-3 h-3 text-[var(--color-success)]" />
            ) : (
              <Copy className="w-3 h-3" />
            )}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
