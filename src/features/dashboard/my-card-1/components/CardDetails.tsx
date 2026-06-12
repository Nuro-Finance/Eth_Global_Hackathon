import React, { useState, useEffect, useCallback } from "react";
import { useAppSession } from "@/hooks/useAppSession";
import { Eye, EyeOff, Copy, Check, Snowflake, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { copyToClipboard } from "@/lib/clipboard";

import { motion, AnimatePresence } from "framer-motion";
import { useAgentCardsDataMode } from "@/features/dashboard/agent-cards/AgentCardsDataModeContext";
import { useMyCardDataMode } from "../MyCardDataModeContext";
import { MY_CARD_INNER_ICON_BUTTON_CLASS, MY_CARD_INNER_INPUT_CLASS, MY_CARD_INNER_TILE_CLASS } from "./myCardInnerFieldStyles";

const FREEZE_EASE = [0.22, 1, 0.36, 1] as const;

const FROZEN_WIDGET_GLOW = [
  "0 0 20px var(--color-error-shadow)",
  "inset 0 0 32px 0 rgba(255, 82, 82, 0.38)",
  "inset 0 0 56px 0 rgba(255, 82, 82, 0.1)",
].join(", ");

/** Left-anchored idle wash — low-opacity radial only; frozen state uses error tokens + glow. */
const FREEZE_WIDGET_IDLE_RADIAL_BURST =
  "radial-gradient(ellipse 190% 100% at 0% 50%, rgba(255, 82, 82, 0.03) 0%, transparent 78%)";

function freezeTintTransition(frozen: boolean) {
  return {
    duration: frozen ? 0.52 : 0.44,
    ease: FREEZE_EASE,
    delay: frozen ? 0.07 : 0.06,
  };
}

function freezeGlowTransition(frozen: boolean) {
  return {
    duration: frozen ? 0.56 : 0.42,
    ease: FREEZE_EASE,
    delay: frozen ? 0.07 : 0,
  };
}

interface DetailRowProps {
  label: string;
  value: string;
  maskedValue?: string;
  isRevealed: boolean;
  canCopy?: boolean;
}

const DetailRow = ({ label, value, maskedValue, isRevealed, canCopy }: DetailRowProps) => {
  const [isCopied, setIsCopied] = useState(false);
  const displayValue = isRevealed ? value : (maskedValue || value);

  const handleCopy = () => {
    if (!canCopy) return;
    copyToClipboard(value);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <div className="flex items-center justify-between py-3 relative h-[52px]">
      <span className="text-[13px] text-[var(--color-text-muted)] font-medium">{label}</span>

      <div
        className={cn(
          "relative h-full flex items-center justify-end min-w-[160px] transition-all",
          canCopy ? "cursor-pointer group/copy" : ""
        )}
        onClick={handleCopy}
      >
        <div className="relative w-full h-full flex items-center justify-end">
          <motion.span
            className={cn(
              "text-[14px] font-mono font-medium text-[var(--color-text-primary)] transition-all duration-300 whitespace-nowrap",
              canCopy ? (isCopied ? "blur-[3px]" : "group-hover/copy:blur-[3px]") : ""
            )}
          >
            {displayValue}
          </motion.span>

          <div
            className={cn(
              "absolute inset-0 flex items-center justify-center rounded-[10px] bg-white/[0.05] backdrop-blur-none pointer-events-none transition-all duration-300",
              isCopied ? "opacity-100 scale-100" : "opacity-0 scale-95 group-hover/copy:opacity-100 group-hover/copy:scale-100"
            )}
          >
            <div className="flex items-center justify-center w-full h-full">
              {isCopied ? (
                <>
                  <Check className="w-3.5 h-3.5 mr-1.5 text-[var(--color-success)]" strokeWidth={1.5} />
                  <span className="text-[11px] uppercase font-bold tracking-widest text-[var(--color-success)]">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 mr-2 text-[var(--color-text-primary)]" strokeWidth={1.5} />
                  <span className="text-[11px] uppercase font-bold tracking-widest text-[var(--color-text-primary)]">Copy</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

interface CardDetailsProps {
  isFrozen?: boolean;
  onToggleFreeze?: () => void;
  onReportLostOrStolen?: () => void;
  cardName?: string;
  setCardName?: (name: string) => void;
  cardId?: string | null;
  cardNumber?: string;
  expiryDate?: string;
}

export function CardDetails({
  isFrozen = false,
  onToggleFreeze,
  onReportLostOrStolen,
  cardName = "My Card",
  setCardName,
  cardId,
  cardNumber = "",
  expiryDate = ""
}: CardDetailsProps) {
  const { data: session } = useAppSession();
  const myCardMode = useMyCardDataMode();
  const agentCardsMode = useAgentCardsDataMode();
  const isFirstTimeUser =
    myCardMode === "first-time-user" || agentCardsMode === "first-time-user";
  const [isRevealed, setIsRevealed] = useState(false);
  const [isEditingName, setIsEditingName] = useState(true);
  const [tempName, setTempName] = useState(cardName);
  const [isSaved, setIsSaved] = useState(false);

 // Sync tempName when cardName prop changes (e.g., when selecting different card)
  useEffect(() => {
    setTempName(cardName);
  }, [cardName]);

  const handleSaveName = useCallback(async () => {
    if (!tempName.trim() || !setCardName) return;
 // Update local state immediately
    setCardName(tempName);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 1000);
 // Persist to backend
    if (cardId) {
      const token = (session as any)?.accessToken;
      try {
        await fetch(`/api/cards/${cardId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ card_name: tempName }),
        });
      } catch (err) {
        console.warn("[CardDetails] save name failed:", err);
      }
    }
  }, [tempName, setCardName, cardId, session]);

  const displayExpiry = isFirstTimeUser ? "--/--" : (expiryDate || "12/28");
  const detailsRevealed = isFirstTimeUser ? false : isRevealed;
  const freezeUiFrozen = isFirstTimeUser ? false : isFrozen;

  return (
    <div className="flex flex-col gap-4 w-full animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* Card Name Section */}
      <div className="px-1 flex flex-col gap-1.5">
        <h4 className="text-[12px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
          Card Name
        </h4>
        <div className="relative group/name">
          <div className="flex items-center gap-2 max-w-full overflow-hidden">
            <input
              type="text"
              value={tempName}
              maxLength={27}
              onChange={(e) => setTempName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveName();
              }}
              onBlur={() => !isSaved && handleSaveName()}
              className={cn(
                "flex-1 bg-[var(--color-bg-input)] rounded-[12px] px-3.5 h-10.5 text-[14px] font-medium text-[var(--color-text-primary)] transition-all truncate",
                MY_CARD_INNER_INPUT_CLASS,
                "focus:bg-[var(--color-bg-input-hover)]",
              )}
              placeholder="Enter card name"
            />
            <Button
              size="icon"
              onClick={handleSaveName}
              className={cn(
                "h-10.5 w-10.5 flex-shrink-0 rounded-[12px] transition-all duration-300 bg-[var(--color-bg-input)]",
                MY_CARD_INNER_ICON_BUTTON_CLASS,
                isSaved
                  ? "bg-[var(--color-success)] text-[var(--color-text-primary)]"
                  : "text-[var(--color-text-muted)] hover:bg-[var(--color-bg-input-hover)]"
              )}
            >
              <Check className={cn("w-4 h-4", isSaved ? "text-[var(--color-text-primary)]" : "")} strokeWidth={1.5} />
            </Button>
          </div>
        </div>
      </div>

      {/* Detail Action Bar */}
      <div className="flex items-center justify-between px-1">
        <h4 className="text-[12px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
          Card Information
        </h4>
        {isFirstTimeUser ? (
          <div
            aria-hidden
            className="inline-flex h-8 items-center rounded-[12px] px-3 text-[13px] font-medium text-[var(--color-text-primary)] pointer-events-none select-none"
          >
            <Eye className="w-4 h-4 mr-2" />
            Show Details
          </div>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsRevealed(!isRevealed)}
            className="h-8 rounded-[12px] text-[13px] font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] dark:hover:bg-white/5 transition-all"
          >
            {isRevealed ? (
              <>
                <EyeOff className="w-4 h-4 mr-2" />
                Hide Details
              </>
            ) : (
              <>
                <Eye className="w-4 h-4 mr-2" />
                Show Details
              </>
            )}
          </Button>
        )}
      </div>

      {/* Details Card */}
      <div
        className={cn(
          "flex flex-col px-5 py-2 rounded-[16px] bg-[var(--color-bg-primary)] dark:bg-white/[0.04]",
          MY_CARD_INNER_TILE_CLASS,
        )}
      >
        <DetailRow
          label="Number"
          value={cardNumber || "4282 1234 5678 9012"}
          maskedValue="•••• •••• •••• ••••"
          isRevealed={detailsRevealed}
          canCopy={!isFirstTimeUser}
        />
        <DetailRow
          label="Valid Thru"
          value={displayExpiry}
          isRevealed={true}
        />
        <DetailRow
          label="CVV"
          value="482"
          maskedValue="•••"
          isRevealed={detailsRevealed}
          canCopy={!isFirstTimeUser}
        />
      </div>

      <motion.div
        initial={false}
        animate={{
          backgroundColor: freezeUiFrozen ? "var(--color-error-muted)" : "var(--color-bg-glass)",
          borderColor: freezeUiFrozen ? "var(--color-error-border)" : "var(--color-border-glass)",
        }}
        transition={{
          backgroundColor: freezeTintTransition(freezeUiFrozen),
          borderColor: freezeTintTransition(freezeUiFrozen),
        }}
        className="relative mt-2 flex flex-col overflow-hidden rounded-[16px] border border-[var(--color-border-input)] p-4"
      >
        <div
          className="pointer-events-none absolute inset-0 rounded-[16px]"
          aria-hidden
          style={{ background: FREEZE_WIDGET_IDLE_RADIAL_BURST }}
        />
        <motion.div
          className="pointer-events-none absolute inset-0 rounded-[16px]"
          aria-hidden
          initial={false}
          animate={{ opacity: freezeUiFrozen ? 1 : 0 }}
          transition={{ opacity: freezeGlowTransition(freezeUiFrozen) }}
          style={{ boxShadow: FROZEN_WIDGET_GLOW }}
        />
        <motion.div
          className="pointer-events-none absolute inset-0 rounded-[16px] bg-gradient-to-br from-[var(--color-error)]/5 to-transparent"
          aria-hidden
          initial={false}
          animate={{ opacity: freezeUiFrozen ? 1 : 0 }}
          transition={{ opacity: freezeGlowTransition(freezeUiFrozen) }}
        />
        <div className="relative z-[1] flex w-full items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <motion.div
              initial={false}
              animate={{
                backgroundColor: freezeUiFrozen ? "var(--color-error-muted)" : "var(--color-bg-glass)",
                borderColor: freezeUiFrozen ? "var(--color-error-border)" : "var(--color-border-glass)",
                color: freezeUiFrozen ? "var(--color-error)" : "var(--color-text-muted)",
              }}
              transition={{
                backgroundColor: freezeTintTransition(freezeUiFrozen),
                borderColor: freezeTintTransition(freezeUiFrozen),
                color: freezeTintTransition(freezeUiFrozen),
              }}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border border-[var(--color-border-input)]"
            >
              <Snowflake className="h-5 w-5" />
            </motion.div>
            <div className="flex min-w-0 flex-col gap-0.5">
              <motion.span
                initial={false}
                animate={{ color: freezeUiFrozen ? "var(--color-error)" : "var(--color-text-primary)" }}
                transition={{ color: freezeTintTransition(freezeUiFrozen) }}
                className="text-sm font-semibold"
              >
                {freezeUiFrozen ? "Card Frozen" : "Freeze Card"}
              </motion.span>
              <span className="text-[12px] text-[var(--color-text-muted)]">
                Spending is disabled.
              </span>
            </div>
          </div>
          <Switch
            checked={freezeUiFrozen}
            onChange={
              isFirstTimeUser ? () => {} : () => onToggleFreeze?.()
            }
            className={cn(
              "shrink-0 transition-all duration-400 ease-in-out",
              isFirstTimeUser && "pointer-events-none cursor-default",
              freezeUiFrozen
                ? "bg-[var(--color-error)]! border-[var(--color-error)]/20!"
                : "bg-[var(--color-bg-tertiary)]! dark:bg-[var(--color-bg-glass-strong)]! dark:border-white/5!",
            )}
            aria-label="Freeze Card"
          />
        </div>

        <AnimatePresence initial={false}>
          {freezeUiFrozen && (
            <motion.div
              key="report-lost-stolen"
              className="relative z-[1] w-full overflow-hidden"
              initial={{ maxHeight: 0, opacity: 0 }}
              animate={{ maxHeight: 92, opacity: 1 }}
              exit={{
                maxHeight: 0,
                opacity: 0,
                transition: {
                  opacity: { duration: 0.2, ease: [0.4, 0, 1, 1] },
                  maxHeight: {
                    duration: 0.44,
                    ease: [0.22, 1, 0.36, 1],
                    delay: 0.05,
                  },
                },
              }}
              transition={{
                maxHeight: {
                  duration: 0.52,
                  ease: [0.22, 1, 0.36, 1],
                },
                opacity: {
                  duration: 0.42,
                  ease: [0.22, 1, 0.36, 1],
                  delay: 0.07,
                },
              }}
            >
              <Button
                type="button"
                variant="outline"
                onClick={() => onReportLostOrStolen?.()}
                className={cn(
                  "mt-3 h-12 w-full origin-top rounded-[14px] !border !border-[var(--color-border-input-hover)] px-6 text-sm font-bold !text-[var(--color-text-muted)] shadow-none",
                  "transition-[color,border-color] duration-200 ease-out",
                  "hover:!border-white/50 hover:!text-white/70",
                  "!bg-transparent !backdrop-blur-none hover:!bg-transparent active:!bg-transparent",
                  "dark:!bg-transparent dark:hover:!bg-transparent dark:active:!bg-transparent",
                  "[&_svg]:!text-[var(--color-text-muted)] [&_svg]:hover:!text-white/70",
                )}
              >
                Report Lost or Stolen
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

    </div>
  );
}
