"use client";

import { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { format } from "date-fns";
import { ArrowDownLeft, ArrowUpRight, GripVertical } from "lucide-react";
import { DndContext, DragOverlay, closestCenter } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  rectSortingStrategy,
  defaultAnimateLayoutChanges,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { useDragSensors, useStatsOrder } from "@/components/DraggableStatCards";
import type { StatData } from "@/components/DraggableStatCards";
import type { Transaction } from "../../../shared";
import { useTransactionsPreview } from "../hooks/useTransactionsPreview";
import { TransactionsPreviewColumnBusyVeil } from "./TransactionsDataSkeletons";

const WIDGET_SHELL =
  "bg-[var(--color-bg-secondary)] dark:bg-[var(--color-bg-glass)] dark:backdrop-blur-[var(--glass-blur)] glass-card-inner rounded-[20px] border-none overflow-hidden";

const WIDGET_PLACEHOLDER =
  "min-h-[220px] rounded-[20px] border-2 border-dashed border-[var(--color-border-primary)] bg-[var(--color-bg-tertiary)] p-4 opacity-50 dark:border-[var(--color-border-glass)] dark:bg-[var(--color-bg-glass)] dark:backdrop-blur-[var(--glass-blur)]";

const PREVIEW_WIDGET_ORDER_SEED: StatData[] = [
  { id: "recent", title: "recent", value: "" },
  { id: "upcoming", title: "upcoming", value: "" },
];

const animateLayoutChanges = (
  args: Parameters<typeof defaultAnimateLayoutChanges>[0],
) => {
  if (args.wasDragging) return false;
  return defaultAnimateLayoutChanges(args);
};

function formatShortDate(iso: string) {
  try {
    return format(new Date(iso), "d MMM");
  } catch {
    return "-";
  }
}

function formatAmount(tx: Transaction) {
  const sign = tx.isIncoming ? "+" : "-";
  return `${sign}$${tx.amount.toFixed(2)}`;
}

function PreviewRow({
  tx,
  onSelect,
}: {
  tx: Transaction;
  onSelect?: (tx: Transaction) => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      type="button"
      onClick={() => onSelect?.(tx)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        "flex w-full items-center gap-3 rounded-[var(--radius-md)] px-2 py-2.5 text-left transition-colors duration-200",
        hovered ? "bg-white/[0.05]" : "bg-transparent",
      )}
    >
      <div
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-white/[0.04]",
          tx.isIncoming
            ? "text-[var(--color-success)]"
            : "text-[var(--color-error)]",
        )}
      >
        {tx.isIncoming ? (
          <ArrowDownLeft className="h-4 w-4" strokeWidth={2} aria-hidden />
        ) : (
          <ArrowUpRight className="h-4 w-4" strokeWidth={2} aria-hidden />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold text-[var(--color-text-primary)] sm:text-[14px]">
          {tx.name}
        </p>
        <p className="mt-0.5 text-[11px] text-[var(--color-text-muted)] sm:text-[12px]">
          {formatShortDate(tx.date)}
        </p>
      </div>
      <span
        className={cn(
          "shrink-0 text-[13px] font-semibold tabular-nums sm:text-[14px]",
          tx.isIncoming
            ? "text-[var(--color-success)]"
            : "text-[var(--color-text-primary)]",
        )}
      >
        {formatAmount(tx)}
      </span>
    </button>
  );
}

function PreviewColumnBody({
  title,
  items,
  emptyLabel,
  onSelect,
  showDragHandle = false,
}: {
  title: string;
  items: Transaction[];
  emptyLabel: string;
  onSelect?: (tx: Transaction) => void;
  showDragHandle?: boolean;
}) {
  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="min-w-0 text-[15px] font-semibold text-[var(--color-text-primary)] sm:text-[16px]">
          {title}
        </h3>
        {showDragHandle && (
          <div
            className="shrink-0 text-[var(--color-text-muted)]/50"
            aria-hidden
          >
            <GripVertical className="h-4 w-4" />
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-0.5">
        {items.length > 0 ? (
          items.map((tx) => (
            <PreviewRow key={tx.id} tx={tx} onSelect={onSelect} />
          ))
        ) : (
          <p className="py-6 text-center text-[12px] text-[var(--color-text-muted)]">
            {emptyLabel}
          </p>
        )}
      </div>
    </>
  );
}

function SortablePreviewColumn({
  id,
  title,
  items,
  emptyLabel,
  onSelect,
  isDataLoading = false,
}: {
  id: string;
  title: string;
  items: Transaction[];
  emptyLabel: string;
  onSelect?: (tx: Transaction) => void;
  isDataLoading?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id,
    animateLayoutChanges,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  if (isDragging) {
    return <div ref={setNodeRef} style={style} className={WIDGET_PLACEHOLDER} />;
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        WIDGET_SHELL,
        "relative flex min-h-[220px] cursor-grab flex-col p-4 active:cursor-grabbing sm:p-5",
      )}
    >
      <div className={cn(isDataLoading && "invisible")} aria-hidden={isDataLoading}>
        <PreviewColumnBody
          title={title}
          items={items}
          emptyLabel={emptyLabel}
          onSelect={onSelect}
          showDragHandle
        />
      </div>
      {isDataLoading ? (
        <TransactionsPreviewColumnBusyVeil title={title} rowCount={items.length} />
      ) : null}
    </div>
  );
}

interface TransactionsPreviewWidgetsProps {
  transactions: Transaction[];
  onTransactionSelect?: (tx: Transaction) => void;
  isDataLoading?: boolean;
}

export function TransactionsPreviewWidgets({
  transactions,
  onTransactionSelect,
  isDataLoading = false,
}: TransactionsPreviewWidgetsProps) {
  const t = useTranslations("Transactions");
  const { recent, upcoming } = useTransactionsPreview(transactions);
  const sensors = useDragSensors();

  const { stats: widgetOrder, activeId, handleDragStart, handleDragEnd, handleDragCancel } =
    useStatsOrder({
      storageKey: "transactions-preview-widgets",
      initialStats: PREVIEW_WIDGET_ORDER_SEED,
    });

  const widgetConfig = useMemo(
    () => ({
      recent: {
        title: t("recentTransactions"),
        items: recent,
        emptyLabel: t("noRecentTransactions"),
      },
      upcoming: {
        title: t("upcomingTransactions"),
        items: upcoming,
        emptyLabel: t("noUpcomingTransactions"),
      },
    }),
    [t, recent, upcoming],
  );

  const itemIds = useMemo(() => widgetOrder.map((w) => w.id), [widgetOrder]);

  const activeWidgetId =
    activeId === "recent" || activeId === "upcoming" ? activeId : null;

  return (
    <div className="relative">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <SortableContext items={itemIds} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
            {widgetOrder.map((widget) => {
              const config =
                widget.id === "recent"
                  ? widgetConfig.recent
                  : widgetConfig.upcoming;
              return (
                <SortablePreviewColumn
                  key={widget.id}
                  id={widget.id}
                  title={config.title}
                  items={config.items}
                  emptyLabel={config.emptyLabel}
                  onSelect={onTransactionSelect}
                  isDataLoading={isDataLoading}
                />
              );
            })}
          </div>
        </SortableContext>

        {typeof document !== "undefined" &&
          createPortal(
            <DragOverlay dropAnimation={null} zIndex={9999}>
              {activeWidgetId ? (
                <div
                  className={cn(
                    WIDGET_SHELL,
                    "flex min-h-[220px] scale-[1.02] flex-col p-4 shadow-md sm:p-5",
                  )}
                >
                  <PreviewColumnBody
                    title={widgetConfig[activeWidgetId].title}
                    items={widgetConfig[activeWidgetId].items}
                    emptyLabel={widgetConfig[activeWidgetId].emptyLabel}
                    onSelect={onTransactionSelect}
                    showDragHandle
                  />
                </div>
              ) : null}
            </DragOverlay>,
            document.body,
          )}
      </DndContext>
    </div>
  );
}
