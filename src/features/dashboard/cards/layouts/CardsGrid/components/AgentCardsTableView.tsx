"use client";

import { useMemo, useState } from "react";
import { Search, X, GripVertical } from "lucide-react";
import {
  DndContext,
  DragEndEvent,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ColumnFiltersState } from "@tanstack/react-table";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Pagination } from "@/components/ui/pagination";
import { cn } from "@/lib/utils";
import type { Card as CardType } from "../../../shared";
import { CardStatusBadge } from "../../../components/CardListItem/components";

const COL_WIDTHS = {
  name: 22,
  balance: 18,
  dailyLimit: 18,
  status: 16,
  transactions: 18,
  drag: 8,
} as const;

const COL_TOTAL = Object.values(COL_WIDTHS).reduce((s, w) => s + w, 0);

function ColGroup() {
  return (
    <colgroup>
      {(Object.keys(COL_WIDTHS) as (keyof typeof COL_WIDTHS)[]).map((id) => (
        <col
          key={id}
          style={{ width: `${((COL_WIDTHS[id] / COL_TOTAL) * 100).toFixed(1)}%` }}
        />
      ))}
    </colgroup>
  );
}

function AgentCardsSearchAndFilters({
  globalFilter,
  setGlobalFilter,
  columnFilters,
  setColumnFilters,
  clearAllFilters,
}: {
  globalFilter: string;
  setGlobalFilter: (value: string) => void;
  columnFilters: ColumnFiltersState;
  setColumnFilters: (filters: ColumnFiltersState) => void;
  clearAllFilters: () => void;
}) {
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);

  const quickFilters = [
    { label: "Active", key: "active", filter: "active" },
    { label: "Frozen", key: "frozen", filter: "frozen" },
  ];

  const toggleFilter = (filter: { key: string; filter: string }) => {
    const currentFilter = columnFilters.find((f) => f.id === "status")?.value as
      | string
      | undefined;
    const newFilter = currentFilter === filter.filter ? undefined : filter.filter;

    setColumnFilters([
      ...columnFilters.filter((f) => f.id !== "status"),
      ...(newFilter ? [{ id: "status", value: newFilter }] : []),
    ]);
  };

  const isFilterActive = (filter: { key: string; filter: string }) => {
    const currentFilter = columnFilters.find((f) => f.id === "status")?.value as
      | string
      | undefined;
    return currentFilter === filter.filter;
  };

  const showClear = Boolean(globalFilter || columnFilters.length > 0);

  return (
    <div className="space-y-4 [overflow-anchor:none] lg:space-y-5 pl-3 pt-0">
      <div className="grid grid-cols-1 gap-y-3 lg:grid-cols-[auto_1fr] lg:gap-x-3 lg:gap-y-4 lg:items-start">
        <span className="block text-sm font-medium text-white/70 lg:col-start-1 lg:row-start-1">
          Quick filters
        </span>

        <div className="relative flex min-h-[40px] flex-wrap items-center justify-between gap-3 lg:col-span-2 lg:col-start-1 lg:row-start-2">
          <div
            className={cn(
              "flex flex-wrap items-center gap-1.5 lg:gap-2",
              isSearchExpanded ? "hidden sm:flex" : "flex",
            )}
          >
            {quickFilters.map((filter) => (
              <Badge
                key={filter.key}
                variant="plain"
                className={cn(
                  "cursor-pointer px-3 text-xs backdrop-blur-none transition-all duration-200 lg:text-sm",
                  isFilterActive(filter)
                    ? "border-transparent bg-[var(--filter-active-bg)] text-[var(--filter-active-text)] hover:bg-[var(--filter-active-bg-hover)]"
                    : "border-[var(--filter-border)] bg-[var(--filter-bg)] text-[var(--filter-text)] hover:bg-[var(--filter-hover-bg)] hover:text-[var(--filter-hover-text)]",
                )}
                style={{ height: "32px" }}
                onClick={() => toggleFilter(filter)}
              >
                {filter.label}
              </Badge>
            ))}
          </div>

          <div
            className={cn(
              "ml-auto flex items-center gap-2",
              isSearchExpanded ? "w-full sm:w-auto" : "w-auto",
            )}
          >
            {isSearchExpanded && (
              <div className="relative flex w-full items-center gap-2 sm:hidden">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]" />
                  <input
                    autoFocus
                    type="text"
                    placeholder="Search..."
                    value={globalFilter ?? ""}
                    onChange={(e) => setGlobalFilter(e.target.value)}
                    className="h-9 w-full rounded-[var(--radius-sm)] border border-transparent bg-[var(--color-bg-input)] pl-10 pr-4 text-sm text-[var(--color-text-primary)] backdrop-blur-none placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-border-input-focus)] focus:outline-none"
                  />
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setIsSearchExpanded(false);
                    setGlobalFilter("");
                  }}
                  className="px-2"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}

            <div
              className={cn(
                "flex items-center gap-2",
                isSearchExpanded ? "hidden sm:flex" : "flex",
              )}
            >
              <div className="flex h-8 shrink-0 items-center justify-end">
                <button
                  type="button"
                  tabIndex={showClear ? 0 : -1}
                  aria-hidden={!showClear}
                  onClick={() => {
                    if (showClear) clearAllFilters();
                  }}
                  className={cn(
                    "flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--filter-border)] bg-[var(--filter-bg)] px-3 py-1.5 text-sm text-[var(--filter-text)] backdrop-blur-none transition-all duration-200 hover:bg-[var(--filter-hover-bg)] hover:text-[var(--filter-hover-text)]",
                    !showClear && "pointer-events-none invisible",
                  )}
                  style={{ height: "32px" }}
                >
                  <span className="hidden sm:inline">Clear all</span>
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex h-8 w-auto items-center justify-end sm:hidden">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsSearchExpanded(true)}
                  className="h-8 w-8 text-[var(--color-text-muted)]"
                >
                  <Search className="h-5 w-5" />
                </Button>
              </div>

              <div className="relative hidden sm:block sm:w-36 lg:w-48 xl:w-56">
                <Search className="absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]" />
                <input
                  type="text"
                  placeholder="Search..."
                  value={globalFilter ?? ""}
                  onChange={(e) => setGlobalFilter(e.target.value)}
                  className="h-8 w-full rounded-[var(--radius-sm)] border border-transparent bg-[var(--color-bg-input)] pl-10 pr-4 text-sm text-[var(--color-text-primary)] backdrop-blur-none placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-border-input-focus)] focus:outline-none"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SortableRow({
  card,
  rowIndex,
  onTransactionsClick,
}: {
  card: CardType;
  rowIndex: number;
  onTransactionsClick?: (card: CardType) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: card.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.8 : 1,
    zIndex: isDragging ? 1000 : 1,
  };

  const zebra =
    rowIndex % 2 === 1
      ? "[&_td]:bg-[rgba(255,255,255,0.04)] hover:[&_td]:!bg-[color-mix(in_srgb,white_1%,rgba(255,255,255,0.04))]"
      : "[&_td]:bg-[rgba(255,255,255,0.02)] hover:[&_td]:!bg-[color-mix(in_srgb,white_1%,rgba(255,255,255,0.02))]";

  return (
    <TableRow
      ref={setNodeRef}
      style={style}
      noHover
      className={cn(
        "!border-b-0 !bg-transparent even:!bg-transparent",
        "[&_td]:transition-colors [&_td]:duration-150",
        zebra,
      )}
    >
      <TableCell className="whitespace-nowrap px-4 py-[11px] align-middle text-[var(--color-text-primary)]">
        {card.cardType}
      </TableCell>
      <TableCell className="whitespace-nowrap px-4 py-[11px] align-middle tabular-nums text-white/70">
        ${card.balance.toLocaleString()} USD
      </TableCell>
      <TableCell className="whitespace-nowrap px-4 py-[11px] align-middle tabular-nums text-white/70">
        ${card.dailyLimit?.toLocaleString() ?? 500} USD
      </TableCell>
      <TableCell className="whitespace-nowrap px-4 py-[11px] pl-6 align-middle">
        <CardStatusBadge card={card} />
      </TableCell>
      <TableCell className="whitespace-nowrap px-4 py-[11px] align-middle">
        <button
          type="button"
          onClick={() => onTransactionsClick?.(card)}
          className="text-sm text-white/70 transition-colors hover:text-white"
        >
          View
        </button>
      </TableCell>
      <TableCell className="w-12 whitespace-nowrap px-4 py-[11px] align-middle">
        <div
          className="flex cursor-grab items-center justify-end text-[var(--color-text-muted)]/50 active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </div>
      </TableCell>
    </TableRow>
  );
}

export interface AgentCardsTableViewProps {
  cards: CardType[];
  onTransactionsClick?: (card: CardType) => void;
  onReorder?: (cards: CardType[]) => void;
}

export function AgentCardsTableView({
  cards,
  onTransactionsClick,
  onReorder,
}: AgentCardsTableViewProps) {
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [globalFilter, setGlobalFilter] = useState("");
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  const filteredCards = useMemo(() => {
    let filtered = cards;

    if (globalFilter.trim()) {
      filtered = filtered.filter((card) =>
        card.cardType.toLowerCase().includes(globalFilter.toLowerCase()),
      );
    }

    const statusFilter = columnFilters.find((f) => f.id === "status")?.value as
      | string
      | undefined;
    if (statusFilter === "active") {
      filtered = filtered.filter((card) => card.isActive && !card.isLocked);
    } else if (statusFilter === "frozen") {
      filtered = filtered.filter((card) => card.isLocked);
    }

    return filtered;
  }, [cards, globalFilter, columnFilters]);

  const start = (page - 1) * pageSize;
  const current = filteredCards.slice(start, start + pageSize);

  const clearAllFilters = () => {
    setGlobalFilter("");
    setColumnFilters([]);
    setPage(1);
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = filteredCards.findIndex((card) => card.id === active.id);
    const newIndex = filteredCards.findIndex((card) => card.id === over.id);
    onReorder?.(arrayMove(filteredCards, oldIndex, newIndex));
  };

  return (
    <Card
      variant="default"
      size="lg"
      className="overflow-hidden border-none p-3 md:p-6 dark:!bg-[var(--color-bg-secondary)] !backdrop-blur-none dark:!backdrop-blur-none"
    >
      <div className="flex w-full max-w-full flex-col gap-4 [overflow-anchor:none] lg:gap-5">
        <AgentCardsSearchAndFilters
          globalFilter={globalFilter}
          setGlobalFilter={setGlobalFilter}
          columnFilters={columnFilters}
          setColumnFilters={setColumnFilters}
          clearAllFilters={clearAllFilters}
        />

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <div
            className={cn(
              "min-w-0 overflow-x-auto rounded-[var(--radius-table)] border-0 overflow-hidden scrollbar-gutter-stable [overflow-anchor:none]",
            )}
          >
            <table className="w-full caption-bottom table-fixed text-sm">
              <ColGroup />
              <TableHeader className="border-b-0 border-transparent !bg-[rgba(255,255,255,0.04)] dark:border-b-0 [&_tr]:border-b-0">
                <TableRow noHover className="!border-b-0 !bg-transparent hover:!bg-transparent">
                  <TableHead className="!h-auto whitespace-nowrap py-[11px] font-medium hover:bg-transparent">
                    Name
                  </TableHead>
                  <TableHead className="!h-auto whitespace-nowrap py-[11px] font-medium hover:bg-transparent">
                    Balance
                  </TableHead>
                  <TableHead className="!h-auto whitespace-nowrap py-[11px] font-medium hover:bg-transparent">
                    Daily Limit
                  </TableHead>
                  <TableHead className="!h-auto whitespace-nowrap py-[11px] pl-6 font-medium hover:bg-transparent">
                    Status
                  </TableHead>
                  <TableHead className="!h-auto whitespace-nowrap py-[11px] font-medium hover:bg-transparent">
                    Transactions
                  </TableHead>
                  <TableHead className="!h-auto w-12 py-[11px] hover:bg-transparent" />
                </TableRow>
              </TableHeader>
              <TableBody>
                <SortableContext
                  items={current.map((card) => card.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {current.map((card, index) => (
                    <SortableRow
                      key={card.id}
                      card={card}
                      rowIndex={index}
                      onTransactionsClick={onTransactionsClick}
                    />
                  ))}
                </SortableContext>
                {current.length === 0 && (
                  <TableRow noHover className="!border-b-0">
                    <TableCell
                      colSpan={6}
                      className="h-24 text-center text-[var(--color-text-muted)]"
                    >
                      No results found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </table>
          </div>

          <Pagination
            pagination={{
              pageIndex: page - 1,
              pageSize,
              totalItems: filteredCards.length,
            }}
            onPageChange={(pageIndex) => setPage(pageIndex + 1)}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
            pageSizes={[10, 20, 50]}
            showPageNumbers
            visiblePageCount={5}
            itemsLabel="cards"
          />
        </DndContext>
      </div>
    </Card>
  );
}
