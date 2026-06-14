"use client";

import { useTranslations } from "next-intl";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SkeletonBlock } from "@/components";
import { WalletSkeletonText } from "@/features/dashboard/my-wallet/WalletDataSkeletons";
import { cn } from "@/lib/utils";
import type { Card } from "../../../shared";

interface CardInfoGridProps {
  card: Card;
  isLocked?: boolean;
  onReloadClick?: () => void;
 /** Opens the sidebar Nuro AI chat panel (Agent Cards). */
  onChatClick?: () => void;
 /** Defaults to "Reload Card". */
  primaryCtaLabel?: string;
 /**
 * 2026-05-26 reveal flow (lifted from CardListItem so the same hook drives
 * both compressed-hero PAN slot AND full-hero grid cells).
 */
  secretsRevealed?: boolean;
  secretsLoading?: boolean;
  secrets?: { pan: string | null; cvv: string | null; expiry: string | null } | null;
  onToggleSecrets?: () => void;
 /** User refresh - pulse overlay on numeric fields without layout shift. */
  isRefreshing?: boolean;
}

/**
 * CardInfoGrid - Displays card information in a grid layout.
 *
 * 2026-05-26: card-number cell now toggles between masked last4 and the full
 * PAN via an eye icon. When revealed, an additional row underneath surfaces
 * the CVV + expiry (formerly hidden).
 */
export function CardInfoGrid({
  card,
  isLocked,
  onReloadClick,
  onChatClick,
  primaryCtaLabel = "Reload Card",
  secretsRevealed = false,
  secretsLoading = false,
  secrets = null,
  onToggleSecrets,
  isRefreshing = false,
}: CardInfoGridProps) {
  const t = useTranslations("Cards");

  const last4 = card.cardNumber ? card.cardNumber.replace(/\s/g, "").slice(-4) : "0000";
  const balanceLabel = `$${card.balance.toLocaleString()} USD`;
  const dailyLimitLabel = `$${card.dailyLimit?.toLocaleString() ?? 500} USD`;
  const fullPanFormatted = secrets?.pan
    ? secrets.pan.replace(/\s/g, "").replace(/(.{4})/g, "$1 ").trim()
    : null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
      <div>
        <span className="text-[var(--color-text-muted)] text-[12px] sm:text-[13px] block mb-1">
          {t("balance")}
        </span>
        <span className="text-[var(--color-text-primary)] text-[14px] sm:text-[16px] font-normal">
          {isRefreshing ? (
            <WalletSkeletonText className="text-[14px] sm:text-[16px] font-normal">
              {balanceLabel}
            </WalletSkeletonText>
          ) : (
            balanceLabel
          )}
        </span>
      </div>
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[var(--color-text-muted)] text-[12px] sm:text-[13px]">
            {t("cardNumber")}
          </span>
          {onToggleSecrets && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleSecrets();
              }}
              disabled={secretsLoading}
              className={cn(
                "inline-flex size-5 items-center justify-center rounded-full transition-colors",
                "text-white/40 hover:text-white/80 hover:bg-white/[0.05]",
                "disabled:opacity-40 disabled:cursor-not-allowed",
              )}
              aria-label={secretsRevealed ? "Hide card number" : "Reveal card number"}
              title={secretsRevealed ? "Hide" : "Reveal full card details"}
            >
              {secretsRevealed ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
            </button>
          )}
        </div>
        <span className="text-[var(--color-text-secondary)] text-[12px] sm:text-[13px] font-mono min-h-[16px] inline-flex items-center">
          {secretsLoading ? (
            <SkeletonBlock className="h-4 w-36 rounded-[6px]" />
          ) : secretsRevealed && fullPanFormatted ? (
            fullPanFormatted
          ) : (
            <>•••• {last4}</>
          )}
        </span>
      </div>
      {/* When revealed, surface CVV + expiry where the daily-limit + reload
          cells used to be. Otherwise show daily limit + reload button as
          before. */}
      {secretsRevealed && secrets?.cvv ? (
        <div>
          <span className="text-[var(--color-text-muted)] text-[12px] sm:text-[13px] block mb-1">
            CVV
          </span>
          <span className="text-[var(--color-text-secondary)] text-[12px] sm:text-[13px] font-mono inline-flex items-center min-h-[16px]">
            {secretsLoading ? (
              <SkeletonBlock className="h-4 w-8 rounded-[6px]" />
            ) : (
              secrets.cvv
            )}
          </span>
        </div>
      ) : (
        <div>
          <span className="text-[var(--color-text-muted)] text-[12px] sm:text-[13px] block mb-1">
            Daily Limit
          </span>
          <span className="text-[var(--color-text-secondary)] text-[12px] sm:text-[13px]">
            {isRefreshing ? (
              <WalletSkeletonText className="text-[12px] sm:text-[13px]">
                {dailyLimitLabel}
              </WalletSkeletonText>
            ) : (
              dailyLimitLabel
            )}
          </span>
        </div>
      )}
      {secretsRevealed && secrets?.expiry ? (
        <div>
          <span className="text-[var(--color-text-muted)] text-[12px] sm:text-[13px] block mb-1">
            Expiry
          </span>
          <span className="text-[var(--color-text-secondary)] text-[12px] sm:text-[13px] font-mono inline-flex items-center min-h-[16px]">
            {secretsLoading ? (
              <SkeletonBlock className="h-4 w-10 rounded-[6px]" />
            ) : (
              secrets.expiry
            )}
          </span>
        </div>
      ) : (
        <div className="flex items-end gap-4">
          <Button
            onClick={(e) => {
              e.stopPropagation();
              onReloadClick?.();
            }}
            className={cn(
              "flex h-10 items-center justify-center gap-2 rounded-[10px] border-none px-4 text-sm !font-normal font-normal transition-all duration-300",
              "bg-[var(--color-reload-button-bg)] text-[var(--color-reload-button-text)] hover:bg-[var(--color-reload-button-bg)]/90",
            )}
          >
            <span className="font-normal">{primaryCtaLabel}</span>
          </Button>
          {onChatClick ? (
            <Button
              type="button"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                onChatClick();
              }}
              className={cn(
                "flex h-10 items-center justify-center rounded-[10px] px-4 text-sm !font-normal font-normal transition-all duration-300",
                "border border-white/[0.12] bg-transparent text-white hover:bg-white/[0.04] hover:text-white",
              )}
            >
              <span className="font-normal">Chat</span>
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}
