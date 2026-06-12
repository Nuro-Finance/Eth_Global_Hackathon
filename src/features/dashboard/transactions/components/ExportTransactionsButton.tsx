"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import { AlertTriangle, Check, Download, MoreHorizontal, X } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  FORM_MODAL_INNER_CLASS,
  FORM_MODAL_SHELL_CLASS,
  FULL_MODAL_OVERLAY_CLASS,
} from "@/components/ui/modalPresets";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  WALLET_GLASS_MENU_CONTENT,
  WALLET_GLASS_MENU_ITEM_ROW_BASE,
  WALLET_GLASS_MENU_ITEM_ROW_NEUTRAL,
} from "@/lib/walletGlassMenu";
import { cn } from "@/lib/utils";
import {
  downloadTransactionsCsv,
  resolveTransactionsExportUserName,
} from "../utils/exportTransactionsCsv";
import type { Transaction } from "../shared/types";

interface ExportTransactionsButtonProps {
  transactions?: Transaction[];
  onExportComplete?: () => void;
  buttonText?: string;
  /** `menu`: ⋯ dropdown on transactions page; `link`: text Export in widget headers */
  presentation?: "menu" | "link";
}

export function ExportTransactionsButton({
  transactions = [],
  onExportComplete,
  buttonText,
  presentation = "menu",
}: ExportTransactionsButtonProps) {
  const t = useTranslations("Transactions");
  const { data: session } = useSession();
  const [isSuccessDialogOpen, setIsSuccessDialogOpen] = useState(false);
  const [lastExportEmpty, setLastExportEmpty] = useState(false);

  const userName = resolveTransactionsExportUserName(
    (session?.user as { name?: string } | undefined)?.name,
  );

  const handleExport = () => {
    const result = downloadTransactionsCsv(transactions, userName);
    setLastExportEmpty(result === "empty");
    setIsSuccessDialogOpen(true);
    if (result === "success") {
      onExportComplete?.();
    }
  };

  const linkLabel = buttonText || t("export");

  return (
    <>
      {presentation === "link" ? (
        <span
          role="button"
          tabIndex={0}
          className="text-[12px] sm:text-[13px] font-normal cursor-pointer text-[var(--color-primary)] hover:opacity-80 transition-opacity"
          onClick={handleExport}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handleExport();
            }
          }}
        >
          {linkLabel}
        </span>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-transparent bg-white/[0.04] text-white/65 transition-[background-color,color,border-color] duration-200 hover:!bg-white/[0.055] hover:!text-white [&_svg]:transition-none",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/30 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent",
                "data-[state=open]:border-transparent data-[state=open]:!bg-white/[0.07] data-[state=open]:!text-white"
              )}
              aria-label={linkLabel}
            >
              <MoreHorizontal
                className="h-4 w-4 shrink-0 opacity-90"
                strokeWidth={2}
                aria-hidden
              />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            sideOffset={6}
            className={cn(WALLET_GLASS_MENU_CONTENT, "!min-w-0 !grid !gap-1 !p-1")}
          >
            <DropdownMenuItem
              textValue={linkLabel}
              onSelect={handleExport}
              className={cn(
                WALLET_GLASS_MENU_ITEM_ROW_BASE,
                "!flex min-w-0 items-center gap-2",
                WALLET_GLASS_MENU_ITEM_ROW_NEUTRAL
              )}
            >
              <Download className="h-3.5 w-3.5 shrink-0 opacity-90" strokeWidth={2.25} aria-hidden />
              <span className="min-w-0 truncate text-left">{linkLabel}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <Dialog open={isSuccessDialogOpen} onOpenChange={setIsSuccessDialogOpen}>
        <DialogContent
          hideClose
          overlayClassName={FULL_MODAL_OVERLAY_CLASS}
          className={cn(FORM_MODAL_SHELL_CLASS, "!max-w-[min(22rem,calc(100vw-2rem))]")}
          style={{
            backgroundColor: "rgba(255, 255, 255, 0.02)",
            borderColor: "rgba(255, 255, 255, 0.03)",
            borderWidth: "1px",
            borderStyle: "solid",
          }}
        >
          <div
            className={cn(FORM_MODAL_INNER_CLASS, "!h-auto !min-h-0 !max-h-none")}
            style={{
              backgroundColor: "rgba(255, 255, 255, 0.04)",
              borderColor: "rgba(255, 255, 255, 0.03)",
              borderWidth: "1px",
              borderStyle: "solid",
            }}
          >
            <DialogClose asChild>
              <button
                type="button"
                className={cn(
                  "absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-[10px] p-1.5 text-[var(--color-text-muted)] outline-none transition-all",
                  "hover:bg-white/5 hover:text-[var(--color-text-primary)]",
                  "focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/25",
                )}
                aria-label="Close"
              >
                <X className="h-full w-full" strokeWidth={2} />
              </button>
            </DialogClose>

            <div className="flex flex-col px-5 pb-6 pt-6 text-center sm:px-6 sm:pb-6 sm:pt-7">
              <div
                className={cn(
                  "mx-auto mb-4 flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border bg-[var(--color-bg-input)]",
                  lastExportEmpty
                    ? "border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10"
                    : "border-[var(--color-success)]/40 bg-[var(--color-success)]/10",
                )}
              >
                {lastExportEmpty ? (
                  <AlertTriangle
                    className="h-5 w-5 text-[var(--color-warning)]"
                    strokeWidth={2.25}
                    aria-hidden
                  />
                ) : (
                  <Check
                    className="h-5 w-5 text-[var(--color-success)]"
                    strokeWidth={2.25}
                    aria-hidden
                  />
                )}
              </div>

              <DialogTitle asChild>
                <h1 className="text-[16px] font-medium leading-none text-[var(--color-text-primary)]">
                  {lastExportEmpty
                    ? t("noDataToExport") || "No Data to Export"
                    : t("exportSuccessful") || "Export Successful"}
                </h1>
              </DialogTitle>

              <DialogDescription asChild>
                <p className="mt-3 text-[13px] leading-[1.45] text-[var(--color-text-muted)]">
                  {lastExportEmpty
                    ? t("noDataToExportMessage") ||
                      "There are no transactions to export. Add some transactions first."
                    : t("exportSuccessMessage") ||
                      "Your transactions have been successfully exported to CSV file."}
                </p>
              </DialogDescription>

              <button
                type="button"
                className={cn(
                  "mt-6 box-border inline-flex h-10 w-full shrink-0 items-center justify-center rounded-[10px] border border-white/10 px-5 text-sm font-medium leading-none outline-none",
                  "bg-white/5 text-white hover:bg-white/10",
                  "sm:w-[60%] sm:self-center",
                )}
                onClick={() => setIsSuccessDialogOpen(false)}
              >
                {t("ok") || "OK"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
