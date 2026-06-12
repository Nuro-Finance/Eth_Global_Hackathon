"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useAppSession } from "@/hooks/useAppSession";
import { shouldUseDevPopulatedData } from "@/lib/devPreviewMode";
import { MOCK_CARDS } from "@/config/mock-data";
import { ExternalLink, Copy, Check } from "lucide-react";
import { motion } from "framer-motion";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { FULL_MODAL_OVERLAY_CLASS } from "@/components/ui/modalPresets";
import { Badge } from "@/components/ui/badge";
import { copyToClipboard } from "@/lib/clipboard";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import type { Transaction } from "../../../shared";

const layerVariants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.1,
    },
  },
};

const cascadeVariants = {
  initial: { opacity: 0, y: -12 },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      ease: [0.33, 1, 0.68, 1],
    },
  },
};

interface TransactionDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tx: Transaction | null;
}

type CardLookup = { name: string; last4: string };

function panLast4(raw?: string | null): string {
  const digits = (raw ?? "").replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : "----";
}

function mapApiCard(c: Record<string, unknown>): CardLookup {
  const name =
    (c.card_name as string) ||
    (c.cardName as string) ||
    (c.card_holder as string) ||
    (c.cardHolder as string) ||
    "Card";
  const last4 = panLast4(
    (c.last_four as string) ||
      (c.card_number as string) ||
      (c.cardNumber as string),
  );
  return { name, last4 };
}

export function TransactionDetailModal({
  open,
  onOpenChange,
  tx,
}: TransactionDetailModalProps) {
  const t = useTranslations("Transactions");
  const { data: session } = useAppSession();
  const [copied, setCopied] = useState(false);
  const [cardsById, setCardsById] = useState<Map<string, CardLookup>>(new Map());

  const cardId = tx?.cardId;

  useEffect(() => {
    if (!open || !cardId) return;

    if (shouldUseDevPopulatedData()) {
      setCardsById(
        new Map(
          MOCK_CARDS.map((c) => [
            c.id,
            {
              name: c.cardName || "Card",
              last4: panLast4(c.cardNumber),
            },
          ]),
        ),
      );
      return;
    }

    const token = (session as { accessToken?: string } | null)?.accessToken;
    if (!token) return;

    fetch("/api/cards", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: unknown) => {
        const arr = Array.isArray(data)
          ? data
          : ((data as { cards?: unknown[] })?.cards ?? []);
        setCardsById(
          new Map(
            arr.map((c) => {
              const row = c as Record<string, unknown> & { id: string };
              return [String(row.id), mapApiCard(row)];
            }),
          ),
        );
      })
      .catch(() => {});
  }, [open, cardId, session]);

  const cardLabel = useMemo(() => {
    if (!cardId) return null;
    const card = cardsById.get(cardId);
    if (!card) return null;
    return `${card.name} •••• ${card.last4}`;
  }, [cardId, cardsById]);

  if (!tx) return null;

  const isMarketBet = tx.name?.startsWith("Market Bet:");
  const marketQuestion = isMarketBet
    ? tx.name.replace("Market Bet: YES — ", "").replace("Market Bet: NO — ", "")
    : null;
  const betSide = tx.name?.includes("YES")
    ? "YES"
    : tx.name?.includes("NO")
      ? "NO"
      : null;

  const detailRows = [
    {
      label: "Transaction ID",
      value: tx.id.slice(0, 8) + "..." + tx.id.slice(-4),
      full: tx.id,
      copyable: true,
    },
    {
      label: t("date"),
      value: new Date(tx.date).toLocaleString("en-US", {
        dateStyle: "long",
        timeStyle: "short",
      }),
    },
    {
      label: "Executed Via",
      value: isMarketBet
        ? "AFI Markets (Manual)"
        : tx.isIncoming
          ? "Bridge Deposit"
          : "Card Payment",
    },
    { label: t("status"), value: tx.status },
    { label: t("category"), value: tx.category },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideClose
        overlayClassName={FULL_MODAL_OVERLAY_CLASS}
        className={cn(
          "notifications-full-dialog z-[110] flex min-h-0 flex-col gap-0 !overflow-visible p-[12px]",
          "h-auto max-h-[min(85vh,42rem)] w-[calc(100vw-2rem)] max-w-lg !rounded-[56px] backdrop-blur-md shadow-xl",
        )}
        style={{
          backgroundColor: "rgba(255, 255, 255, 0.02)",
          borderColor: "rgba(255, 255, 255, 0.03)",
          borderWidth: "1px",
          borderStyle: "solid",
        }}
      >
        <div
          className="relative flex w-full flex-col overflow-hidden rounded-[44px] border !backdrop-blur-none"
          style={{
            backgroundColor: "rgba(255, 255, 255, 0.04)",
            borderColor: "rgba(255, 255, 255, 0.03)",
            borderWidth: "1px",
            borderStyle: "solid",
          }}
        >
          <motion.div
            className="flex flex-col"
            variants={layerVariants}
            initial="initial"
            animate="animate"
          >
            <motion.div
              className="shrink-0 px-4 pt-6 pb-3"
              variants={cascadeVariants}
            >
              <div className="flex items-center justify-between gap-3 pl-3 pr-3">
                <DialogTitle className="m-0 flex-1 text-start text-lg sm:text-xl">
                  {t("transactionDetails")}
                </DialogTitle>
                <DialogClose asChild>
                  <button
                    type="button"
                    className={cn(
                      "shrink-0 flex h-8 w-8 items-center justify-center rounded-[10px] p-1.5 text-[var(--color-text-muted)] outline-none transition-all",
                      "hover:bg-white/5 hover:text-[var(--color-text-primary)]",
                      "focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/25",
                    )}
                    aria-label="Close"
                  >
                    <X className="h-full w-full" strokeWidth={2} />
                  </button>
                </DialogClose>
              </div>
            </motion.div>

            <motion.div
              className="min-h-0 overflow-y-auto overscroll-contain px-4 pb-6 pt-0 scroll-gutter-stable"
              variants={cascadeVariants}
            >
              <div className="mx-auto w-full max-w-[480px] space-y-4 pb-1">
                <div className="pb-1 text-center">
                  <p
                    className={cn(
                      "text-[22px] font-semibold leading-tight tabular-nums sm:text-[26px]",
                      tx.isIncoming
                        ? "text-[var(--color-success)]"
                        : "text-[var(--color-error)]",
                    )}
                  >
                    {tx.isIncoming ? "+" : "-"}${tx.amount.toFixed(2)}{" "}
                    <span className="text-[13px] font-normal text-[var(--color-text-muted)]">
                      USD
                    </span>
                  </p>
                </div>

                {cardLabel && (
                  <div className="rounded-[var(--radius-lg)] border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] p-4 dark:border-white/5 dark:bg-white/[0.02]">
                    <p className="mb-1 text-[11px] uppercase tracking-wider text-[var(--color-text-muted)]">
                      {t("card")}
                    </p>
                    <p className="text-sm font-medium leading-relaxed text-[var(--color-text-primary)]">
                      {cardLabel}
                    </p>
                  </div>
                )}

                {isMarketBet && (
                  <div className="rounded-[var(--radius-lg)] border border-[var(--color-brand-border)] bg-[var(--color-brand-surface)] p-4">
                    <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-primary)]">
                      Prediction Market
                    </p>
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-[var(--color-text-muted)]">
                          Market
                        </span>
                        <span className="max-w-[65%] text-right text-xs font-medium text-[var(--color-text-primary)]">
                          {marketQuestion}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-[var(--color-text-muted)]">
                          Your Position
                        </span>
                        <Badge
                          variant={betSide === "YES" ? "success" : "destructive"}
                          size="sm"
                        >
                          {betSide}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-[var(--color-text-muted)]">
                          Bet Amount
                        </span>
                        <span className="text-xs font-semibold text-[var(--color-text-primary)]">
                          ${tx.amount.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-[var(--color-text-muted)]">
                          Result
                        </span>
                        <span className="text-xs font-medium text-yellow-400">
                          ⏳ Pending resolution
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          onOpenChange(false);
                          window.location.href = "/en/dashboard/markets";
                        }}
                        className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--color-primary)]/10 py-2 text-xs font-semibold text-[var(--color-primary)] transition-colors hover:bg-[var(--color-primary)]/20"
                      >
                        View Market <ExternalLink className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                )}

                <div className="divide-y divide-[var(--color-border-primary)] dark:divide-white/5">
                  {detailRows.map((item, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between py-3"
                    >
                      <span className="text-xs text-[var(--color-text-muted)]">
                        {item.label}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium text-[var(--color-text-primary)]">
                          {item.value}
                        </span>
                        {item.copyable && (
                          <button
                            type="button"
                            onClick={() => {
                              copyToClipboard(item.full || item.value);
                              setCopied(true);
                              setTimeout(() => setCopied(false), 1500);
                            }}
                            className="rounded p-0.5 transition-colors hover:bg-[var(--color-bg-input)]"
                          >
                            {copied ? (
                              <Check className="h-3 w-3 text-[var(--color-success)]" />
                            ) : (
                              <Copy className="h-3 w-3 text-[var(--color-text-muted)]" />
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
