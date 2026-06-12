"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { revealScrollbarWhileScrolling } from "@/lib/scrollbarReveal";
import type { Card } from "@/features/dashboard/cards/shared";
import {
  ASSISTANT_CHAT_GENERAL_ID,
  cardChatDestinationId,
} from "@/components/chat/assistantChatDestinations";

/** Inferred from app sidebar density (~240px shell, ~200px content column). */
export const ASSISTANT_CHAT_NAV_RAIL_WIDTH_PX = 200;

/** Must match motion.aside `p-[10px]` — gap between nav shell and chat shell. */
export const ASSISTANT_CHAT_NAV_CHROME_GAP_PX = 10;

/** Aside outer radius (34px) minus aside padding (10px) — single shell for nav + chat. */
export const ASSISTANT_CHAT_SHELL_RADIUS_CLASS = "rounded-[24px]";

export const ASSISTANT_CHAT_SHELL_CLASS = cn(
  "flex h-full min-h-0 w-full overflow-hidden pointer-events-auto !backdrop-blur-none",
  ASSISTANT_CHAT_SHELL_RADIUS_CLASS
);

export const ASSISTANT_CHAT_SHELL_STYLE = {
  backgroundColor: "rgba(255, 255, 255, 0.02)",
  border: "1px solid rgba(255, 255, 255, 0.05)",
} as const;

type AssistantChatPanelNavRailProps = {
  activeDestinationId: string;
  onSelectDestination: (destinationId: string) => void;
  cards: Card[];
};

const navRowBase =
  "flex w-full max-w-full min-w-0 items-start gap-2.5 rounded-[var(--radius-md)] px-3 py-3 text-left text-xs transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/40";

function NavRow({
  active,
  onClick,
  leading,
  label,
  secondary,
}: {
  active: boolean;
  onClick: () => void;
  leading?: ReactNode;
  label: string;
  secondary?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      className={cn(
        navRowBase,
        active
          ? "bg-[var(--color-sidebar-item-hover)] text-[var(--color-text-primary)]"
          : "text-[var(--color-text-muted)] hover:bg-[var(--color-sidebar-item-hover-subtle)] hover:text-[var(--color-text-primary)]"
      )}
    >
      {leading ? <span className="shrink-0">{leading}</span> : null}
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate font-medium leading-snug">{label}</span>
        {secondary ? (
          <span className="truncate text-[10px] leading-snug text-[var(--color-text-muted)]">
            {secondary}
          </span>
        ) : null}
      </span>
    </button>
  );
}

export function AssistantChatPanelNavRail({
  activeDestinationId,
  onSelectDestination,
  cards,
}: AssistantChatPanelNavRailProps) {
  return (
    <nav
      className={cn(
        "flex h-full shrink-0 flex-col overflow-hidden",
        ASSISTANT_CHAT_SHELL_RADIUS_CLASS
      )}
      style={{ width: ASSISTANT_CHAT_NAV_RAIL_WIDTH_PX, ...ASSISTANT_CHAT_SHELL_STYLE }}
      aria-label="Chat destinations"
    >
      <div
        className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain px-3 pt-4 pb-4 scrollbar-autohide [scrollbar-gutter:auto]"
        onScroll={(e) => revealScrollbarWhileScrolling(e.currentTarget)}
      >
        <NavRow
          active={activeDestinationId === ASSISTANT_CHAT_GENERAL_ID}
          onClick={() => onSelectDestination(ASSISTANT_CHAT_GENERAL_ID)}
          label="General"
          secondary="Nuro Intelligence"
        />

        {cards.length > 0 ? (
          <div className="mt-3 flex w-full min-w-0 flex-col gap-0.5 self-stretch">
            <p className="pb-1.5 pl-3 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
              Cards
            </p>
            {cards.map((card) => {
              const destId = cardChatDestinationId(card.id);
              const last4 = card.cardNumber.replace(/\s/g, "").slice(-4);
              return (
                <NavRow
                  key={destId}
                  active={activeDestinationId === destId}
                  onClick={() => onSelectDestination(destId)}
                  leading={
                    <span
                      className="block h-4 w-6 rounded-[3px]"
                      style={{ background: card.gradient }}
                      aria-hidden
                    />
                  }
                  label={card.cardName}
                  secondary={last4 ? `•••• ${last4}` : undefined}
                />
              );
            })}
          </div>
        ) : null}
      </div>
    </nav>
  );
}
