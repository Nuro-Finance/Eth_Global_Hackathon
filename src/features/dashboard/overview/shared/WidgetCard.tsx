"use client";

import { type HTMLAttributes, type Ref, type ReactNode } from "react";
import { IconChevronDown } from "@tabler/icons-react";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { SampleDataLabel } from "../components/SampleDataLabel";

export interface WidgetHeaderAction {
  type: "link" | "dropdown";
  label: ReactNode;
  onClick?: () => void;
 /** When `type === "link"`, merged classes for the control (e.g. icon hit-area + hover fill). */
  linkClassName?: string;
}

export interface WidgetHeaderProps {
 /** Widget title - can be string or JSX element */
  title: ReactNode;
 /** Optional subtitle text */
  subtitle?: ReactNode;
 /** Optional status element (e.g. Live / Stale) */
  status?: ReactNode;
 /** Header action configuration */
  action?: WidgetHeaderAction;
 /** Extra control in the header action column (e.g. search under Export). */
  headerAside?: ReactNode;
 /** Apply to the header title column only (e.g. drag activator ref + listeners) */
  headerTitleRef?: Ref<HTMLDivElement>;
  headerTitleProps?: HTMLAttributes<HTMLDivElement>;
  dragHandleRef?: Ref<HTMLDivElement>;
  dragHandleProps?: HTMLAttributes<HTMLDivElement>;
  isDraggable?: boolean;
  sampleDataLabel?: boolean;
}

export interface WidgetCardProps {
 /** Widget title */
  title: ReactNode;
 /** Optional subtitle text */
  subtitle?: ReactNode;
 /** Optional status element (e.g. Live / Stale) */
  status?: ReactNode;
 /** Header action configuration */
  action?: WidgetHeaderAction;
 /** Extra control in the header action column (e.g. search under Export). */
  headerAside?: ReactNode;
 /** Widget content */
  children: ReactNode;
 /** Additional class names */
  className?: string;
 /** Content wrapper class names */
  contentClassName?: string;
 /** Whether to use full height */
  fullHeight?: boolean;
 /** When true, content area scrolls with fade at top/bottom (no hard line) */
  scrollFade?: boolean;
 /** Omit title row + actions; keeps top spacing + optional drag slot via `headerTitleRef` / `headerTitleProps` */
  hideHeader?: boolean;
 /** With `hideHeader`: drag handle overlays the top edge instead of reserving vertical space */
  headerDragOverlay?: boolean;
  headerTitleRef?: Ref<HTMLDivElement>;
  headerTitleProps?: HTMLAttributes<HTMLDivElement>;
  dragHandleRef?: Ref<HTMLDivElement>;
  dragHandleProps?: HTMLAttributes<HTMLDivElement>;
  isDraggable?: boolean;
 /** When true, renders the primary blue burst glow inside this card's clipping boundary */
  showBurst?: boolean;
 /** When true, shows a Sample data tag beside the widget title while design sample data is active */
  sampleDataLabel?: boolean;
 /** Skip default content padding (`px-4 sm:px-6 py-4 sm:py-5`) */
  flushContent?: boolean;
}

/**
 * Shared widget card component for overview dashboard widgets
 * Provides consistent styling and header patterns across widgets
 */
export function WidgetCard({
  title,
  subtitle,
  status,
  action,
  headerAside,
  children,
  className = "",
  contentClassName = "",
  fullHeight = true,
  scrollFade = false,
  hideHeader = false,
  headerDragOverlay = false,
  headerTitleRef,
  headerTitleProps,
  dragHandleRef,
  dragHandleProps,
  isDraggable = false,
  showBurst = false,
  sampleDataLabel = false,
  flushContent = false,
}: WidgetCardProps) {
  const { className: headerTitleClassName, ...headerTitleRest } = headerTitleProps ?? {};

  return (
    <div
      className={cn(
        "relative overflow-hidden bg-[var(--color-bg-card)] dark:bg-[var(--color-bg-card)] dark:backdrop-blur-[var(--widget-blur)] glass-card-inner rounded-[var(--radius-card)] sm:rounded-[var(--radius-xl)]",
        fullHeight && "h-full",
        className,
      )}
    >
      {showBurst && (
        <div
          aria-hidden
          className="pointer-events-none absolute -left-8 -top-8 z-0 h-[380px] w-[380px] rounded-full bg-[#0D90FF] opacity-[0.10] blur-[80px]"
        />
      )}
      <div
        className={cn(
          !flushContent && "px-4 sm:px-6 py-4 sm:py-5",
          fullHeight && "flex min-h-0 h-full flex-col",
          hideHeader && headerDragOverlay && "relative",
          scrollFade ? "" : contentClassName,
        )}
      >
        {hideHeader ? (
          <div
            ref={dragHandleRef ?? headerTitleRef}
            {...(dragHandleProps ?? headerTitleRest)}
            className={cn(
              headerDragOverlay
                ? "pointer-events-auto absolute inset-x-0 top-0 z-30 mx-auto min-h-10 max-h-11 sm:max-h-12"
                : "mb-4 min-h-10 shrink-0 sm:mb-5 sm:min-h-11",
              headerTitleClassName,
              (dragHandleRef || headerTitleRef) && "cursor-grab active:cursor-grabbing touch-none"
            )}
            aria-label="Drag to reorder"
          />
        ) : (
          <WidgetHeader
            title={title}
            subtitle={subtitle}
            status={status}
            action={action}
            headerAside={headerAside}
            headerTitleRef={headerTitleRef}
            headerTitleProps={headerTitleProps}
            dragHandleRef={dragHandleRef}
            dragHandleProps={dragHandleProps}
            isDraggable={isDraggable}
            sampleDataLabel={sampleDataLabel}
          />
        )}

        {scrollFade ? (
          <div className={`scroll-fade-mask flex-1 min-h-0 overflow-y-auto ${contentClassName}`}>
            {children}
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}



/** Vertical gap between widget header title (`h3`) and subtitle (`p`). Reuse anywhere that should mirror that rhythm. */
export const WIDGET_HEADER_TITLE_SUBTITLE_GAP_CLASS = "mt-0.5";

/**
 * Widget header with title and optional action
 */
export function WidgetHeader({
  title,
  subtitle,
  status,
  action,
  headerAside,
  headerTitleRef,
  headerTitleProps,
  dragHandleRef,
  dragHandleProps,
  isDraggable = false,
  sampleDataLabel = false,
}: WidgetHeaderProps) {
  const { className: headerTitleClassName, ...headerTitleRest } = headerTitleProps ?? {};
  const hasHeaderTopRow = Boolean(action || status || isDraggable);
  const titleRowControls = Boolean(headerAside && !hasHeaderTopRow);

  const titleHeading = (
    <h3 className="inline-flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[var(--color-text-primary)] text-[16px] font-normal leading-none sm:text-[18px]">
      {title}
      {sampleDataLabel ? <SampleDataLabel /> : null}
    </h3>
  );

  if (titleRowControls) {
    return (
      <div className="mb-4 sm:mb-5">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5">
          <div
            ref={headerTitleRef}
            className={cn("col-start-1 row-start-1 min-w-0", headerTitleClassName)}
            {...headerTitleRest}
          >
            {titleHeading}
          </div>
          {subtitle ? (
            <p
              className={cn(
                "col-start-1 row-start-2",
                WIDGET_HEADER_TITLE_SUBTITLE_GAP_CLASS,
                "text-[11px] font-normal leading-snug text-[var(--color-text-muted)] sm:text-[13px] line-clamp-2",
              )}
            >
              {subtitle}
            </p>
          ) : null}
          <div
            className={cn(
              "col-start-2 row-start-1 flex shrink-0 items-center justify-end gap-2 self-end",
              subtitle ? "row-span-2" : "row-span-1",
            )}
          >
            {headerAside}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-4 flex items-start justify-between gap-3 sm:mb-5">
      <div ref={headerTitleRef} className={cn("min-w-0 flex-1", headerTitleClassName)} {...headerTitleRest}>
        <h3 className="inline-flex min-w-0 max-w-full flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[var(--color-text-primary)] text-[16px] font-normal sm:text-[18px]">
          {title}
          {sampleDataLabel ? <SampleDataLabel /> : null}
        </h3>
        {subtitle && (
          <p
            className={cn(
              WIDGET_HEADER_TITLE_SUBTITLE_GAP_CLASS,
              "text-[11px] font-normal leading-snug text-[var(--color-text-muted)] sm:text-[13px] line-clamp-2",
            )}
          >
            {subtitle}
          </p>
        )}
      </div>

      {(action || status || isDraggable || headerAside) && (
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {(action || status || isDraggable) && (
            <div className="flex items-start gap-2">
              {status}
              {isDraggable && (
                <div
                  ref={dragHandleRef}
                  {...dragHandleProps}
                  className={cn(
                    "flex h-5 w-5 items-center justify-center text-[var(--color-text-muted)]/40 cursor-grab active:cursor-grabbing touch-none",
                    dragHandleProps?.className
                  )}
                >
                  <GripVertical className="h-3.5 w-3.5" />
                </div>
              )}
              {action && (
                <>
                  {action.type === "link" ? (
                    <span
                      className={cn(
                        "text-[12px] sm:text-[13px] font-normal cursor-pointer",
                        action.linkClassName ??
                          "text-[var(--color-primary)] hover:opacity-80 transition-opacity"
                      )}
                      onClick={action.onClick}
                    >
                      {action.linkClassName ? (
                        action.label
                      ) : (
                        <span className="inline-flex min-h-0 items-center justify-center leading-none">
                          {action.label}
                        </span>
                      )}
                    </span>
                  ) : (
                    <button
                      className="flex items-center gap-1 sm:gap-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
                      onClick={action.onClick}
                    >
                      <span className="text-[11px] sm:text-[13px] font-normal">
                        {action.label}
                      </span>
                      <IconChevronDown size={12} stroke={2} />
                    </button>
                  )}
                </>
              )}
            </div>
          )}
          {headerAside}
        </div>
      )}
    </div>
  );
}

export default WidgetCard;
