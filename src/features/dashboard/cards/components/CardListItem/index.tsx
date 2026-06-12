"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSession } from "next-auth/react";
import {
  MoreHorizontal,
  Lock,
  Unlock,
  AlertTriangle,
  Wallet,
  ArrowRightLeft,
  Eye,
  EyeOff,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { CreditCard, SkeletonBlock } from "@/components";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  WALLET_GLASS_MENU_CONTENT,
  WALLET_GLASS_MENU_ITEM_ROW_BASE,
  WALLET_GLASS_MENU_ITEM_ROW_DANGER,
  WALLET_GLASS_MENU_ITEM_ROW_NEUTRAL,
  walletGlassMenuItemRowSpacing,
} from "@/lib/walletGlassMenu";
import { useAgentCardsDataMode } from "@/features/dashboard/agent-cards/AgentCardsDataModeContext";
import type { Card } from "../../shared";
import { MOCK_CARD_ACTIONS } from "./config/cardActions.config";
import type { CardActionItem } from "./config/cardActions.config";
import { ReportIssueModal } from "../ReportIssueModal";
import { CardStatusBadge, CardInfoGrid } from "./components";

interface CardListItemProps {
  card: Card;
  isSelected: boolean;
  onSelect: (card: Card) => void;
  onLockToggle: (cardId: string) => void;
  onDelete: (cardId: string) => void;
  onReloadClick?: () => void;
  /** Opens the sidebar Nuro AI chat panel (Agent Cards). */
  onChatClick?: () => void;
  onWithdrawClick?: () => void;
  onTransactionsClick?: () => void;
  /** Defaults to "Reload Card". */
  primaryCtaLabel?: string;
  /** Hide Active/Frozen/Inactive status pill (first-time inactive card). */
  hideStatusBadge?: boolean;
  /** Menu opens; rows are not selectable until the card is active. */
  menuActionsDisabled?: boolean;
  /**
   * 2026-05-25: optional footer slot that renders INSIDE the card's outer
   * container (same bg + border + rounded corners). Used to mount the
   * inline per-card chat so it visually merges with the card surface
   * rather than rendering as a sibling div below. Per Richard: "one
   * living breathing div, not a div below it that's an antiquated design."
   */
  footerSlot?: React.ReactNode;
  /**
   * 2026-05-25 v2 (Council Variant B — Card Flips to Console):
   * When true, the hero (credit card visual + meta + info grid) collapses
   * to a thin horizontal strip and the chat console takes center stage.
   * Driven by InlineCardChat's onExpandedChange callback via CardsList.
   */
  isChatExpanded?: boolean;
  /** Header refresh — skeleton numeric fields in the info grid. */
  isRefreshing?: boolean;
}

const MENU_TRIGGER_CLASS =
  "inline-flex size-8 shrink-0 items-center justify-center rounded-[10px] text-white/50 transition-colors hover:bg-white/[0.03] hover:text-white/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/30 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent data-[state=open]:bg-white/[0.03] data-[state=open]:text-white/65";

type CardActionType = CardActionItem["actionType"] | "unlock";

const ACTION_ICONS: Record<CardActionType, typeof ArrowRightLeft> = {
  lock: Lock,
  unlock: Unlock,
  report: AlertTriangle,
  withdraw: Wallet,
  transactions: ArrowRightLeft,
  settings: ArrowRightLeft,
};

// V0 Council spring — stiffness 240 / damping 28 = brisk-but-soft animation.
// 2026-05-25 v6 revert per Richard: v4 felt right, v5 specialist changes
// over-tuned. Back to symmetric spring + single-ref measurement + popLayout.
const HERO_SPRING = { type: "spring" as const, stiffness: 240, damping: 28 };
const FADE = { duration: 0.18, ease: [0.22, 1, 0.36, 1] as const };

/**
 * useCardSecretsReveal — eye-icon-driven PAN/CVV/expiry reveal flow.
 *
 * 2026-05-26 per Richard: port the existing overviewHero reveal pattern to
 * the per-card chat UI. User taps eye → fetch /api/cards/:id/secrets → swap
 * masked last-4 for the real PAN + show CVV + expiry.
 *
 * State machine:
 *   idle          eye visible, masked last-4 showing
 *   loading       eye disabled, skeleton in slot, fetch in flight
 *   revealed      EyeOff visible, real PAN + CVV + expiry showing
 *   error         falls back to masked, eye re-enabled
 *
 * Drops revealed state on cardId change so we never leak the prior card's
 * secrets onto a freshly-mounted row.
 */
function useCardSecretsReveal(cardId: string) {
  const { data: session } = useSession();
  const accessToken = (session as { accessToken?: string } | null)?.accessToken ?? null;
  const [revealed, setRevealed] = useState(false);
  const [secrets, setSecrets] = useState<{ pan: string | null; cvv: string | null; expiry: string | null } | null>(null);
  const [loading, setLoading] = useState(false);

  // Reset on card change — never bleed across cards.
  useEffect(() => {
    setRevealed(false);
    setSecrets(null);
    setLoading(false);
  }, [cardId]);

  const toggle = useCallback(async () => {
    if (loading) return;
    // Hide back to masked.
    if (revealed) {
      setRevealed(false);
      return;
    }
    // Already fetched — just re-show.
    if (secrets) {
      setRevealed(true);
      return;
    }
    if (!cardId || !accessToken) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/cards/${cardId}/secrets`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        // 429 (rate limit) / 500 — sentinel keeps loading false + reveal false
        // so the slots fall back to masked values. Future taps can retry.
        const body = await res.json().catch(() => ({}));
        console.warn(`[useCardSecretsReveal] secrets fetch returned ${res.status}`, body?.error || "");
        setSecrets({ pan: null, cvv: null, expiry: null });
        return;
      }
      const data = await res.json();
      setSecrets({
        pan: data.cardNumber ? String(data.cardNumber) : null,
        cvv: data.cvv ? String(data.cvv) : null,
        expiry: data.expiryDate ? String(data.expiryDate) : null,
      });
      setRevealed(true);
    } catch (err) {
      console.warn("[useCardSecretsReveal] secrets fetch failed:", err);
      setSecrets({ pan: null, cvv: null, expiry: null });
    } finally {
      setLoading(false);
    }
  }, [cardId, accessToken, loading, revealed, secrets]);

  return { revealed, loading, secrets, toggle };
}

/**
 * useMeasuredHeight — observes a DOM node's height via ResizeObserver.
 * v4 pattern: single ref on the inner wrapper containing both variants
 * via AnimatePresence. Driving real height (not layout-prop FLIP) avoids
 * the scale-inheritance text-stretch issue.
 */
function useMeasuredHeight() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = useState<number>(0);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    setHeight(node.offsetHeight);
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect?.height;
      if (typeof h === "number" && h > 0) setHeight(h);
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  return [ref, height] as const;
}

/**
 * CardListItem - Displays a card item in the cards list.
 *
 * Two hero variants animated via framer-motion:
 *   FULL:       credit card visual + name + status + dropdown + info grid
 *   COMPRESSED: thin strip (card thumbnail + name + last4 + status + dropdown)
 *
 * Compressed mode triggers when the inline chat console expands. The card
 * "flips" out of the way so the conversation gets center stage — design
 * Council locked Variant B 2026-05-25.
 */
function CardListItem({
  card,
  isSelected,
  onSelect,
  onLockToggle,
  onDelete: _onDelete,
  onReloadClick,
  onChatClick,
  onWithdrawClick,
  onTransactionsClick,
  primaryCtaLabel,
  hideStatusBadge = false,
  menuActionsDisabled = false,
  footerSlot,
  isChatExpanded = false,
  isRefreshing = false,
}: CardListItemProps) {
  const t = useTranslations("Cards");
  const agentCardsMode = useAgentCardsDataMode();
  const agentCardsStrokeSelectionOnly = agentCardsMode !== null;
  const [reportOpen, setReportOpen] = useState(false);
  // v4 pattern: single ref on the inner wrapper. Parent motion.div animates
  // real height via spring; no transform on children, no scale inheritance.
  const [heroMeasureRef, heroHeight] = useMeasuredHeight();
  // 2026-05-26 per Richard: eye-icon-driven PAN/CVV/expiry reveal on the
  // chat-card UI. Same flow as the overview hero deck.
  const { revealed: secretsRevealed, loading: secretsLoading, secrets, toggle: toggleSecrets } =
    useCardSecretsReveal(card.id);

  const cardActions = MOCK_CARD_ACTIONS.map((action) => {
    const isLockAction =
      action.actionType === "lock" || action.actionType === "unlock";
    const actionType: CardActionType = isLockAction
      ? card.isLocked
        ? "unlock"
        : "lock"
      : action.actionType;

    const Icon = ACTION_ICONS[actionType];

    const labelMap: Record<CardActionType, string> = {
      lock: card.isLocked ? "Unfreeze Card" : "Freeze Card",
      unlock: "Unfreeze Card",
      settings: t("cardSettings"),
      report: t("reportIssue"),
      withdraw: "Withdraw",
      transactions: "Transactions",
    };

    const onClickMap: Record<CardActionType, () => void> = {
      lock: () => onLockToggle(card.id),
      unlock: () => onLockToggle(card.id),
      settings: () => {
        window.location.href = "/dashboard/my-card-1";
      },
      report: () => setReportOpen(true),
      withdraw: () => onWithdrawClick?.(),
      transactions: () => onTransactionsClick?.(),
    };

    return {
      id: action.id,
      label: labelMap[actionType],
      Icon,
      onSelect: onClickMap[actionType],
      variant: action.variant,
    };
  });

  // Dropdown menu — shared between full + compressed hero variants.
  const dropdownMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={MENU_TRIGGER_CLASS}
          aria-label={`Options for ${card.cardName || card.cardType}`}
        >
          <MoreHorizontal
            className="size-4 shrink-0 opacity-90"
            strokeWidth={2.25}
            aria-hidden
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className={WALLET_GLASS_MENU_CONTENT}>
        {cardActions.map(({ id, label, Icon, onSelect, variant }, index) => (
          <DropdownMenuItem
            key={id}
            textValue={label}
            disabled={menuActionsDisabled}
            className={cn(
              WALLET_GLASS_MENU_ITEM_ROW_BASE,
              "!flex min-w-0 items-center gap-2",
              walletGlassMenuItemRowSpacing(index, cardActions.length),
              variant === "danger"
                ? WALLET_GLASS_MENU_ITEM_ROW_DANGER
                : WALLET_GLASS_MENU_ITEM_ROW_NEUTRAL,
              menuActionsDisabled && "pointer-events-none opacity-50",
            )}
            onSelect={(event) => {
              if (menuActionsDisabled) {
                event.preventDefault();
                return;
              }
              onSelect();
            }}
          >
            <Icon
              className="h-3.5 w-3.5 shrink-0 opacity-90"
              strokeWidth={2.25}
              aria-hidden
            />
            <span className="min-w-0 flex-1 text-left">{label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const last4 = card.cardNumber ? card.cardNumber.replace(/\s/g, "").slice(-4) : "0000";

  return (
    <div
      className={cn(
        "bg-[var(--color-bg-secondary)] dark:bg-[var(--color-bg-glass)] dark:backdrop-blur-[var(--glass-blur)] glass-card-inner rounded-[20px] border p-4 sm:p-6 cursor-pointer transition-all hover:bg-[var(--color-bg-secondary)]/40 dark:hover:bg-[var(--color-bg-glass-strong)]",
        card.isLocked
          ? "border-[var(--color-error-border)]"
          : isSelected
            ? "border-white/50"
            : agentCardsStrokeSelectionOnly
              ? "border-transparent"
              : "border-transparent dark:border-[var(--color-border-glass)]",
      )}
      style={
        card.isLocked
          ? {
              boxShadow:
                "inset 0 0 20px 2px var(--color-error-muted), inset 0 0 40px 4px var(--color-error-shadow)",
            }
          : undefined
      }
      onClick={() => onSelect(card)}
    >
      {/* HERO — v4 revert (2026-05-25) per Richard.
          Outer motion.div animates REAL height via spring (no FLIP transform).
          Single inner div with ref measures whichever variant is currently
          mounted via AnimatePresence. Crossfade between full/compressed at
          natural size. */}
      <motion.div
        animate={{ height: heroHeight || "auto" }}
        transition={HERO_SPRING}
        className="relative overflow-hidden"
        style={{ willChange: "height" }}
      >
        <div ref={heroMeasureRef}>
        <AnimatePresence mode="popLayout" initial={false}>
          {isChatExpanded ? (
            <motion.div
              key="compressed"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={FADE}
              className="flex items-center gap-3 sm:gap-4"
            >
              {/* Mini card thumbnail at native `compact` size. */}
              <div className="shrink-0 pointer-events-none">
                <CreditCard
                  cardNumber={card.cardNumber}
                  cardHolder={card.cardName || card.cardHolder}
                  expiryDate={card.expiryDate}
                  gradient={card.cardColor || card.gradient}
                  id={card.cardType}
                  isFrozen={card.isLocked}
                  compact
                />
              </div>

              {/* Name + last4 + status */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <h3 className="text-[var(--color-text-primary)] text-[14px] sm:text-[15px] font-medium truncate">
                    {card.cardName || card.cardType}
                  </h3>
                  {!hideStatusBadge ? <CardStatusBadge card={card} /> : null}
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="text-white/45 text-[11px] tracking-[0.15em] font-mono min-h-[14px] inline-flex items-center">
                    {secretsLoading ? (
                      <SkeletonBlock className="h-3.5 w-24 rounded-[6px]" />
                    ) : secretsRevealed && secrets?.pan ? (
                      <span className="text-white/80">
                        {secrets.pan.replace(/\s/g, "").replace(/(.{4})/g, "$1 ").trim()}
                      </span>
                    ) : (
                      <>···· {last4}</>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void toggleSecrets();
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
                </div>
              </div>

              {/* Dropdown — same actions as full mode */}
              <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                {dropdownMenu}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="full"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={FADE}
            >
              <div className="flex flex-col lg:flex-row items-start lg:items-center gap-4 lg:gap-6">
                <div className="w-full lg:w-auto flex justify-center lg:justify-start">
                  <CreditCard
                    cardNumber={card.cardNumber}
                    cardHolder={card.cardName || card.cardHolder}
                    expiryDate={card.expiryDate}
                    gradient={card.cardColor || card.gradient}
                    id={card.cardType}
                    isFrozen={card.isLocked}
                  />
                </div>

                <div className="flex-1 w-full">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <h3 className="text-[var(--color-text-primary)] text-[16px] sm:text-[18px] font-normal">
                        {card.cardName || card.cardType}
                      </h3>
                      {!hideStatusBadge ? <CardStatusBadge card={card} /> : null}
                    </div>
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      {dropdownMenu}
                    </div>
                  </div>

                  <CardInfoGrid
                    card={card}
                    isLocked={card.isLocked}
                    onReloadClick={onReloadClick}
                    onChatClick={onChatClick}
                    primaryCtaLabel={primaryCtaLabel}
                    secretsRevealed={secretsRevealed}
                    secretsLoading={secretsLoading}
                    secrets={secrets}
                    onToggleSecrets={toggleSecrets}
                    isRefreshing={isRefreshing}
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        </div>
      </motion.div>

      {/* Inline chat slot — lives INSIDE the card container so chat + card
          share one visual envelope. stopPropagation prevents clicks inside
          the chat from re-triggering the card's onSelect. */}
      {footerSlot && (
        <div onClick={(e) => e.stopPropagation()}>
          {footerSlot}
        </div>
      )}

      <ReportIssueModal
        open={reportOpen}
        onOpenChange={setReportOpen}
        cardLabel={card.cardName || card.cardType}
      />
    </div>
  );
}

export { CardListItem };
