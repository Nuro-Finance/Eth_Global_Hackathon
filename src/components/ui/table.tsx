"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface TableProps extends React.HTMLAttributes<HTMLTableElement> {
  rounded?: boolean;
  fullWidth?: boolean;
  /** No inner overflow wrapper (avoids vertical scrollbar toggling and shifting layout). */
  bare?: boolean;
}

const Table = React.forwardRef<HTMLTableElement, TableProps>(
  ({ className, rounded = false, fullWidth = true, bare = false, ...props }, ref) => {
    const tbl = (
      <table
        ref={ref}
        className={cn(
          "caption-bottom text-sm",
          fullWidth ? "w-full" : "w-auto",
          className
        )}
        {...props}
      />
    );
    if (bare) return tbl;
    return (
      <div
        className={cn(
          "scroll-gutter-stable relative overflow-auto",
          fullWidth ? "w-full" : "w-fit",
          rounded &&
          "rounded-[var(--radius-table)] border border-[var(--color-border-table)] dark:border-[var(--color-border-glass-strong)] bg-[var(--color-bg-card)] dark:bg-[var(--color-bg-glass)] dark:backdrop-blur-[var(--glass-blur)] glass-card-inner overflow-hidden"
        )}
      >
        {tbl}
      </div>
    );
  }
);
Table.displayName = "Table";

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead
    ref={ref}
    className={cn(
      "bg-[var(--color-bg-modal-table-header)] border-b border-[var(--color-border-table)] dark:border-[var(--color-border-glass-strong)] [&_tr]:!bg-transparent [&_tr]:hover:!bg-transparent",
      className
    )}
    {...props}
  />
));
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn("[&_tr:last-child]:border-0", className)}
    {...props}
  />
));
TableBody.displayName = "TableBody";

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn(
      "border-t border-[var(--color-border-table)] dark:border-[var(--color-border-glass-strong)] bg-[var(--color-bg-secondary)] dark:bg-[var(--color-bg-glass)] dark:backdrop-blur-[var(--glass-blur)] font-medium [&>tr]:last:border-b-0",
      className
    )}
    {...props}
  />
));
TableFooter.displayName = "TableFooter";

interface TableRowProps extends React.HTMLAttributes<HTMLTableRowElement> {
  noHover?: boolean;
}

const TableRow = React.forwardRef<HTMLTableRowElement, TableRowProps>(
  ({ className, noHover = false, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn(
        "border-b border-[var(--color-border-table)] bg-[var(--color-bg-modal-table-row)] even:bg-[var(--color-bg-modal-table-row-alt)]",
        !noHover && "hover:bg-[var(--color-bg-hover)]",
        className
      )}
      {...props}
    />
  )
);
TableRow.displayName = "TableRow";

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      "h-12 px-4 text-start align-middle font-semibold text-[var(--color-text-primary)] [&:has([role=checkbox])]:pr-0 whitespace-nowrap",
      className
    )}
    {...props}
  />
));
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn(
      "p-4 align-middle text-[var(--color-text-primary)] font-medium [&:has([role=checkbox])]:pr-0",
      className
    )}
    {...props}
  />
));
TableCell.displayName = "TableCell";

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn("mt-4 text-sm text-[var(--color-text-muted)]", className)}
    {...props}
  />
));
TableCaption.displayName = "TableCaption";

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
};
