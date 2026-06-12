"use client";

import * as React from "react";
import { Check, ChevronDown, ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  WALLET_GLASS_MENU_CONTENT,
  walletGlassMenuItemRowSpacing,
} from "@/lib/walletGlassMenu";

/**
 * Hook to get responsive visible page count
 */
function useResponsivePageCount(
  desktopCount: number,
  mobileCount: number = 3
): number {
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640);
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  return isMobile ? mobileCount : desktopCount;
}

/* -------------------------------------------------------------------------------------------------
 * Pagination Types
 * -----------------------------------------------------------------------------------------------*/

export interface PaginationInfo {
 /** Current page index (0-based) */
  pageIndex: number;
 /** Number of items per page */
  pageSize: number;
 /** Total number of items */
  totalItems: number;
}

export interface PaginationProps {
 /** Current pagination state */
  pagination: PaginationInfo;
 /** Callback when page changes */
  onPageChange: (pageIndex: number) => void;
 /** Callback when page size changes */
  onPageSizeChange?: (pageSize: number) => void;
 /** Available page sizes */
  pageSizes?: number[];
 /** Label for "Showing" text */
  showingLabel?: string;
 /** Label for "to" text */
  toLabel?: string;
 /** Label for "of" text */
  ofLabel?: string;
 /** Label for items (e.g., "items", "transactions") */
  itemsLabel?: string;
 /** Label for previous button */
  previousLabel?: string;
 /** Label for next button */
  nextLabel?: string;
 /** Additional class name */
  className?: string;
 /** Show items count info */
  showItemsInfo?: boolean;
 /** Show page numbers */
  showPageNumbers?: boolean;
 /** Number of visible page numbers */
  visiblePageCount?: number;
 /** Page-size dropdown: Radix `side` (e.g. top when trigger sits near the bottom of a modal). */
  pageSizeMenuSide?: "top" | "right" | "bottom" | "left";
}

/* -------------------------------------------------------------------------------------------------
 * Pagination Helper Functions
 * -----------------------------------------------------------------------------------------------*/

/**
 * Calculate the total number of pages
 */
export function getTotalPages(totalItems: number, pageSize: number): number {
  return Math.ceil(totalItems / pageSize);
}

/**
 * Check if there's a previous page
 */
export function canGoPrevious(pageIndex: number): boolean {
  return pageIndex > 0;
}

/**
 * Check if there's a next page
 */
export function canGoNext(
  pageIndex: number,
  totalItems: number,
  pageSize: number
): boolean {
  return pageIndex < getTotalPages(totalItems, pageSize) - 1;
}

/**
 * Get the range of items being shown
 */
export function getItemsRange(
  pageIndex: number,
  pageSize: number,
  totalItems: number
): { from: number; to: number } {
  const from = pageIndex * pageSize + 1;
  const to = Math.min((pageIndex + 1) * pageSize, totalItems);
  return { from, to };
}

/**
 * Generate array of page numbers to display
 */
export function getPageNumbers(
  currentPage: number,
  totalPages: number,
  visibleCount: number = 5
): (number | "ellipsis")[] {
  if (totalPages <= visibleCount) {
    return Array.from({ length: totalPages }, (_, i) => i);
  }

  const pages: (number | "ellipsis")[] = [];
  const halfVisible = Math.floor(visibleCount / 2);

  let start = Math.max(0, currentPage - halfVisible);
  let end = Math.min(totalPages - 1, currentPage + halfVisible);

 // Adjust if we're near the beginning
  if (currentPage < halfVisible) {
    end = Math.min(visibleCount - 1, totalPages - 1);
  }

 // Adjust if we're near the end
  if (currentPage > totalPages - halfVisible - 1) {
    start = Math.max(0, totalPages - visibleCount);
  }

 // Add first page and ellipsis if needed
  if (start > 0) {
    pages.push(0);
    if (start > 1) {
      pages.push("ellipsis");
    }
  }

 // Add visible pages
  for (let i = start; i <= end; i++) {
    if (!pages.includes(i)) {
      pages.push(i);
    }
  }

 // Add ellipsis and last page if needed
  if (end < totalPages - 1) {
    if (end < totalPages - 2) {
      pages.push("ellipsis");
    }
    if (!pages.includes(totalPages - 1)) {
      pages.push(totalPages - 1);
    }
  }

  return pages;
}

function PageSizeDropdownContent({
  sizeOptions,
  pageSize,
  onPageSizeChange,
  side = "bottom",
}: {
  sizeOptions: number[];
  pageSize: number;
  onPageSizeChange: (n: number) => void;
  side?: "top" | "right" | "bottom" | "left";
}) {
  return (
    <DropdownMenuContent
      align="end"
      side={side}
      sideOffset={6}
 /* Base DropdownMenuContent uses min-w-[8rem] + p-1; override so shell matches WALLET only and panel hugs text. */
      className={cn(WALLET_GLASS_MENU_CONTENT, "!w-max !min-w-0 !p-0.5 !max-w-none")}
      style={{ minWidth: 0, width: "max-content" }}
    >
      <div className="flex w-fit min-w-0 max-w-[min(100dvw,100vw)] flex-col content-start">
        {sizeOptions.map((n, index) => {
          const selected = n === pageSize;
          return (
            <DropdownMenuItem
              key={n}
              textValue={`${n} per page`}
              onSelect={() => onPageSizeChange(n)}
              className={cn(
                "!flex min-w-0 max-w-full flex-nowrap cursor-pointer items-center justify-start gap-1 rounded-[var(--radius-sm)] !px-1.5 !py-1.5 text-[11px] font-semibold outline-none sm:text-xs",
                "mx-1",
                walletGlassMenuItemRowSpacing(index, sizeOptions.length),
                selected
                  ? "bg-[var(--color-primary)] text-white hover:!bg-[var(--color-primary)] hover:!text-white focus:!bg-[var(--color-primary)] focus:!text-white dark:hover:!bg-[var(--color-primary)] dark:focus:!bg-[var(--color-primary)] dark:focus:!text-white data-[highlighted]:!bg-[var(--color-primary)] data-[highlighted]:!text-white"
                  : "text-[var(--color-text-primary)] hover:!bg-white/[0.055] hover:!text-white focus:!bg-white/[0.055] focus:!text-white dark:hover:!bg-white/[0.055] dark:focus:!bg-white/[0.055] data-[highlighted]:!bg-white/[0.055] data-[highlighted]:!text-white"
              )}
            >
              <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                {selected ? <Check className="h-3 w-3" strokeWidth={2.5} aria-hidden /> : null}
              </span>
              <span className="shrink-0 text-left tabular-nums">
                {n} per page
              </span>
            </DropdownMenuItem>
          );
        })}
      </div>
    </DropdownMenuContent>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Pagination Component
 * -----------------------------------------------------------------------------------------------*/

/**
 * Pagination - A reusable pagination component
 *
 * Features:
 * - Previous/Next navigation
 * - Items count display
 * - Optional page numbers
 * - Customizable labels for i18n
 * - Responsive design
 */
const DEFAULT_PAGE_SIZES = [10, 20, 50, 100] as const;

/** Layout + radius shared by page-size trigger and prev/next. */
const paginationControlLayout =
  "flex items-center gap-1 rounded-[10px] !border-transparent";

export function Pagination({
  pagination,
  onPageChange,
  onPageSizeChange,
  pageSizes,
  showingLabel = "Showing",
  toLabel = "to",
  ofLabel = "of",
  itemsLabel = "items",
  previousLabel = "Previous",
  nextLabel = "Next",
  className,
  showItemsInfo = true,
  showPageNumbers = false,
  visiblePageCount = 5,
  pageSizeMenuSide = "bottom",
}: PaginationProps) {
  const { pageIndex, pageSize, totalItems } = pagination;
  const totalPages = getTotalPages(totalItems, pageSize);
  const { from, to } = getItemsRange(pageIndex, pageSize, totalItems);

 // Use responsive page count - 3 on mobile, visiblePageCount on desktop
  const responsivePageCount = useResponsivePageCount(visiblePageCount, 3);
  const hasPrevious = canGoPrevious(pageIndex);
  const hasNext = canGoNext(pageIndex, totalItems, pageSize);

  const handlePrevious = () => {
    if (hasPrevious) {
      onPageChange(pageIndex - 1);
    }
  };

  const handleNext = () => {
    if (hasNext) {
      onPageChange(pageIndex + 1);
    }
  };

  const pageNumbers = showPageNumbers
    ? getPageNumbers(pageIndex, totalPages, responsivePageCount)
    : [];

  const sizeOptions =
    pageSizes && pageSizes.length > 0 ? pageSizes : [...DEFAULT_PAGE_SIZES];

  return (
    <div
      className={cn(
        "flex w-full flex-col md:flex-row items-end md:items-center justify-between gap-2 py-0",
        "min-[768px]:max-[959px]:justify-end",
        className
      )}
    >
      {/* Items info — hidden in md1 only (768–959) */}
      {showItemsInfo && (
        <div className="text-sm text-[var(--color-text-muted)] max-md:block min-[768px]:max-[959px]:hidden min-[960px]:block min-[960px]:text-left text-right">
          {showingLabel} {from} {toLabel} {to} {ofLabel} {totalItems}{" "}
          {itemsLabel}
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center space-x-1 sm:space-x-2">
        {onPageSizeChange ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="glassSm"
                size="sm"
                className={cn(paginationControlLayout, "gap-1 px-2.5 tabular-nums sm:px-3")}
                aria-label={`${pageSize} per page`}
              >
                <span className="whitespace-nowrap tabular-nums">{pageSize}</span>
                <ChevronDown className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <PageSizeDropdownContent
              sizeOptions={sizeOptions}
              pageSize={pageSize}
              onPageSizeChange={onPageSizeChange}
              side={pageSizeMenuSide}
            />
          </DropdownMenu>
        ) : null}

        {/* Previous Button */}
        <Button
          variant="glassSm"
          size="sm"
          onClick={handlePrevious}
          disabled={!hasPrevious}
          className={paginationControlLayout}
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="hidden lg:inline">{previousLabel}</span>
        </Button>

        {/* Page numbers: fixed min height so nav row height does not jump when page count is 0 vs 1+ */}
        {showPageNumbers && (
          <div className="flex min-h-8 items-center space-x-1">
            {pageNumbers.length > 0
              ? pageNumbers.map((page, index) =>
                page === "ellipsis" ? (
                  <span
                    key={`ellipsis-${index}`}
                    className="flex h-8 w-8 items-center justify-center"
                  >
                    <MoreHorizontal className="h-4 w-4 text-[var(--color-text-muted)]" />
                  </span>
                ) : page === pageIndex ? (
                  <Button
                    key={page}
                    variant="ghost"
                    size="sm"
                    onClick={() => onPageChange(page)}
                    className={cn(
                      "h-8 w-8 border-0 p-0 text-xs font-semibold tabular-nums shadow-none transition-[background-color,color,opacity] duration-200",
                      "rounded-[10px]",
                      "!bg-white/[0.04] !text-[var(--color-primary)] hover:!bg-[var(--color-bg-hover)] hover:!text-[var(--color-primary)]",
                    )}
                  >
                    {page + 1}
                  </Button>
                ) : (
                  <button
                    key={page}
                    type="button"
                    onClick={() => onPageChange(page)}
                    className={cn(
                      "inline-flex h-8 min-w-8 items-center justify-center rounded-[10px] border-0 bg-transparent p-0",
                      "text-xs font-medium tabular-nums text-[var(--color-text-muted)]",
                      "transition-colors duration-200 hover:bg-white/[0.06] hover:text-[var(--color-text-primary)]",
                    )}
                  >
                    {page + 1}
                  </button>
                )
              )
              : null}
          </div>
        )}

        {/* Next Button */}
        <Button
          variant="glassSm"
          size="sm"
          onClick={handleNext}
          disabled={!hasNext}
          className={paginationControlLayout}
        >
          <span className="hidden lg:inline">{nextLabel}</span>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Simple Pagination (minimal version)
 * -----------------------------------------------------------------------------------------------*/

export interface SimplePaginationProps {
 /** Whether there's a previous page */
  canPrevious: boolean;
 /** Whether there's a next page */
  canNext: boolean;
 /** Callback for previous page */
  onPrevious: () => void;
 /** Callback for next page */
  onNext: () => void;
 /** Label for previous button */
  previousLabel?: string;
 /** Label for next button */
  nextLabel?: string;
 /** Additional class name */
  className?: string;
}

/**
 * SimplePagination - A minimal pagination with just prev/next buttons
 */
export function SimplePagination({
  canPrevious,
  canNext,
  onPrevious,
  onNext,
  previousLabel = "Previous",
  nextLabel = "Next",
  className,
}: SimplePaginationProps) {
  return (
    <div className={cn("flex items-center space-x-2", className)}>
      <Button
        variant="outline"
        size="sm"
        onClick={onPrevious}
        disabled={!canPrevious}
        className="flex items-center gap-1"
      >
        <ChevronLeft className="h-4 w-4" />
        <span className="hidden lg:inline">{previousLabel}</span>
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={onNext}
        disabled={!canNext}
        className="flex items-center gap-1"
      >
        <span className="hidden lg:inline">{nextLabel}</span>
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

export default Pagination;
