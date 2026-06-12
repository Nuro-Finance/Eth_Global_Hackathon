"use client";

import React from "react";
import { Gem, Zap, CreditCard, Receipt, Download, ExternalLink, Crown } from "lucide-react";
import { useTranslations } from "next-intl";
import SettingsSection from "@/components/settings-section";
import { UpgradeModal } from "./components/UpgradeModal";
import { SegmentedBarSparkline } from "@/features/dashboard/shared/SegmentedBarSparkline";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SETTINGS_CTA_BUTTON_CLASS, SETTINGS_ROW_STACK_CLASS } from "@/features/dashboard/settings/settingsStyles";
import { useDevPreviewMode } from "@/providers/DevPreviewModeProvider";
import { cn } from "@/lib/utils";

const INVOICES = [
  { date: "Apr 7, 2026", amount: "$0.00", status: "Paid" },
  { date: "Mar 7, 2026", amount: "$0.00", status: "Paid" },
  { date: "Feb 7, 2026", amount: "$0.00", status: "Paid" },
  { date: "Jan 7, 2026", amount: "$0.00", status: "Paid" },
] as const;

const INVOICE_COL_WIDTHS = [30, 22, 24, 24] as const;
const INVOICE_COL_COUNT = INVOICE_COL_WIDTHS.length;

const INVOICE_TABLE_SHELL_CLASS =
  "min-w-0 overflow-hidden rounded-[var(--radius-table)] border-0 [overflow-anchor:none]";

const INVOICE_TABLE_CLASS = "w-full caption-bottom table-fixed text-sm";

/** Matches transactions table status pills (Complete / Paid): green dot, neutral fill + text. */
const TABLE_STATUS_BADGE_CLASS =
  "gap-2 border-transparent text-white/70 !border-transparent !hover:border-transparent";

export default function SubscriptionContent() {
  const t = useTranslations("Settings");
  const { newUserEmpty } = useDevPreviewMode();
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = React.useState(false);
  const invoices = newUserEmpty ? [] : INVOICES;

  return (
    <div className="space-y-12">
      <UpgradeModal
        open={isUpgradeModalOpen}
        onOpenChange={setIsUpgradeModalOpen}
      />

      <SettingsSection
        title={t("subscription")}
        description="Manage your payment and plan"
        icon={<Gem className="h-5 w-5" />}
      >
        <div className="group flex w-full flex-col items-start justify-between rounded-[20px] bg-white/[0.04] p-6 transition-all duration-300 hover:bg-white/5 sm:flex-row sm:items-center">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
                Free
              </h3>
              <Badge
                variant="plain"
                size="sm"
                className={TABLE_STATUS_BADGE_CLASS}
                style={{ backgroundColor: "rgba(255, 255, 255, 0.05)" }}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-success)]" />
                Active
              </Badge>
            </div>

            <div className="mt-1 flex flex-col gap-1">
              <p className="text-[14px] font-medium tracking-tight text-[var(--color-text-primary)] opacity-90">
                1 Virtual Card and 10 monthly transactions.
              </p>
              <p
                className={cn(
                  "text-[14px] text-[var(--color-text-muted)]",
                  newUserEmpty && "opacity-40",
                )}
              >
                Your limits will reset on May 1, 2026.
              </p>
            </div>
          </div>

          <div className="mt-5 w-full sm:ml-auto sm:mt-0 sm:w-auto">
            <Button
              onClick={() => setIsUpgradeModalOpen(true)}
              className={cn(SETTINGS_CTA_BUTTON_CLASS, "inline-flex items-center gap-2")}
            >
              <Crown className="h-3.5 w-3.5" strokeWidth={2} />
              Upgrade plan
            </Button>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Current Usage"
        description="Monitor your plan limits and activity."
        icon={<Zap className="h-5 w-5" />}
      >
        <div
          className={cn(
            "flex flex-col gap-6 rounded-[20px] bg-white/[0.04] p-6 transition-opacity",
            newUserEmpty && "pointer-events-none opacity-40 saturate-0",
          )}
        >
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-[13px]">
              <span className="font-medium text-[var(--color-text-primary)]">Monthly Transactions</span>
              <span className="text-[var(--color-text-muted)]">
                {newUserEmpty ? "0 / 10" : "9 / 10"}
              </span>
            </div>
            <SegmentedBarSparkline
              variant="gradientPrimary"
              fillRatio={newUserEmpty ? 0 : 9 / 10}
              className="mt-0"
            />
            <p className="mt-1 text-[12px] text-[var(--color-text-muted)]">
              {newUserEmpty ? "No data" : "You are approaching your plan limit."}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-[13px]">
              <span className="font-medium text-[var(--color-text-primary)]">Virtual Cards Active</span>
              <span className="text-[var(--color-text-muted)]">
                {newUserEmpty ? "0 / 1" : "1 / 1"}
              </span>
            </div>
            <SegmentedBarSparkline
              variant="dualPrimary"
              fillRatio={newUserEmpty ? 0 : 1}
              className="mt-0"
            />
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Manage Billing"
        description="Update payment methods, view past invoices, or cancel your plan through the secure Stripe portal."
        icon={<CreditCard className="h-5 w-5" />}
      >
        <div className="flex flex-col items-center justify-between gap-4 rounded-[20px] bg-white/[0.04] p-5 sm:flex-row">
          <div className="flex w-full flex-col text-center sm:w-auto sm:text-left">
            <span className="text-[14px] font-medium text-[var(--color-text-primary)]">
              Stripe Customer Portal
            </span>
            <span className="mt-0.5 text-[13px] text-[var(--color-text-muted)]">
              You will be securely redirected to Stripe.
            </span>
          </div>
          <button
            type="button"
            className="flex w-full items-center justify-center gap-2 rounded-[10px] border-none bg-white/5 px-4 py-2 text-[13px] font-medium text-[var(--color-text-primary)] transition-colors hover:bg-white/10 sm:w-auto"
          >
            Open Stripe Portal <ExternalLink className="h-3.5 w-3.5 opacity-70" />
          </button>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Recent Invoices"
        description="Your last 4 billing receipts"
        icon={<Receipt className="h-5 w-5" />}
      >
        <div className={SETTINGS_ROW_STACK_CLASS}>
          <div className={INVOICE_TABLE_SHELL_CLASS}>
            <table className={INVOICE_TABLE_CLASS}>
              <colgroup>
                {INVOICE_COL_WIDTHS.map((width, idx) => (
                  <col key={idx} style={{ width: `${width}%` }} />
                ))}
              </colgroup>
              <TableHeader className="border-b-0 border-transparent !bg-[rgba(255,255,255,0.04)] dark:border-b-0 [&_tr]:border-b-0">
                <TableRow noHover className="!border-b-0 !bg-transparent hover:!bg-transparent">
                  <TableHead className="!h-auto whitespace-nowrap py-[11px] font-medium hover:bg-transparent">
                    Date
                  </TableHead>
                  <TableHead className="!h-auto whitespace-nowrap py-[11px] font-medium hover:bg-transparent">
                    Amount
                  </TableHead>
                  <TableHead className="!h-auto whitespace-nowrap py-[11px] pl-6 font-medium hover:bg-transparent">
                    Status
                  </TableHead>
                  <TableHead className="!h-auto whitespace-nowrap py-[11px] text-right font-medium hover:bg-transparent">
                    Invoice
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.length > 0 ? (
                  invoices.map((inv, idx) => (
                    <TableRow
                      key={inv.date}
                      noHover
                      className={cn(
                        "!border-b-0 !bg-transparent even:!bg-transparent",
                        idx % 2 === 1
                          ? "[&_td]:bg-[rgba(255,255,255,0.04)]"
                          : "[&_td]:bg-[rgba(255,255,255,0.02)]"
                      )}
                    >
                      <TableCell className="whitespace-nowrap px-4 py-[11px] align-middle text-[var(--color-text-primary)]">
                        {inv.date}
                      </TableCell>
                      <TableCell className="whitespace-nowrap px-4 py-[11px] align-middle font-medium text-[var(--color-text-primary)]">
                        {inv.amount}
                      </TableCell>
                      <TableCell className="whitespace-nowrap px-4 py-[11px] pl-6 align-middle">
                        <Badge
                          variant="plain"
                          size="sm"
                          className={TABLE_STATUS_BADGE_CLASS}
                          style={{ backgroundColor: "rgba(255, 255, 255, 0.05)" }}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-success)]" />
                          {inv.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap px-4 py-[11px] text-right align-middle">
                        <button
                          type="button"
                          className="ml-auto inline-flex rounded-[10px] p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-white/5 hover:text-[var(--color-primary)]"
                          aria-label={`Download invoice for ${inv.date}`}
                        >
                          <Download className="h-4 w-4" />
                        </button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow noHover className="!border-b-0">
                    <TableCell
                      colSpan={INVOICE_COL_COUNT}
                      className="h-24 rounded-b-[var(--radius-table)] bg-[rgba(255,255,255,0.02)] text-center text-[var(--color-text-muted)]"
                    >
                      No results found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </table>
          </div>

          <div
            className={cn(
              "flex justify-center",
              newUserEmpty && "pointer-events-none opacity-40",
            )}
          >
            <button
              type="button"
              className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--color-primary)] transition-colors hover:text-[var(--color-primary-light)]"
            >
              View full history in Stripe <ExternalLink className="h-3 w-3 opacity-70" />
            </button>
          </div>
        </div>
      </SettingsSection>
    </div>
  );
}
