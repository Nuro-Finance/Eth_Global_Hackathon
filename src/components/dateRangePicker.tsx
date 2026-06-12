"use client";

import * as React from "react";
import { CalendarIcon, ChevronDownIcon, ArrowRightIcon } from "lucide-react";
import { DateRange } from "react-day-picker";
import { format, startOfMonth, endOfMonth, subDays, subMonths } from "date-fns";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface DateRangePickerProps {
  className?: string;
  date?: DateRange;
  onDateChange?: (date: DateRange | undefined) => void;
  placeholder?: string;
  size?: "small" | "medium" | "default";
  translations?: {
 // Preset options
    custom?: string;
    today?: string;
    yesterday?: string;
    last7Days?: string;
    last28Days?: string;
    last30Days?: string;
    thisMonth?: string;
    lastMonth?: string;

 // UI labels
    quickSelect?: string;
    from?: string;
    to?: string;
    selectDate?: string;
    daysSelected?: string;
    cancel?: string;
    apply?: string;
  };
}

interface PresetOption {
  label: string;
  getValue: () => DateRange;
  isActive?: (range: DateRange | undefined) => boolean;
}

export function DateRangePicker({
  className,
  date,
  onDateChange,
  placeholder = "Pick a date range",
  size = "default",
  translations,
}: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [isMobile, setIsMobile] = React.useState(false);

 // Determine if we should show the simplified interface
  const isSmall = size === "small";
  const isMedium = size === "medium";

 // Default translations
  const t = {
    custom: translations?.custom ?? "Custom",
    today: translations?.today ?? "Today",
    yesterday: translations?.yesterday ?? "Yesterday",
    last7Days: translations?.last7Days ?? "Last 7 days",
    last28Days: translations?.last28Days ?? "Last 28 days",
    last30Days: translations?.last30Days ?? "Last 30 days",
    thisMonth: translations?.thisMonth ?? "This Month",
    lastMonth: translations?.lastMonth ?? "Last Month",
    quickSelect: translations?.quickSelect ?? "Quick Select",
    from: translations?.from ?? "From",
    to: translations?.to ?? "To",
    selectDate: translations?.selectDate ?? "Select date",
    daysSelected: translations?.daysSelected ?? "days selected",
    cancel: translations?.cancel ?? "Cancel",
    apply: translations?.apply ?? "Apply",
  };

 // Check if mobile on mount and resize
  React.useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

 // Default to last 14 days if no date is provided
  const [selectedDate, setSelectedDate] = React.useState<DateRange | undefined>(
    date || {
      from: subDays(new Date(), 13),
      to: new Date(),
    }
  );

  const [activePreset, setActivePreset] = React.useState<string>(t.custom);

  React.useEffect(() => {
    if (date && date !== selectedDate) {
      setSelectedDate(date);
    }
  }, [date, selectedDate]);

  const presetOptions: PresetOption[] = [
    {
      label: t.custom,
      getValue: () => selectedDate || { from: new Date(), to: new Date() },
    },
    {
      label: t.today,
      getValue: () => {
        const today = new Date();
        return { from: today, to: today };
      },
    },
    {
      label: t.yesterday,
      getValue: () => {
        const yesterday = subDays(new Date(), 1);
        return { from: yesterday, to: yesterday };
      },
    },
    {
      label: t.last7Days,
      getValue: () => {
        const today = new Date();
        return { from: subDays(today, 6), to: today };
      },
    },
    {
      label: t.last28Days,
      getValue: () => {
        const today = new Date();
        return { from: subDays(today, 27), to: today };
      },
    },
    {
      label: t.last30Days,
      getValue: () => {
        const today = new Date();
        return { from: subDays(today, 29), to: today };
      },
    },
    {
      label: t.thisMonth,
      getValue: () => {
        const today = new Date();
        return { from: startOfMonth(today), to: endOfMonth(today) };
      },
    },
    {
      label: t.lastMonth,
      getValue: () => {
        const lastMonth = subMonths(new Date(), 1);
        return { from: startOfMonth(lastMonth), to: endOfMonth(lastMonth) };
      },
    },
  ];

  const handleDateSelect = (range: DateRange | undefined) => {
    setSelectedDate(range);
    onDateChange?.(range);
    setActivePreset(t.custom);
  };

  const handlePresetSelect = (preset: PresetOption) => {
    const range = preset.getValue();
    setSelectedDate(range);
    onDateChange?.(range);
    setActivePreset(preset.label);
  };

  const compactDatePattern = isSmall ? "LLL dd" : "LLL dd, y";

  const formatDateRange = (range: DateRange | undefined) => {
    if (!range) return placeholder;
    if (!range.from) return placeholder;
    if (!range.to) return format(range.from, compactDatePattern);
    if (range.from.getTime() === range.to.getTime()) {
      return format(range.from, compactDatePattern);
    }
    return `${format(range.from, compactDatePattern)} - ${format(range.to, compactDatePattern)}`;
  };

  const getDisplayText = () => {
    if (!selectedDate?.from || !selectedDate?.to) return placeholder;

 // Check for preset matches
    for (const preset of presetOptions.slice(1)) {
 // Skip "Custom"
      const presetRange = preset.getValue();
      if (
        presetRange.from &&
        presetRange.to &&
        selectedDate.from.getTime() === presetRange.from.getTime() &&
        selectedDate.to.getTime() === presetRange.to.getTime()
      ) {
        return preset.label;
      }
    }

    return formatDateRange(selectedDate);
  };

  return (
    <div className={cn("grid gap-2", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id="date"
            variant={isSmall ? "glassSm" : "outline"}
            size={isSmall ? "sm" : "default"}
            className={cn(
              "justify-between text-start font-medium transition-[opacity,transform] duration-200",
              !isSmall && [
                "bg-[var(--color-bg-secondary)] dark:bg-[var(--color-bg-secondary)] border-none",
                "text-[var(--color-text-primary)]",
                "focus:ring-2 focus:ring-[var(--color-primary)]/20",
              ],
              isSmall && [
                "rounded-[10px] text-[11px] font-semibold sm:text-xs",
                "data-[state=open]:!bg-white/[0.07] data-[state=open]:!text-white",
              ],
              "px-3",
              isSmall ? "h-8" : "h-10",
              !isSmall && "text-sm",
              !selectedDate && "text-[var(--color-text-muted)]"
            )}
            icon={
              <CalendarIcon
                className={cn("opacity-70", isSmall ? "h-3 w-3" : "h-4 w-4")}
              />
            }
            iconPosition="left"
          >
            <span className="flex-1 text-start truncate">
              {getDisplayText()}
            </span>
            <ChevronDownIcon
              className={cn(
                "opacity-50 ms-2 transition-transform duration-200 group-data-[state=open]:rotate-180",
                isSmall ? "h-3 w-3" : "h-4 w-4"
              )}
            />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className={cn(
            "p-0 bg-white/[0.02] dark:bg-white/[0.02] backdrop-blur-[var(--glass-blur-strong)] dark:border-[var(--color-border-glass-strong)] shadow-2xl rounded-lg overflow-hidden border border-[var(--color-border-primary)]",
            isSmall ? "w-auto" : "w-auto"
          )}
          align="end"
          side="bottom"
          sideOffset={8}
        >
          {isSmall ? (
 // Small size: Just calendar, no presets or header
            <div className="p-2">
              <Calendar
                initialFocus
                mode="range"
                defaultMonth={selectedDate?.from}
                selected={selectedDate}
                onSelect={(range) => {
                  handleDateSelect(range);
                  if (range?.from && range?.to) setOpen(false);
                }}
                showOutsideDays={false}
                numberOfMonths={1}
                className="bg-[var(--color-bg-card)] dark:bg-transparent"
                classNames={{
                  months: "flex flex-col justify-center",
                  month: "space-y-2",
                  caption: "flex justify-center pt-1 relative items-center",
                  caption_label:
                    "text-sm font-semibold text-[var(--color-text-primary)]",
                  nav: "flex items-center justify-center w-full mt-1",
                  nav_button: cn(
                    "h-8 w-8 bg-transparent p-0 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]",
                    "hover:bg-[var(--color-bg-hover)] rounded-md transition-all duration-150"
                  ),
                  table: "w-full border-collapse space-y-1",
                  head_row: "flex",
                  weekday:
                    "text-[var(--color-text-muted)]! rounded-md w-8 font-medium text-xs text-center",
                  row: "flex w-full mt-1",
                  cell: cn(
                    "relative p-0 text-center text-sm focus-within:relative focus-within:z-20",
                    "[&:has([aria-selected])]:bg-[var(--color-primary)]/10",
                    "[&:has([aria-selected].day-range-end)]:rounded-e-md",
                    "[&:has([aria-selected].day-range-start)]:rounded-s-md",
                    "first:[&:has([aria-selected])]:rounded-s-md",
                    "last:[&:has([aria-selected])]:rounded-e-md"
                  ),
                  day: cn(
                    "h-8 w-8 p-0 font-normal transition-[opacity,transform] duration-150 rounded-md text-xs",
                    "text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]",
                    "focus:bg-[var(--color-primary)]/20 focus:text-[var(--color-text-primary)]"
                  ),
                  day_range_start: "day-range-start rounded-l-full bg-[var(--color-primary)] text-white shadow-lg shadow-[var(--color-primary)]/20",
                  day_range_end: "day-range-end rounded-r-full bg-[var(--color-primary)] text-white shadow-lg shadow-[var(--color-primary)]/20",
                  day_range_middle:
                    "aria-selected:bg-[var(--color-primary)]/20 aria-selected:text-[var(--color-text-primary)] rounded-none",
                  day_selected:
                    "bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary)]/90",
                  day_today:
                    "rounded-md bg-[var(--color-primary)]/20 font-semibold text-[var(--color-text-primary)] ring-0",
                  day_outside: "text-[var(--color-text-muted)] opacity-40",
                  day_disabled:
                    "text-[var(--color-text-muted)] opacity-30 cursor-not-allowed",
                  day_hidden: "invisible",
                }}
              />
            </div>
          ) : (
 // Medium and Default sizes: Full interface with presets
            <div className="flex flex-col lg:flex-row">
              {/* Presets Sidebar - appears on start side */}
              <div
                className={cn(
                  "border-b lg:border-b-0 lg:border-e border-[var(--color-border-primary)] dark:border-[var(--color-border-glass-strong)] bg-transparent",
                  isMedium ? "w-full lg:w-32" : "w-full lg:w-40"
                )}
              >
                <div className={cn("p-3 space-y-1.5", isMedium && "p-2")}>
                  <h4
                    className={cn(
                      "font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-8",
                      isMedium ? "text-xs" : "text-xs"
                    )}
                  >
                    {t.quickSelect}
                  </h4>
                  <div
                    className={cn(
                      "gap-1.5",
                      isMedium
                        ? "grid grid-cols-2 lg:grid-cols-1"
                        : "grid grid-cols-2 lg:grid-cols-1"
                    )}
                  >
                    {presetOptions.map((preset) => {
                      const isActive = activePreset === preset.label;
                      return (
                        <button
                          key={preset.label}
                          onClick={() => handlePresetSelect(preset)}
                          className={cn(
                            "w-full text-start rounded-md transition-all duration-150",
                            "border border-transparent",
                            isMedium
                              ? "px-2 py-1.5 text-xs"
                              : "px-3 py-2.5 text-sm",
                            isActive
                              ? "bg-[var(--color-primary)]/75 text-white font-medium border-[var(--color-primary)]/20 shadow-lg shadow-[var(--color-primary)]/20"
                              : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
                          )}
                        >
                          {preset.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Calendar and Date Range Display */}
              <div className="flex-1">
                {/* Date Range Header with Visual Path - Hide in medium size */}
                {!isMedium && (
                  <div className="px-4 py-3 border-b border-[var(--color-border-primary)] dark:border-[var(--color-border-glass)] bg-transparent">
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                      <div className="flex-1 w-full sm:w-auto">
                        <label className="text-xs font-medium text-[var(--color-text-muted)] mb-8">
                          {t.from}
                        </label>
                        <div className="px-3 py-2 rounded-md border border-[var(--color-border-secondary)] dark:border-[var(--color-border-glass)] bg-[var(--color-bg-card)] dark:bg-[var(--color-bg-glass)] dark:backdrop-blur-[var(--glass-blur)] text-sm font-semibold text-[var(--color-text-primary)]">
                          {selectedDate?.from
                            ? format(selectedDate.from, "dd MMM yyyy")
                            : t.selectDate}
                        </div>
                      </div>

                      {/* Visual Path/Connector */}
                      <div className="flex items-center justify-center pt-0 sm:pt-5">
                        <div className="flex items-center gap-2 rotate-90 sm:rotate-0">
                          <div className="w-4 h-[2px] bg-[var(--color-border-secondary)] rounded-full"></div>
                          <ArrowRightIcon className="h-4 w-4 text-[var(--color-text-muted)] rtl-nav-arrow" />
                          <div className="w-4 h-[2px] bg-[var(--color-border-secondary)] rounded-full"></div>
                        </div>
                      </div>

                      <div className="flex-1 w-full sm:w-auto">
                        <label className="text-xs font-medium text-[var(--color-text-muted)] mb-8">
                          {t.to}
                        </label>
                        <div className="px-3 py-2 rounded-md border border-[var(--color-border-secondary)] dark:border-[var(--color-border-glass)] bg-[var(--color-bg-card)] dark:bg-[var(--color-bg-glass)] dark:backdrop-blur-[var(--glass-blur)] text-sm font-semibold text-[var(--color-text-primary)]">
                          {selectedDate?.to
                            ? format(selectedDate.to, "dd MMM yyyy")
                            : t.selectDate}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Calendar */}
                <div className={cn("p-1", isMedium && "p-1")}>
                  <Calendar
                    initialFocus
                    mode="range"
                    defaultMonth={selectedDate?.from || new Date()}
                    selected={selectedDate}
                    onSelect={handleDateSelect}
                    showOutsideDays={false}
                    numberOfMonths={isMedium || isMobile ? 1 : 2}
                    className="bg-[var(--color-bg-card)] dark:bg-transparent"
                    classNames={{
                      months: isMedium
                        ? "flex flex-col justify-center"
                        : "flex flex-col justify-center sm:flex-row flex-wrap gap-4",
                      month: "space-y-3",
                      caption: "flex justify-center pt-1 relative items-center",
                      caption_label:
                        "text-sm font-semibold text-[var(--color-text-primary)]",
                      nav: "flex items-center justify-center w-full mt-2",
                      nav_button: cn(
                        "h-9 w-9 bg-transparent p-0 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]",
                      ),
                      table: "w-full border-collapse space-y-1",
                      head_row: "flex",
                      weekday:
                        "text-[var(--color-text-muted)]! rounded-md w-9 font-medium text-[0.8rem] text-center",
                      row: "flex w-full mt-2",
                      cell: cn(
                        "relative p-0 text-center text-sm focus-within:relative focus-within:z-20",
                        "[&:has([aria-selected])]:bg-[var(--color-primary)]/10",
                        "[&:has([aria-selected].day-range-end)]:rounded-e-md",
                        "[&:has([aria-selected].day-range-start)]:rounded-s-md",
                        "first:[&:has([aria-selected])]:rounded-s-md",
                        "last:[&:has([aria-selected])]:rounded-e-md"
                      ),
                      day: cn(
                        "h-9 w-9 p-0 font-normal transition-[opacity,transform] duration-150 rounded-md",
                        "text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]",
                        "focus:bg-[var(--color-primary)]/20 focus:text-[var(--color-text-primary)]"
                      ),
                      day_range_start: "day-range-start rounded-l-full bg-[var(--color-primary)] text-white shadow-lg shadow-[var(--color-primary)]/20",
                      day_range_end: "day-range-end rounded-r-full bg-[var(--color-primary)] text-white shadow-lg shadow-[var(--color-primary)]/20",
                      day_range_middle:
                        "aria-selected:bg-[var(--color-primary)]/20 aria-selected:text-[var(--color-text-primary)] rounded-none",
                      day_selected:
                        "bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary)]/90",
                      day_today:
                        "bg-[var(--color-bg-secondary)] dark:bg-[var(--color-bg-glass)] dark:backdrop-blur-[var(--glass-blur)] text-[var(--color-text-primary)] font-semibold ring-1 ring-[var(--color-primary)]/30",
                      day_outside: "text-[var(--color-text-muted)] opacity-40",
                      day_disabled:
                        "text-[var(--color-text-muted)] opacity-30 cursor-not-allowed",
                      day_hidden: "invisible",
                    }}
                  />
                </div>

                {/* Action Buttons - Simplified for medium size */}
                <div
                  className={cn(
                    "border-t border-[var(--color-border-primary)] dark:border-[var(--color-border-glass-strong)] bg-transparent flex justify-between items-center",
                    isMedium ? "px-3 py-2" : "px-4 py-3"
                  )}
                >
                  <div
                    className={cn(
                      "text-[var(--color-text-muted)]",
                      isMedium ? "text-xs" : "text-xs"
                    )}
                  >
                    {selectedDate?.from && selectedDate?.to && (
                      <span>
                        {Math.ceil(
                          (selectedDate.to.getTime() -
                            selectedDate.from.getTime()) /
                          (1000 * 60 * 60 * 24)
                        ) + 1}{" "}
                        {t.daysSelected}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      size={isMedium ? "sm" : "sm"}
                      onClick={() => setOpen(false)}
                      style={{ border: 'none !important' }}
                      className={cn(
                        "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] border-0 shadow-none ring-0",
                        isMedium ? "px-3" : "px-4"
                      )}
                    >
                      {t.cancel}
                    </Button>
                    <Button
                      size={isMedium ? "sm" : "sm"}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "bg-[var(--color-primary)] text-[var(--color-text-primary)] hover:bg-[var(--color-primary)]/90",
                        isMedium ? "px-3" : "px-4"
                      )}
                    >
                      {t.apply}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
