"use client";

import { TableRow, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { TABLE_CELL_STYLES } from "../config/cardDetailsList.config";

type BadgeVariant = "success" | "error" | "warning";

interface BadgeDetailRowProps {
  label: string;
  badgeVariant: BadgeVariant;
  badgeLabel: string;
  isLast?: boolean;
}

/**
 * BadgeDetailRow - Renders a row with a badge value
 */
export function BadgeDetailRow({
  label,
  badgeVariant,
  badgeLabel,
  isLast = false,
}: BadgeDetailRowProps) {
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
          isLast ? TABLE_CELL_STYLES.lastRowValue : TABLE_CELL_STYLES.badgeCell
        }
      >
        <Badge variant={badgeVariant} size="sm">
          {badgeLabel}
        </Badge>
      </TableCell>
    </TableRow>
  );
}
