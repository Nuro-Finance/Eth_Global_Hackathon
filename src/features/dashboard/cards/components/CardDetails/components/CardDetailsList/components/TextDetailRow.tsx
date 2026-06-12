"use client";

import { TableRow, TableCell } from "@/components/ui/table";
import { TABLE_CELL_STYLES } from "../config/cardDetailsList.config";

interface TextDetailRowProps {
  label: string;
  value: string;
  truncate?: boolean;
  isLast?: boolean;
}

/**
 * TextDetailRow - Renders a simple text row in the details table
 */
export function TextDetailRow({
  label,
  value,
  truncate = false,
  isLast = false,
}: TextDetailRowProps) {
  return (
    <TableRow className={isLast ? "border-0" : ""}>
      <TableCell
        className={
          isLast ? TABLE_CELL_STYLES.lastRowLabel : TABLE_CELL_STYLES.label
        }
      >
        {label}
      </TableCell>
      <TableCell
        className={
          isLast
            ? TABLE_CELL_STYLES.lastRowValue
            : truncate
            ? TABLE_CELL_STYLES.valueTruncate
            : TABLE_CELL_STYLES.value
        }
      >
        {value}
      </TableCell>
    </TableRow>
  );
}
