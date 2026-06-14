"use client";

import { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { DndContext, closestCenter, DragOverlay, useSensor, useSensors, PointerSensor } from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CardListItem } from "../../../components/CardListItem";
import InlineCardChat from "../../../components/InlineCardChat";
import type { Card } from "../../../shared";

// Legacy env gate for Card Controls Chat/Brain tabs + optional inline composer.
const AGENT_CHAT_ENABLED = process.env.NEXT_PUBLIC_AGENT_CHAT_ENABLED === "true";

interface CardsListProps {
  cards: Card[];
  selectedCardId: string;
  onSelectCard: (card: Card) => void;
  onLockToggle: (cardId: string) => void;
  onDelete: (cardId: string) => void;
  onReloadClick?: () => void;
  onWithdrawClick?: () => void;
  onTransactionsClick?: () => void;
  onReorder?: (cards: Card[]) => void;
  isRefreshing?: boolean;
 /** Agent Cards: Reload + Chat CTAs; Chat opens the sidebar Nuro AI panel. */
  perCardChat?: boolean;
}

function openSidebarChatPanel() {
  window.dispatchEvent(new CustomEvent("nuro:open-chat-v2"));
}

/**
 * DraggableCardListItem - Wrapper for CardListItem with drag functionality.
 *
 * 2026-05-25 v2: tracks per-card `chatExpanded` state so the parent
 * CardListItem can flip its hero between full + compressed when the
 * inline chat expands (Council Variant B "Card Flips to Console").
 */
function DraggableCardListItem({
  card,
  isSelected,
  onSelect,
  onLockToggle,
  onDelete,
  onReloadClick,
  onWithdrawClick,
  onTransactionsClick,
  isRefreshing = false,
  perCardChat = false,
}: {
  card: Card;
  isSelected: boolean;
  onSelect: (card: Card) => void;
  onLockToggle: (cardId: string) => void;
  onDelete: (cardId: string) => void;
  onReloadClick?: () => void;
  onWithdrawClick?: () => void;
  onTransactionsClick?: () => void;
  isRefreshing?: boolean;
  perCardChat?: boolean;
}) {
  const [chatExpanded, setChatExpanded] = useState(false);
  const showInlineChat = AGENT_CHAT_ENABLED && !perCardChat;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: card.id,
    animateLayoutChanges: () => false, // Disable animation after drop
  });

  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    transition,
  };

  if (isDragging) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="bg-[var(--color-bg-tertiary)] dark:bg-[var(--color-bg-glass)] dark:backdrop-blur-[var(--glass-blur)] rounded-[20px] border-2 border-dashed border-[var(--color-border-primary)] dark:border-[var(--color-border-glass)] p-4 sm:p-6 opacity-50"
      />
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      className="relative"
    >
      {/* Drag handle - disabled while chat is expanded so the user can
          freely interact with the console without accidentally dragging. */}
      {!chatExpanded && (
        <div
          className="absolute top-4 right-4 w-8 h-8 cursor-grab active:cursor-grabbing z-10"
          {...listeners}
        />
      )}
      <CardListItem
        card={card}
        isSelected={isSelected}
        onSelect={onSelect}
        onLockToggle={onLockToggle}
        onDelete={onDelete}
        onReloadClick={onReloadClick}
        onChatClick={perCardChat ? openSidebarChatPanel : undefined}
        primaryCtaLabel={perCardChat ? "Reload" : undefined}
        onWithdrawClick={onWithdrawClick}
        onTransactionsClick={onTransactionsClick}
        isRefreshing={isRefreshing}
        isChatExpanded={showInlineChat ? chatExpanded : false}
        footerSlot={
          showInlineChat ? (
            <InlineCardChat
              cardId={card.id}
              cardName={card.cardName || card.cardType}
              onExpandedChange={setChatExpanded}
            />
          ) : null
        }
      />
    </div>
  );
}

/**
 * CardsList - List of card items with drag and drop reordering
 */
export function CardsList({
  cards,
  selectedCardId,
  onSelectCard,
  onLockToggle,
  onDelete,
  onReloadClick,
  onWithdrawClick,
  onTransactionsClick,
  onReorder,
  isRefreshing = false,
  perCardChat = false,
}: CardsListProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const handleDragStart = (event: any) => {
    setActiveId(event.active.id);
  };

  const handleDragEnd = (event: any) => {
    const { active, over } = event;

    if (active.id !== over.id) {
      const oldIndex = cards.findIndex((card) => card.id === active.id);
      const newIndex = cards.findIndex((card) => card.id === over.id);

      const newCards = [...cards];
      const [reorderedCard] = newCards.splice(oldIndex, 1);
      newCards.splice(newIndex, 0, reorderedCard);

      onReorder?.(newCards);
    }

    setActiveId(null);
  };

  const handleDragCancel = () => {
    setActiveId(null);
  };

  const activeCard = useMemo(() => {
    if (!activeId) return null;
    return cards.find((card) => card.id === activeId) || null;
  }, [activeId, cards]);

  const itemIds = useMemo(() => cards.map((card) => card.id), [cards]);

  return (
    <DndContext
      sensors={useSensors(
        useSensor(PointerSensor, {
          activationConstraint: {
            distance: 8,
          },
        })
      )}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <SortableContext items={itemIds} strategy={rectSortingStrategy}>
        <div className="space-y-4">
          {cards.map((card) => (
            <DraggableCardListItem
              key={card.id}
              card={card}
              isSelected={selectedCardId === card.id}
              onSelect={onSelectCard}
              onLockToggle={onLockToggle}
              onDelete={onDelete}
              onReloadClick={onReloadClick}
              onWithdrawClick={onWithdrawClick}
              onTransactionsClick={onTransactionsClick}
              isRefreshing={isRefreshing}
              perCardChat={perCardChat}
            />
          ))}
        </div>
      </SortableContext>

      {typeof document !== "undefined" &&
        createPortal(
          <DragOverlay dropAnimation={null} zIndex={9999}>
            {activeCard ? (
              <div className="bg-[var(--color-bg-secondary)] dark:bg-[var(--color-bg-glass)] dark:backdrop-blur-[var(--glass-blur)] glass-card-inner rounded-[20px] border border-[var(--color-border-primary)] p-4 sm:p-6 shadow-md scale-[1.02]">
                <CardListItem
                  card={activeCard}
                  isSelected={selectedCardId === activeCard.id}
                  onSelect={onSelectCard}
                  onLockToggle={onLockToggle}
                  onDelete={onDelete}
                  onReloadClick={onReloadClick}
                  onWithdrawClick={onWithdrawClick}
                  onTransactionsClick={onTransactionsClick}
                />
              </div>
            ) : null}
          </DragOverlay>,
          document.body
        )}
    </DndContext>
  );
}
