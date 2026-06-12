"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { WALLET_GLASS_MENU_CONTENT } from "@/lib/walletGlassMenu";
import { cn } from "@/lib/utils";
import type { FilterData } from "../shared";

interface TransactionFilterDialogProps {
  onApplyFilters?: (filters: FilterData) => void;
  trigger?: React.ReactNode;
  initialFilters?: Partial<FilterData>;
}

const STATUS_OPTIONS = [
  { value: "completed", labelKey: "completed" as const },
  { value: "pending", labelKey: "pending" as const },
  { value: "failed", labelKey: "failed" as const },
];

const TYPE_OPTIONS = [
  { value: "bankTransfer", labelKey: "bankTransfer" as const },
  { value: "cardPayment", labelKey: "cardPayment" as const },
  { value: "recurringPayment", labelKey: "recurringPayment" as const },
  { value: "directDeposit", labelKey: "directDeposit" as const },
];

const MENU_OPTIONS = [
  ...STATUS_OPTIONS.map((opt) => ({ field: "status" as const, ...opt })),
  ...TYPE_OPTIONS.map((opt) => ({ field: "type" as const, ...opt })),
];

const EMPTY_FILTERS: FilterData = { category: "", status: "", type: "" };

const GLASS_MENU_ITEM = cn(
  "!grid cursor-pointer grid-cols-[14px_auto] items-center gap-1 rounded-[var(--radius-sm)] !m-0 !px-1.5 !py-1.5 text-[11px] font-semibold outline-none sm:text-xs"
);

const GLASS_MENU_ITEM_SELECTED = cn(
  GLASS_MENU_ITEM,
  "bg-[var(--color-primary)] text-white hover:!bg-[var(--color-primary)] hover:!text-white focus:!bg-[var(--color-primary)] focus:!text-white data-[highlighted]:!bg-[var(--color-primary)] data-[highlighted]:!text-white"
);

const GLASS_MENU_ITEM_IDLE = cn(
  GLASS_MENU_ITEM,
  "text-[var(--color-text-primary)] hover:!bg-white/[0.055] hover:!text-white focus:!bg-white/[0.055] focus:!text-white data-[highlighted]:!bg-white/[0.055] data-[highlighted]:!text-white"
);

export function TransactionFilterDialog({
  onApplyFilters,
  trigger,
  initialFilters = {},
}: TransactionFilterDialogProps) {
  const t = useTranslations("Transactions");

  const [filters, setFilters] = useState<FilterData>({
    category: "",
    status: initialFilters.status || "",
    type: initialFilters.type || "",
  });

  const hasFilters = Boolean(filters.status || filters.type);

  const apply = (next: FilterData) => {
    const payload: FilterData = { category: "", status: next.status, type: next.type };
    setFilters(payload);
    onApplyFilters?.(payload);
  };

  const toggleField = (field: "status" | "type", value: string) => {
    apply({
      ...filters,
      [field]: filters[field] === value ? "" : value,
    });
  };

  const clearFilters = () => apply(EMPTY_FILTERS);

  const menuRows = [
    ...MENU_OPTIONS.map((opt) => ({
      id: `${opt.field}-${opt.value}`,
      kind: "option" as const,
      field: opt.field,
      value: opt.value,
      label: t(opt.labelKey),
    })),
    ...(hasFilters
      ? [{ id: "clear", kind: "clear" as const, label: t("clearAll") }]
      : []),
  ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {trigger ?? (
          <button
            type="button"
            className={cn(
              "inline-flex h-8 w-auto items-center gap-1 rounded-[10px] border pl-2.5 pr-2 text-[11px] font-semibold transition-[background-color,color,border-color] duration-200 hover:!bg-white/[0.055] hover:!text-white sm:pl-3 sm:pr-2.5 sm:text-xs [&_svg]:transition-none",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/30 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent",
              "data-[state=open]:border-transparent data-[state=open]:!bg-white/[0.07] data-[state=open]:!text-white",
              hasFilters
                ? "border-white/15 bg-white/[0.08] text-[var(--color-text-primary)]"
                : "border-transparent bg-white/[0.04] text-white/65"
            )}
            aria-label={t("filter")}
          >
            <span className="whitespace-nowrap">{t("filter")}</span>
            <ChevronDown className="h-4 w-4 shrink-0 sm:h-[15px] sm:w-[15px]" aria-hidden />
          </button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={6}
        className={cn(WALLET_GLASS_MENU_CONTENT, "!min-w-0 !grid !gap-1 !p-1")}
      >
        {menuRows.map((row) => {
          if (row.kind === "clear") {
            return (
              <DropdownMenuItem
                key={row.id}
                textValue={row.label}
                onSelect={clearFilters}
                className={GLASS_MENU_ITEM_IDLE}
              >
                <span className="col-span-2 whitespace-nowrap text-left">{row.label}</span>
              </DropdownMenuItem>
            );
          }

          const selected = filters[row.field] === row.value;
          return (
            <DropdownMenuItem
              key={row.id}
              textValue={row.label}
              onSelect={() => toggleField(row.field, row.value)}
              className={selected ? GLASS_MENU_ITEM_SELECTED : GLASS_MENU_ITEM_IDLE}
            >
              <span className="flex h-3.5 w-3.5 items-center justify-center">
                {selected ? <Check className="h-3 w-3" strokeWidth={2.5} aria-hidden /> : null}
              </span>
              <span className="min-w-0 truncate text-left">{row.label}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
