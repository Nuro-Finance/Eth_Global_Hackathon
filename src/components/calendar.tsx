"use client";

import * as React from "react";
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "lucide-react";
import {
  DayButton,
  DayPicker,
  getDefaultClassNames,
  type DropdownProps,
} from "react-day-picker";
import { useLocale } from "next-intl";
import { ar, enUS } from "date-fns/locale";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Select as RadixSelect,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

// Map locale codes to date-fns locales
const dateFnsLocales: Record<string, typeof enUS> = {
  ar: ar,
  en: enUS,
};

function isRtlLocale(locale: string) {
  return (
    locale.toLowerCase() === "ar" || locale.toLowerCase().startsWith("ar-")
  );
}

function getDateFnsLocale(locale: string) {
  if (isRtlLocale(locale)) return ar;
  return dateFnsLocales[locale] || enUS;
}

function CalendarDropdown({
  options,
  value,
  onChange,
  disabled,
  className,
  style,
  ...props
}: DropdownProps) {
  const selectedValue = value == null ? undefined : String(value);
  const selectedOption = options?.find(
    (option) => String(option.value) === selectedValue
  );

  const [portalContainer, setPortalContainer] =
    React.useState<HTMLElement | null>(null);

  const bindTriggerRef = React.useCallback((node: HTMLButtonElement | null) => {
    setPortalContainer(
      node
        ? (node.closest('[data-slot="popover-content"]') as HTMLElement | null)
        : null
    );
  }, []);

  return (
    <RadixSelect
      value={selectedValue}
      disabled={disabled}
      onValueChange={(nextValue) => {
        onChange?.({
          target: { value: nextValue },
        } as unknown as React.ChangeEvent<HTMLSelectElement>);
      }}
    >
      <SelectTrigger
        ref={bindTriggerRef}
        aria-label={props["aria-label"]}
        className={cn(
          "h-7 w-auto min-w-[3.25rem] gap-0.5 rounded-[var(--radius-sm)] border border-white/10 bg-white/[0.04] px-2 py-0 text-xs font-medium text-[var(--color-text-primary)] shadow-none",
          "hover:bg-white/[0.09] data-[state=open]:bg-white/[0.09]",
          "focus:ring-0 focus:ring-offset-0 focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/25",
          "sm:min-w-[4rem] sm:px-2.5 sm:text-sm",
          className
        )}
        style={style}
      >
        <SelectValue>{selectedOption?.label}</SelectValue>
      </SelectTrigger>
      <SelectContent
        container={portalContainer ?? undefined}
        position="item-aligned"
        sideOffset={6}
        collisionPadding={8}
        className={cn(
          "z-[280] max-h-[min(17rem,60vh)] border border-white/15 bg-[rgba(18,20,28,0.97)] shadow-2xl backdrop-blur-2xl",
          "rounded-[var(--radius-md)] py-1.5 text-[var(--color-text-primary)]"
        )}
      >
        {options?.map((option) => (
          <SelectItem
            key={option.value}
            value={String(option.value)}
            disabled={option.disabled}
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </RadixSelect>
  );
}

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = "label",
  navLayout = "around",
  buttonVariant = "ghost",
  formatters,
  components,
  ...props
}: React.ComponentProps<typeof DayPicker> & {
  buttonVariant?: React.ComponentProps<typeof Button>["variant"];
}) {
  const defaultClassNames = getDefaultClassNames();
  const locale = useLocale();
  const dateFnsLocale = getDateFnsLocale(locale);
  const isRtl = isRtlLocale(locale);
  // Always render outside day cells for proper flex alignment, but hide content when showOutsideDays=false
  const hideOutsideDaysContent = !showOutsideDays;

  return (
    <DayPicker
      showOutsideDays={true}
      locale={dateFnsLocale}
      dir={isRtl ? "rtl" : "ltr"}
      className={cn(
        "bg-background group/calendar p-0 [--cell-size:--spacing(8)] [[data-slot=card-content]_&]:bg-transparent [[data-slot=popover-content]_&]:bg-transparent",
        className
      )}
      captionLayout={captionLayout}
      navLayout={navLayout}
      formatters={{
        formatMonthDropdown: (date) =>
          date.toLocaleString(locale, { month: "short" }),
        ...formatters,
      }}
      classNames={{
        root: cn("relative w-fit", defaultClassNames.root),
        months: cn("flex gap-4 flex-col md:flex-row", defaultClassNames.months),
        month: cn(
          "relative z-0 isolate flex w-full flex-col gap-2",
          defaultClassNames.month
        ),
        nav: cn(
          defaultClassNames.nav,
          "absolute top-0 inset-x-0 z-10 flex h-8 items-center justify-between px-1"
        ),
        button_previous: cn(
          buttonVariants({ variant: buttonVariant }),
          "absolute top-0 start-0 z-10 h-7 w-7 bg-transparent p-0 text-[var(--color-text-muted)] opacity-60 hover:opacity-100 hover:bg-[var(--color-bg-hover)]",
          defaultClassNames.button_previous
        ),
        button_next: cn(
          buttonVariants({ variant: buttonVariant }),
          "absolute top-0 end-0 z-10 h-7 w-7 bg-transparent p-0 text-[var(--color-text-muted)] opacity-60 hover:opacity-100 hover:bg-[var(--color-bg-hover)]",
          defaultClassNames.button_next
        ),
        month_caption: cn(
          defaultClassNames.month_caption,
          "relative z-0 flex h-8 w-full items-center justify-center mb-8"
        ),
        dropdowns: cn(
          "relative z-40 flex w-full flex-nowrap items-center justify-center gap-2 whitespace-nowrap text-sm font-medium",
          defaultClassNames.dropdowns
        ),
        dropdown_root: cn(
          defaultClassNames.dropdown_root,
          "relative flex items-center rounded-[var(--radius-sm)] border-0 bg-transparent p-0"
        ),
        dropdown: cn(
          defaultClassNames.dropdown,
          "absolute inset-0 cursor-pointer appearance-none opacity-0",
          "[color-scheme:dark]"
        ),
        caption_label: cn(
          "select-none font-medium text-[var(--color-text-primary)]",
          captionLayout === "label"
            ? "text-sm"
            : "rounded-md px-2 py-1 flex items-center gap-1 text-sm [&>svg]:text-[var(--color-text-muted)] [&>svg]:size-3.5",
          defaultClassNames.caption_label
        ),
        month_grid: cn(defaultClassNames.month_grid),
        table: cn(
          "w-full border-collapse",
          isRtl ? "[direction:rtl]" : "[direction:ltr]"
        ),
        weekdays: cn("flex", defaultClassNames.weekdays),
        weekday: cn(
          "text-muted-foreground rounded-md flex-1 font-normal text-[0.8rem] select-none",
          defaultClassNames.weekday
        ),
        week: cn("flex w-full mt-2", defaultClassNames.week),
        week_number_header: cn(
          "select-none w-(--cell-size)",
          defaultClassNames.week_number_header
        ),
        week_number: cn(
          "text-[0.8rem] select-none text-muted-foreground",
          defaultClassNames.week_number
        ),
        day: cn(
          "relative w-full h-full p-0 text-center group/day aspect-square select-none",
          "[&:has([data-selected])]:bg-[var(--color-primary)]/20",
          "[&:has([data-range-start])]:bg-[var(--color-primary)]/20 [&:has([data-range-start])]:rounded-l-full",
          "[&:has([data-range-end])]:bg-[var(--color-primary)]/20 [&:has([data-range-end])]:rounded-r-full",
          "[&:has([data-range-middle])]:bg-[var(--color-primary)]/20",
          "first:[&:has([aria-selected])]:rounded-l-full last:[&:has([aria-selected])]:rounded-r-full",
          defaultClassNames.day
        ),
        range_start: cn(
          "rounded-s-md bg-[var(--color-primary)] text-[var(--color-text-primary)]",
          defaultClassNames.range_start
        ),
        range_middle: cn(
          "rounded-none bg-[var(--color-primary)]/15 text-[var(--color-text-primary)]",
          defaultClassNames.range_middle
        ),
        range_end: cn(
          "rounded-e-md bg-[var(--color-primary)] text-[var(--color-text-primary)]",
          defaultClassNames.range_end
        ),
        today: cn(
          "rounded-md bg-[var(--color-primary)]/20 font-medium text-[var(--color-text-primary)] ring-0",
          defaultClassNames.today
        ),
        outside: cn(
          hideOutsideDaysContent
            ? "invisible pointer-events-none"
            : "text-muted-foreground aria-selected:text-muted-foreground",
          defaultClassNames.outside
        ),
        disabled: cn(
          "text-muted-foreground opacity-50",
          defaultClassNames.disabled
        ),
        hidden: cn("invisible", defaultClassNames.hidden),
        ...classNames,
      }}
      components={{
        Root: ({ className, rootRef, ...props }) => {
          return (
            <div
              data-slot="calendar"
              ref={rootRef}
              className={cn(className)}
              {...props}
            />
          );
        },
        Chevron: ({ className, orientation, ...props }) => {
          if (orientation === "left") {
            return (
              <ChevronLeftIcon
                className={cn("size-4", className)}
                style={{ transform: "none" }}
                {...props}
              />
            );
          }

          if (orientation === "right") {
            return (
              <ChevronRightIcon
                className={cn("size-4", className)}
                style={{ transform: "none" }}
                {...props}
              />
            );
          }

          return (
            <ChevronDownIcon className={cn("size-4", className)} {...props} />
          );
        },
        DayButton: CalendarDayButton,
        Dropdown: CalendarDropdown,
        WeekNumber: ({ children, ...props }) => {
          return (
            <td {...props}>
              <div className="flex size-(--cell-size) items-center justify-center text-center">
                {children}
              </div>
            </td>
          );
        },
        ...components,
      }}
      {...props}
    />
  );
}

function CalendarDayButton({
  className,
  day,
  modifiers,
  ...props
}: React.ComponentProps<typeof DayButton>) {
  const defaultClassNames = getDefaultClassNames();

  const ref = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus();
  }, [modifiers.focused]);

  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon"
      data-day={day.date.toLocaleDateString()}
      data-selected-single={
        modifiers.selected &&
        !modifiers.range_start &&
        !modifiers.range_end &&
        !modifiers.range_middle
      }
      data-selected={modifiers.selected}
      data-today={modifiers.today}
      data-range-start={modifiers.range_start}
      data-range-end={modifiers.range_end}
      data-range-middle={modifiers.range_middle}
      className={cn(
        "data-[selected-single=true]:bg-[var(--color-primary)] data-[selected-single=true]:text-[var(--color-text-primary)]",
        "data-[range-start=true]:bg-[var(--color-primary)] data-[range-start=true]:text-white data-[range-start=true]:rounded-s-full",
        "data-[range-end=true]:bg-[var(--color-primary)] data-[range-end=true]:text-white data-[range-end=true]:rounded-e-full",
        "data-[range-middle=true]:bg-transparent data-[range-middle=true]:text-[var(--color-text-primary)]",
        "hover:!bg-white/[0.12] data-[selected=true]:hover:!bg-transparent data-[selected=true]:hover:text-white",
        "group-data-[focused=true]/day:border-ring group-data-[focused=true]/day:ring-ring/50",
        "flex aspect-square size-auto w-full min-w-[2rem] flex-col gap-1 leading-none font-normal",
        "group-data-[focused=true]/day:relative group-data-[focused=true]/day:z-10 group-data-[focused=true]/day:ring-2",
        defaultClassNames.day,
        className
      )}
      {...props}
    />
  );
}

export { Calendar, CalendarDayButton };
